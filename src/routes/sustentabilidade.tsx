import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Prose } from "@/components/PageShell";

export const Route = createFileRoute("/sustentabilidade")({
  head: () => ({
    meta: [
      { title: "Sustentabilidade — A&S Conccept" },
      {
        name: "description",
        content:
          "Séries curtas, fibras naturais e embalagem responsável: como a A&S Conccept produz menos e melhor.",
      },
      { property: "og:title", content: "Sustentabilidade — A&S Conccept" },
      {
        property: "og:description",
        content: "Produzir menos e melhor: nossa abordagem de consumo consciente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SustentabilidadePage,
});

function SustentabilidadePage() {
  return (
    <PageShell
      eyebrow="Compromisso"
      title="Sustentabilidade"
      intro="A roupa mais sustentável é aquela que você usa por anos. É por isso que produzimos pouco e com critério."
    >
      <Prose title="Séries curtas, sem sobra">
        <p>
          Lançamos poucas unidades por modelo. Isso reduz estoque parado, queima de coleção e
          desperdício de matéria-prima — e garante que a peça que você comprou não estará em
          liquidação semanas depois.
        </p>
      </Prose>
      <Prose title="Materiais de vida longa">
        <p>
          Fibras naturais e misturas duráveis envelhecem melhor do que sintéticos baratos. Nosso
          critério de escolha é simples: o tecido precisa continuar bonito depois de dezenas de
          lavagens.
        </p>
      </Prose>
      <Prose title="Embalagem responsável">
        <p>
          Enviamos com o mínimo de material necessário para proteger a peça, priorizando papel e
          caixas recicláveis. Sem plástico decorativo, sem camadas supérfluas.
        </p>
      </Prose>
      <Prose title="Cuidado e reparo">
        <p>
          Cada peça acompanha orientações de lavagem para prolongar sua vida útil. Precisou de um
          pequeno reparo ou ajuste? Fale com a gente — orientamos o melhor caminho antes de você
          pensar em substituir.
        </p>
      </Prose>
    </PageShell>
  );
}
