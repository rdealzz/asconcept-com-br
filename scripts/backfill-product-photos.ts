/**
 * Migra as fotos que ainda estão como base64 dentro da tabela de produtos para
 * o bucket `product-photos`.
 *
 * Roda uma vez, depois da migração que cria o bucket:
 *
 *   bun add -d sharp
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun scripts/backfill-product-photos.ts
 *
 * `sharp` fica de fora do package.json de propósito: é uma dependência nativa
 * pesada, e isto aqui roda uma vez na vida — não vale prendê-la ao install de
 * todo mundo. Depois do backfill dá para removê-la com `bun remove sharp`.
 *
 * Aceita `--dry-run` para listar o que faria sem escrever nada. Vale rodar
 * assim antes, para conferir o tamanho do estrago sem tocar em nada.
 *
 * É idempotente: o que já é URL é pulado. Uma foto quebrada não derruba o lote
 * — ela fica como está e o resumo no fim aponta a peça, para dar para olhar à
 * mão depois.
 *
 * Usa a chave de serviço porque escreve no Storage e na tabela sem sessão de
 * admin no navegador. Ela vem do ambiente e nunca é gravada em disco.
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "product-photos";
const WIDTHS = [480, 1000, 1600] as const;
const CANONICAL = 1000;
const CACHE_CONTROL = "31536000";

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.\n" +
      "As duas estão no painel do Supabase, em Project Settings → API.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("apikey", SERVICE_ROLE_KEY);
      return fetch(input, { ...init, headers });
    },
  },
});

const isDataUrl = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:");

/** Sobe as três larguras de uma foto e devolve a URL pública da canônica. */
async function migrarFoto(dataUrl: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const original = Buffer.from(base64, "base64");
  const meta = await sharp(original).metadata();
  const ladoMaior = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (!ladoMaior) throw new Error("imagem sem dimensões legíveis");

  const pasta = crypto.randomUUID();
  let caminhoCanonico: string | null = null;

  for (const width of WIDTHS) {
    // Mesma regra do envio pelo painel: nada de esticar a foto além do
    // original, mas a canônica sempre existe — é ela que vai para o banco.
    if (width > ladoMaior && width !== CANONICAL) continue;

    const webp = await sharp(original)
      .resize({ width, height: width, fit: "inside", withoutEnlargement: width !== CANONICAL })
      .webp({ quality: 82 })
      .toBuffer();

    const caminho = `${pasta}/${width}.webp`;
    if (!DRY_RUN) {
      const { error } = await supabase.storage.from(BUCKET).upload(caminho, webp, {
        cacheControl: CACHE_CONTROL,
        contentType: "image/webp",
        upsert: false,
      });
      if (error) {
        if (width === CANONICAL) throw error;
        console.warn(`    variante ${width} falhou: ${error.message}`);
        continue;
      }
    }
    if (width === CANONICAL) caminhoCanonico = caminho;
  }

  if (!caminhoCanonico) throw new Error("variante principal não subiu");
  return supabase.storage.from(BUCKET).getPublicUrl(caminhoCanonico).data.publicUrl;
}

async function main() {
  console.log(DRY_RUN ? "Simulação (nada será gravado).\n" : "Migrando fotos para o Storage.\n");

  const { data, error } = await supabase
    .from("products")
    .select("id,name,image,gallery")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Não foi possível ler os produtos:", error.message);
    process.exit(1);
  }

  const produtos = data ?? [];
  let migradas = 0;
  const comFalha: string[] = [];

  for (const p of produtos) {
    const galeria: unknown[] = Array.isArray(p.gallery) ? p.gallery : [];
    // A capa entra na galeria quando ainda não está lá, para as duas colunas
    // saírem apontando para o mesmo objeto no bucket em vez de subir a mesma
    // foto duas vezes.
    const fontes: string[] = galeria.filter((g): g is string => typeof g === "string");
    if (typeof p.image === "string" && p.image && !fontes.includes(p.image)) {
      fontes.unshift(p.image);
    }

    if (!fontes.some(isDataUrl)) {
      console.log(`· ${p.name}: já migrada`);
      continue;
    }

    console.log(`· ${p.name}`);
    const traduzidas = new Map<string, string>();
    let falhou = false;

    for (const src of fontes) {
      if (!isDataUrl(src) || traduzidas.has(src)) continue;
      try {
        const url = await migrarFoto(src);
        traduzidas.set(src, url);
        migradas++;
        console.log(`    ${Math.round(src.length / 1024)} KB em base64 → ${url}`);
      } catch (err) {
        falhou = true;
        console.warn(`    falhou: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (falhou) comFalha.push(p.name);
    if (!traduzidas.size) continue;

    const troca = (v: string) => traduzidas.get(v) ?? v;
    const novaGaleria = fontes.map(troca);
    const novaCapa = typeof p.image === "string" && p.image ? troca(p.image) : p.image;

    if (DRY_RUN) continue;

    const { error: erroUpdate } = await supabase
      .from("products")
      .update({ image: novaCapa, gallery: novaGaleria })
      .eq("id", p.id);

    if (erroUpdate) {
      comFalha.push(p.name);
      console.warn(`    não deu para gravar as URLs: ${erroUpdate.message}`);
    }
  }

  console.log(`\n${migradas} foto(s) migrada(s) em ${produtos.length} peça(s).`);
  if (comFalha.length) {
    console.log(`Peças com pendência: ${[...new Set(comFalha)].join(", ")}`);
    process.exit(1);
  }
}

await main();
