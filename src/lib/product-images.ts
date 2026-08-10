import { supabase } from "@/integrations/supabase/client";

/**
 * Fotos de produto: envio para o Storage e escolha de tamanho na hora de exibir.
 *
 * Antes as fotos eram gravadas como data URL base64 dentro da linha do produto.
 * Isso fazia a vitrine baixar todas as capas dentro de um único JSON não
 * cacheável, antes de qualquer <img> existir — era o que segurava as fotos para
 * aparecer. Agora cada foto é arquivo no bucket `product-photos`, servido pela
 * CDN com cache longo.
 *
 * Em vez de pedir redimensionamento ao servidor na hora de exibir (o endpoint
 * de transformação do Supabase é recurso de plano pago), as variantes são
 * geradas aqui mesmo, no navegador do admin, na hora do envio. O caminho no
 * bucket é previsível — `<uuid>/<largura>.webp` — então o `srcset` sai da
 * própria URL, sem consulta extra.
 *
 * Nada aqui pode quebrar as fotos antigas: enquanto o backfill não roda, o
 * banco ainda tem base64 e caminhos como `/products/product-1.jpg`. Toda função
 * de leitura devolve a entrada intocada quando não reconhece o formato novo.
 */

const BUCKET = "product-photos";

/** Larguras geradas no envio, do maior lado da foto. */
export const IMAGE_WIDTHS = [480, 1000, 1600] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

/** Variante gravada no banco. As outras são derivadas dela na exibição. */
const CANONICAL_WIDTH: ImageWidth = 1000;

/** Um ano. As variantes nunca são reescritas: nome novo a cada envio. */
const CACHE_CONTROL = "31536000";

/** `.../product-photos/<uuid>/<largura>.webp` */
const VARIANT_URL = /^(https?:\/\/.*\/product-photos\/[^?#]+)\/(\d+)\.webp$/;

/** Só URL http(s) serve para meta tag: data URL em og:image incha o HTML. */
export function isRemoteImage(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

/**
 * URL da foto na largura pedida.
 *
 * Cai para a entrada original quando a foto não está no bucket (base64 antigo,
 * arquivo em /products, ou qualquer coisa que não reconheçamos).
 */
export function productImageSrc(url: string | null | undefined, width: ImageWidth): string {
  if (!url) return "";
  const m = VARIANT_URL.exec(url);
  return m ? `${m[1]}/${width}.webp` : url;
}

/**
 * `srcset` com todas as variantes, para o navegador escolher pela densidade de
 * tela e pelo `sizes`. Vazio para foto fora do bucket — aí o `src` sozinho
 * resolve.
 */
export function productImageSrcSet(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const m = VARIANT_URL.exec(url);
  if (!m) return undefined;
  return IMAGE_WIDTHS.map((w) => `${m[1]}/${w}.webp ${w}w`).join(", ");
}

/* ---------- envio ---------- */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    el.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Falha ao ler o arquivo."));
    r.readAsDataURL(file);
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Recomprime a foto na largura pedida.
 *
 * Devolve `null` quando a variante ficaria maior que o original — não faz
 * sentido subir um arquivo esticado. Navegador sem WebP devolve PNG no
 * `toBlob`, que costuma ser maior que a foto original; nesse caso tenta JPEG.
 */
async function encodeVariant(
  img: HTMLImageElement,
  targetEdge: number,
): Promise<{ blob: Blob; ext: "webp" | "jpg"; mime: string } | null> {
  const longEdge = Math.max(img.width, img.height);
  if (longEdge === 0) return null;

  const scale = Math.min(1, targetEdge / longEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const webp = await canvasToBlob(canvas, "image/webp", 0.82);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp", mime: "image/webp" };

  const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.85);
  if (jpeg) return { blob: jpeg, ext: "jpg", mime: "image/jpeg" };
  return null;
}

/**
 * Envia a foto escolhida no painel e devolve a URL pública para gravar no banco.
 *
 * Sobe as três larguras de uma vez. A menor delas é o que a grade e as
 * miniaturas passam a baixar, em vez da foto inteira — é daí que vem a maior
 * parte do ganho na primeira visita.
 *
 * Se uma largura não puder ser gerada (foto menor que ela, ou canvas
 * indisponível), a variante é pulada: `productImageSrc` continua devolvendo uma
 * URL válida porque o Storage serve o que existir, e o `srcset` só é honrado
 * para as variantes que o navegador conseguir baixar. Por isso a canônica
 * (1000) tem tratamento próprio e é obrigatória.
 */
export async function uploadProductPhoto(file: File): Promise<string> {
  const img = await loadImage(await readAsDataUrl(file));
  const folder = crypto.randomUUID();

  // Todas as larguras sempre sobem. Pular a maior quando a foto original é
  // menor deixava `1600.webp` inexistente — e tanto o `srcset` quanto o zoom da
  // página do produto pedem exatamente esse arquivo, então a peça aparecia
  // quebrada em tela retina. `encodeVariant` nunca amplia (escala <= 1), logo a
  // variante "1600" de uma foto de 1400px é só a própria foto: o nome é um
  // rótulo de slot, não uma promessa de pixels.
  const widths = IMAGE_WIDTHS;

  let canonicalPath: string | null = null;

  for (const width of widths) {
    const variant = await encodeVariant(img, width);
    if (!variant) continue;

    // A extensão no caminho é sempre .webp para o padrão de URL continuar
    // previsível; o mime real vai no contentType. Só um navegador sem WebP
    // grava JPEG aqui, e o Storage serve pelo contentType, não pelo nome.
    const path = `${folder}/${width}.webp`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, variant.blob, {
      cacheControl: CACHE_CONTROL,
      contentType: variant.mime,
      upsert: false,
    });
    if (error) {
      // A canônica é a que vai para o banco: sem ela, não há foto.
      if (width === CANONICAL_WIDTH) throw error;
      console.error("[fotos] variante falhou", width, error);
      continue;
    }
    if (width === CANONICAL_WIDTH) canonicalPath = path;
  }

  if (!canonicalPath) throw new Error("Não foi possível processar esta foto.");

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(canonicalPath);
  return data.publicUrl;
}
