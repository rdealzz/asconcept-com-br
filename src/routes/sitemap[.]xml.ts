import { createFileRoute } from "@tanstack/react-router";

/**
 * O sitemap, montado a partir do catálogo.
 *
 * Ele era um arquivo estático em `public/` com dez páginas institucionais e
 * nenhum produto. Como a vitrine só existe depois que o JavaScript roda, as
 * páginas que de fato vendem dependiam inteiramente de o robô renderizar a
 * página para serem descobertas — e essa é a parte que o Google faz por último,
 * quando faz. Uma peça nova podia levar semanas para aparecer na busca.
 *
 * Aqui ele nasce a cada requisição, direto do banco: peça cadastrada hoje está
 * no sitemap hoje, sem publicar nada.
 *
 * A leitura usa a chave publicável, e não a de serviço: produto é dado público
 * (o próprio navegador do visitante já faz essa mesma leitura), então não há
 * motivo para passar por cima da RLS.
 *
 * Nunca derruba a resposta: se o banco não responder, sai o sitemap com as
 * páginas fixas em vez de um erro 500. Sitemap incompleto o Google relê amanhã;
 * sitemap que devolve erro ele para de pedir.
 */

const CACHE = "public, max-age=3600, s-maxage=21600";

/** Páginas que existem independentemente do catálogo. */
const PAGINAS_FIXAS: Array<{ caminho: string; freq: string; prioridade: string }> = [
  { caminho: "/", freq: "daily", prioridade: "1.0" },
  { caminho: "/sobre", freq: "monthly", prioridade: "0.7" },
  { caminho: "/craftsmanship", freq: "monthly", prioridade: "0.6" },
  { caminho: "/sustentabilidade", freq: "monthly", prioridade: "0.6" },
  { caminho: "/envio", freq: "monthly", prioridade: "0.6" },
  { caminho: "/trocas", freq: "monthly", prioridade: "0.6" },
  { caminho: "/ajustes", freq: "monthly", prioridade: "0.6" },
  { caminho: "/faq", freq: "monthly", prioridade: "0.6" },
  { caminho: "/termos", freq: "yearly", prioridade: "0.3" },
  { caminho: "/privacidade", freq: "yearly", prioridade: "0.3" },
];

type LinhaSitemap = {
  caminho: string;
  freq: string;
  prioridade: string;
  /** Data da última alteração, em ISO. Só as peças têm. */
  alterado?: string;
};

/**
 * Escapa o que a especificação do sitemap exige dentro de `<loc>`.
 *
 * O endereço de uma peça é montado com o nome dela, e nome é campo digitado no
 * painel. `slugify` já reduz tudo a letras, números e hífen — então isto é a
 * segunda tranca, para o dia em que a montagem da URL mudar.
 */
function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function linhasDoCatalogo(): Promise<LinhaSitemap[]> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { productParam } = await import("@/lib/variants");
    const { CATEGORY_SLUGS, PRODUCT_CATEGORIES, coerceCategory } = await import("@/lib/categories");
    const { totalStock } = await import("@/lib/catalog-context");
    const { coerceSizeStock } = await import("@/lib/catalog-context");

    const { data, error } = await supabase
      .from("products")
      .select("id, name, category, sizes, updated_at")
      .order("updated_at", { ascending: false });

    if (error || !data) {
      if (error) console.error("[sitemap] leitura do catálogo falhou", error);
      return [];
    }

    const linhas: LinhaSitemap[] = [];
    const categoriasComPeca = new Set<string>();

    for (const bruto of data as unknown as Array<{
      id: string;
      name: string;
      category: string;
      sizes: unknown;
      updated_at?: string | null;
    }>) {
      // Peça esgotada some da vitrine — mandar o Google para uma página que a
      // navegação da loja não alcança é criar página órfã. Ela volta ao sitemap
      // sozinha quando o estoque for reposto, porque isto é lido a cada pedido.
      if (totalStock(coerceSizeStock(bruto.sizes)) <= 0) continue;

      categoriasComPeca.add(coerceCategory(bruto.category));
      linhas.push({
        caminho: `/produto/${productParam(bruto)}`,
        freq: "weekly",
        prioridade: "0.8",
        alterado: bruto.updated_at ?? undefined,
      });
    }

    // Categoria sem nenhuma peça à venda fica de fora: é uma página que abriria
    // vazia, e vitrine vazia indexada não ajuda ninguém.
    for (const c of PRODUCT_CATEGORIES) {
      if (!categoriasComPeca.has(c)) continue;
      linhas.push({ caminho: `/${CATEGORY_SLUGS[c]}`, freq: "daily", prioridade: "0.9" });
    }

    return linhas;
  } catch (e) {
    console.error("[sitemap] falhou ao montar as linhas do catálogo", e);
    return [];
  }
}

function montarXml(linhas: readonly LinhaSitemap[], base: string): string {
  const urls = linhas
    .map(({ caminho, freq, prioridade, alterado }) => {
      const loc = escaparXml(`${base}${caminho}`);
      const lastmod = alterado ? `<lastmod>${escaparXml(alterado)}</lastmod>` : "";
      return `<url><loc>${loc}</loc>${lastmod}<changefreq>${freq}</changefreq><priority>${prioridade}</priority></url>`;
    })
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
</urlset>
`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { SITE_URL } = await import("@/lib/site");
        const linhas = [...PAGINAS_FIXAS, ...(await linhasDoCatalogo())];
        return new Response(montarXml(linhas, SITE_URL), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": CACHE,
          },
        });
      },
    },
  },
} as never);
