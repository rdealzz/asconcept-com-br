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
      const { rowToProduct, coerceSizeStock, LIST_COLUMNS } = await import("@/lib/catalog-context");

      // As mesmas colunas da vitrine — de propósito sem `gallery`. O que sai
      // daqui só alimenta o título e a prévia do link, que precisam da capa e
      // de mais nada; puxar a galeria inteira era carregar as outras quatro
      // fotos da peça no servidor para jogá-las fora. A galeria chega no
      // navegador por `loadGallery`, como na home.
      const { data: row, error } = await supabase
        .from("products")
        .select(LIST_COLUMNS)
        .eq("id", data.id)
        .maybeSingle();

      if (error) {
        console.error("[catalog] getProductById failed", error);
        return null;
      }
      if (!row) return null;

      const productRow = row as ProductRow;
      return {
        product: rowToProduct(productRow),
        stock: coerceSizeStock(productRow.sizes),
      };
    } catch (err) {
      console.error("[catalog] getProductById threw", err);
      return null;
    }
  });
