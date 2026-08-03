import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Prose } from "@/components/PageShell";
import { SizeGuideTable } from "@/components/SizeGuide";

export const Route = createFileRoute("/ajustes")({
  head: () => ({
    meta: [
      { title: "Ajustes e Caimento — A&S Conccept" },
      {
        name: "description",
        content:
          "Como escolher o tamanho certo, tabela de medidas e orientações de ajuste para as peças A&S Conccept.",
      },
      { property: "og:title", content: "Ajustes e Caimento — A&S Conccept" },
      {
        property: "og:description",
        content: "Tabela de medidas e orientações para o caimento perfeito.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AjustesPage,
});

function AjustesPage() {
  return (
    <PageShell
      eyebrow="Serviço"
      title="Ajustes e Caimento"
      intro="Nossas modelagens seguem um caimento regular, com ombro alinhado e comprimento equilibrado. Aqui vão as referências para acertar de primeira."
    >
      <Prose title="Tabela de medidas">
        <SizeGuideTable />
      </Prose>
      <Prose title="Como medir">
        <p>
          Pegue uma peça que você já usa e goste do caimento, deite-a sobre uma superfície plana e
          compare com a tabela acima. Busto é medido de axila a axila; comprimento, do ponto mais
          alto do ombro até a barra.
        </p>
      </Prose>
      <Prose title="Entre dois tamanhos?">
        <p>
          Para um caimento mais próximo ao corpo, escolha o menor. Para um visual mais relaxado —
          especialmente em linho e malhas — escolha o maior. Em caso de dúvida, fale conosco pelo
          WhatsApp antes de comprar.
        </p>
      </Prose>
      <Prose title="Pequenos ajustes">
        <p>
          Barras, mangas e cintura podem ser ajustadas por uma alfaiataria de confiança sem
          comprometer a estrutura da peça. Peças ajustadas por terceiros não são elegíveis para
          troca, então recomendamos confirmar o tamanho antes de qualquer alteração.
        </p>
      </Prose>
    </PageShell>
  );
}
