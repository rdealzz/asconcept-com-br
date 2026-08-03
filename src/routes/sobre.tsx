import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Prose } from "@/components/PageShell";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre a A&S Conccept — The New Era of Heritage" },
      {
        name: "description",
        content:
          "Conheça a A&S Conccept: curadoria de peças atemporais, tecidos nobres e séries limitadas para uma nova geração que veste herança com naturalidade.",
      },
      { property: "og:title", content: "Sobre a A&S Conccept" },
      {
        property: "og:description",
        content: "Curadoria, qualidade e séries limitadas — a nova era da herança.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SobrePage,
});

function SobrePage() {
  return (
    <PageShell
      eyebrow="Nossa História"
      title="Sobre a A&S Conccept"
      intro="The New Era of Heritage — herança reinterpretada para quem constrói a própria história."
    >
      <Prose>
        <p>
          A A&amp;S Conccept nasceu de uma inquietação simples: por que vestir bem virou
          sinônimo de excesso? Escolhemos o caminho oposto. Cada peça do nosso catálogo passa
          por uma curadoria criteriosa — tecido, caimento, costura e durabilidade são avaliados
          antes de qualquer decisão estética.
        </p>
        <p>
          Trabalhamos em séries curtas, propositalmente. Preferimos poucas peças certas a uma
          vitrine infinita. É por isso que muitos dos nossos modelos chegam ao fim do estoque
          sem reposição: eles foram feitos para um momento, e não para uma temporada inteira.
        </p>
      </Prose>
      <Prose title="Para quem fazemos">
        <p>
          Para um público jovem e sofisticado, que entende elegância como discrição. Peças que
          funcionam no trabalho, no jantar e no fim de semana — sem logotipos gritando, sem
          modismos que envelhecem em três meses.
        </p>
      </Prose>
      <Prose title="O que nos guia">
        <p>
          Qualidade acima de volume. Transparência no preço e no prazo. Atendimento direto, de
          pessoa para pessoa — você fala com quem realmente cuida do seu pedido.
        </p>
      </Prose>
    </PageShell>
  );
}
