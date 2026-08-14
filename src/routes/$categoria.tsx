import { createFileRoute, notFound } from "@tanstack/react-router";
import { Storefront } from "./index";
import { CATEGORY_COPY, CATEGORY_LABELS, categoryFromSlug } from "@/lib/categories";
import { urlAbsoluta } from "@/lib/site";

/**
 * A vitrine de uma categoria, com endereço próprio.
 *
 * A categoria era estado de memória: trocar de aba não mudava a URL, então não
 * dava para mandar "olha os acessórios" por link, o botão voltar não desfazia a
 * escolha, e o Google não tinha o que indexar como "roupas de luxo" — só a home
 * inteira, com um título que serve para tudo e para nada.
 *
 * Uma rota dinâmica em vez de três arquivos iguais: o que muda entre elas é a
 * copy, que já mora em `@/lib/categories`. Endereço que não é de categoria cai
 * no 404 de sempre — rota dinâmica na raiz pega qualquer caminho, e responder
 * "vitrine vazia" para um endereço digitado errado seria pior do que dizer que
 * a página não existe.
 */
export const Route = createFileRoute("/$categoria")({
  head: ({ params }) => {
    const categoria = categoryFromSlug(params.categoria);
    if (!categoria) return {};

    const rotulo = CATEGORY_LABELS[categoria];
    const copy = CATEGORY_COPY[categoria];
    const title = `${rotulo} — A&S Conccept`;
    const description = copy.blurb;
    const canonical = urlAbsoluta(`/${params.categoria}`);

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: PaginaDeCategoria,
});

function PaginaDeCategoria() {
  const { categoria } = Route.useParams();
  const escolhida = categoryFromSlug(categoria);
  if (!escolhida) throw notFound();
  return <Storefront categoriaInicial={escolhida} />;
}
