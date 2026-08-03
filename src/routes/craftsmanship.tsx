import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Prose } from "@/components/PageShell";

export const Route = createFileRoute("/craftsmanship")({
  head: () => ({
    meta: [
      { title: "Craftsmanship — A&S Conccept" },
      {
        name: "description",
        content:
          "Como cada peça A&S Conccept é feita: seleção de tecidos, modelagem, costura e controle de qualidade em séries curtas.",
      },
      { property: "og:title", content: "Craftsmanship — A&S Conccept" },
      {
        property: "og:description",
        content: "Tecidos nobres, modelagem precisa e séries curtas. O ofício por trás de cada peça.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CraftsmanshipPage,
});

function CraftsmanshipPage() {
  return (
    <PageShell
      eyebrow="O Ofício"
      title="Craftsmanship"
      intro="Nada aqui é feito no automático. Cada etapa existe porque melhora a peça que chega até você."
    >
      <Prose title="A escolha do tecido">
        <p>
          Tudo começa pelo material. Priorizamos fibras naturais e misturas de alta densidade —
          linho lavado, algodão de fibra longa, lã fria — testados quanto a caimento, resistência
          à lavagem e conforto térmico. Se o tecido não passa nesse teste, o modelo não existe.
        </p>
      </Prose>
      <Prose title="Modelagem e prova">
        <p>
          Cada modelagem passa por pelo menos três provas em corpos reais antes de ir para
          produção. Ajustamos ombro, cava e comprimento até que a peça caia bem parada e em
          movimento — não apenas na foto.
        </p>
      </Prose>
      <Prose title="Costura e acabamento">
        <p>
          Trabalhamos com ateliês parceiros que costuram em pequenos lotes. Acabamentos internos,
          reforço em pontos de tensão e aviamentos discretos fazem parte do padrão, mesmo onde
          ninguém vê.
        </p>
      </Prose>
      <Prose title="Controle de qualidade">
        <p>
          Toda peça é conferida individualmente antes do envio: alinhamento de costura, ausência
          de fios soltos, medidas dentro da tabela e embalagem cuidadosa. O que não passa, não sai.
        </p>
      </Prose>
    </PageShell>
  );
}
