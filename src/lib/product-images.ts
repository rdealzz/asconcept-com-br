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

/** Larguras geradas no envio, do maior lado da foto. */
export const IMAGE_WIDTHS = [480, 1000, 1600] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

/** Variante gravada no banco. As outras são derivadas dela na exibição. */
const CANONICAL_WIDTH: ImageWidth = 1000;

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

  // A maior variante é a que aparece no palco da vitrine e no zoom da página,
  // ampliada em tela retina — é nela que a compressão aparece primeiro, e é
  // onde o texto de uma etiqueta some. As menores são miniaturas: 0.82 ali não
  // custa nitidez visível e economiza banda em toda a grade.
  const qualidade = targetEdge >= 1600 ? 0.92 : 0.82;

  const webp = await canvasToBlob(canvas, "image/webp", qualidade);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp", mime: "image/webp" };

  const jpeg = await canvasToBlob(canvas, "image/jpeg", Math.min(0.95, qualidade + 0.03));
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
  // Import tardio: as funções acima são as que a vitrine inteira usa para
  // montar `src`/`srcset`, e elas não têm nada a ver com envio. Carregar a rota
  // de servidor só aqui mantém esse módulo utilizável (e testável) sem arrastar
  // o cliente de server functions junto.
  const { uploadProductPhotoVariant } = await import("@/lib/product-photos.functions");

  const img = await loadImage(await readAsDataUrl(file));
  const folder = crypto.randomUUID();
  let canonicalUrl: string | null = null;

  // Todas as larguras sempre sobem. Pular a maior quando a foto original é
  // menor deixava `1600.webp` inexistente — e tanto o `srcset` quanto o zoom da
  // página do produto pedem exatamente esse arquivo, então a peça aparecia
  // quebrada em tela retina. `encodeVariant` nunca amplia (escala <= 1), logo a
  // variante "1600" de uma foto de 1400px é só a própria foto: o nome é um
  // rótulo de slot, não uma promessa de pixels.
  const widths = IMAGE_WIDTHS;

  for (const width of widths) {
    const variant = await encodeVariant(img, width);
    if (!variant) continue;

    // O arquivo sobe pelo servidor, e não daqui direto para o Storage: é lá que
    // mora o service role, capaz de criar o bucket na primeira foto e de
    // escrever sem depender das policies de storage.objects — que podem não ter
    // sido criadas no ambiente (ver `@/lib/product-photos.functions`).
    try {
      const { url } = await uploadProductPhotoVariant({
        data: {
          folder,
          width,
          contentType: variant.mime,
          base64: await blobToBase64(variant.blob),
        },
      });
      if (width === CANONICAL_WIDTH) canonicalUrl = url;
    } catch (err) {
      // A canônica é a que vai para o banco: sem ela, não há foto.
      if (width === CANONICAL_WIDTH) throw err;
      console.error("[fotos] variante falhou", width, err);
    }
  }

  if (!canonicalUrl) throw new Error("Não foi possível processar esta foto.");

  return canonicalUrl;
}

/**
 * Bytes da variante em base64 puro, sem o prefixo `data:` — o que a rota de
 * envio espera. O FileReader devolve a data URL inteira; o corte é no primeiro
 * vírgula, que separa cabeçalho de conteúdo.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await readAsDataUrl(new File([blob], "variante", { type: blob.type }));
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? "" : dataUrl.slice(comma + 1);
}
