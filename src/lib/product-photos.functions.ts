import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Envio das fotos de peça pelo servidor.
 *
 * O caminho óbvio seria o navegador do admin falar direto com o Storage, e era
 * assim que estava. Só que aquilo depende de dois estados do banco que o código
 * não controla: o bucket `product-photos` precisa existir, e as policies de
 * escrita em storage.objects precisam ter sido criadas. A migração que faz as
 * duas coisas (20260807200000_product_photos_bucket.sql) não roda em todo
 * ambiente — o papel que aplica migração no Lovable Cloud não é dono do schema
 * `storage`, então a parte de policy pode falhar e o bucket nunca nascer. O
 * sintoma no painel era um "Bucket not found" (HTTP 400) a cada foto escolhida,
 * com a peça salva sem imagem.
 *
 * Aqui o envio passa pelo service role, que não responde a RLS e pode criar o
 * bucket pela própria API do Storage — sem depender de SQL privilegiado. O
 * bucket nasce público, então a leitura na vitrine continua sendo um GET
 * direto na CDN, sem policy de SELECT no meio.
 */

const BUCKET = "product-photos";

/** Mesmo teto da migração: 8 MB por arquivo. */
const FILE_SIZE_LIMIT = 8388608;

const MIME_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;

/** Larguras aceitas — espelha IMAGE_WIDTHS em `@/lib/product-images`. */
const WIDTHS = [480, 1000, 1600];

/** Um ano. Cada envio grava numa pasta nova, então nada é reescrito. */
const CACHE_CONTROL = "31536000";

/**
 * Teto do corpo da requisição. A variante já chega redimensionada e
 * recomprimida pelo navegador; base64 infla ~33% em cima disso.
 */
const MAX_BASE64_LENGTH = 8 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UploadInput = {
  /** Pasta da foto no bucket: um UUID gerado no navegador. */
  folder: string;
  width: number;
  contentType: string;
  /** Bytes da variante, em base64 puro (sem prefixo `data:`). */
  base64: string;
};

export const uploadProductPhotoVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UploadInput) => {
    if (!input || typeof input !== "object") throw new Error("Envio inválido.");
    // O caminho é montado com esses dois campos; restringir ao formato esperado
    // é o que impede um `../` ou um nome arbitrário de escapar da pasta.
    if (!UUID.test(input.folder ?? "")) throw new Error("Pasta inválida.");
    if (!WIDTHS.includes(Number(input.width))) throw new Error("Largura inválida.");
    if (!(MIME_TYPES as readonly string[]).includes(input.contentType)) {
      throw new Error("Formato inválido.");
    }
    if (typeof input.base64 !== "string" || !input.base64) throw new Error("Arquivo vazio.");
    if (input.base64.length > MAX_BASE64_LENGTH) throw new Error("Imagem grande demais.");
    return {
      folder: input.folder,
      width: Number(input.width),
      contentType: input.contentType,
      base64: input.base64,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await ensureBucket(supabaseAdmin);

    const bytes = decodeBase64(data.base64);
    if (!bytes.length) throw new Error("Arquivo vazio.");

    const path = `${data.folder}/${data.width}.webp`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
      cacheControl: CACHE_CONTROL,
      contentType: data.contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message);

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, path };
  });

/**
 * Base64 → bytes. `atob` em vez de `Buffer` porque este arquivo é compilado
 * junto com o bundle do cliente (só o handler fica no servidor), e o tipo
 * global do Node não existe aqui.
 */
function decodeBase64(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Cria o bucket no primeiro envio depois de um deploy, se ele ainda não
 * existir. O resultado fica em memória para não pagar um GET a cada variante;
 * como o bucket nunca é removido pela aplicação, um processo que já viu o
 * bucket existir pode confiar nisso até reiniciar.
 */
let bucketPronto = false;

async function ensureBucket(
  admin: (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"],
): Promise<void> {
  if (bucketPronto) return;

  const { data: existente } = await admin.storage.getBucket(BUCKET);
  if (existente) {
    bucketPronto = true;
    return;
  }

  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: FILE_SIZE_LIMIT,
    allowedMimeTypes: [...MIME_TYPES],
  });

  // Duas abas do painel enviando ao mesmo tempo podem criar o bucket em
  // paralelo; o segundo recebe "already exists" e isso é sucesso, não erro.
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Não foi possível preparar o armazenamento de fotos: ${error.message}`);
  }

  bucketPronto = true;
}
