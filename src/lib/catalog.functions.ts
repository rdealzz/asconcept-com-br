import { createServerFn } from "@tanstack/react-start";
import type { ProductRow } from "@/lib/catalog-context";

/**
 * Lê um produto pelo id no servidor.
 *
 * A rota de produto precisa disso porque o CatalogProvider busca o catálogo
 * no cliente (useEffect): sem um loader, o HTML do servidor sairia sem
 * título nem og:image, e o link compartilhado (WhatsApp, Instagram) não teria
 * prévia — que é justamente a razão de o produto ter rota própria.
 *
 * Usa a chave publicável, não a de service-role: produto é dado público (o
 * próprio navegador já faz essa leitura), então não há motivo para passar por
 * cima da RLS aqui.
 *
 * Nunca lança: se o banco estiver fora do ar ou sem credencial, devolve null e
 * a rota cai para o catálogo do cliente. A prévia do link é um ganho, não um
 * requisito para a página abrir.
 */
export const getProductById = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data }) => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const {
        rowToProduct,
        coerceSizeStock,
        LIST_COLUMNS,
        LIST_COLUMNS_LEGACY,
        isMissingFeaturedColumn,
      } = await import("@/lib/catalog-context");

      // As mesmas colunas da vitrine — de propósito sem `gallery`. O que sai
      // daqui só alimenta o título e a prévia do link, que precisam da capa e
      // de mais nada; puxar a galeria inteira era carregar as outras quatro
      // fotos da peça no servidor para jogá-las fora. A galeria chega no
      // navegador por `loadGallery`, como na home.
      const buscar = async (colunas: string) => {
        const res = await supabase.from("products").select(colunas).eq("id", data.id).maybeSingle();
        return res as unknown as {
          data: unknown | null;
          error: { code?: string; message?: string } | null;
        };
      };

      // Mesmo cuidado da vitrine: enquanto a migração de destaques não roda, a
      // coluna não existe e a página do produto não pode cair por causa disso.
      let { data: row, error } = await buscar(LIST_COLUMNS);
      if (isMissingFeaturedColumn(error)) {
        ({ data: row, error } = await buscar(LIST_COLUMNS_LEGACY));
      }

      if (error) {
        console.error("[catalog] getProductById failed", error);
        return null;
      }
      if (!row) return null;

      const productRow = row as unknown as ProductRow;
      return {
        product: rowToProduct(productRow),
        stock: coerceSizeStock(productRow.sizes),
      };
    } catch (err) {
      console.error("[catalog] getProductById threw", err);
      return null;
    }
  });
