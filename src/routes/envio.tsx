import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Prose } from "@/components/PageShell";

export const Route = createFileRoute("/envio")({
  head: () => ({
    meta: [
      { title: "Envio e Prazos — A&S Conccept" },
      {
        name: "description",
        content:
          "Prazos de produção e entrega, rastreio, frete grátis acima de R$ 299,90 e como acompanhar seu pedido na A&S Conccept.",
      },
      { property: "og:title", content: "Envio e Prazos — A&S Conccept" },
      {
        property: "og:description",
        content: "Prazos, rastreio e frete grátis acima de R$ 299,90.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EnvioPage,
});

function EnvioPage() {
  return (
    <PageShell
      eyebrow="Serviço"
      title="Envio e Prazos"
      intro="Cada pedido é conferido e embalado à mão antes de sair do ateliê. Abaixo, o que esperar em cada etapa."
    >
      <Prose title="Preparação do pedido">
        <p>
          Após a confirmação do pagamento, o pedido entra na fila de conferência do ateliê. A
          separação, revisão e embalagem levam de 1 a 3 dias úteis.
        </p>
      </Prose>
      <Prose title="Prazo de entrega">
        <p>
          O prazo do transporte é calculado pelo CEP no momento da compra. Como referência:
          capitais do Sul e Sudeste costumam receber em 2 a 5 dias úteis; demais regiões, de 4 a
          10 dias úteis, após o envio.
        </p>
      </Prose>
      <Prose title="Frete grátis">
        <p>
          Pedidos acima de R$ 299,90 têm frete grátis para todo o Brasil, aplicado automaticamente
          no checkout.
        </p>
      </Prose>
      <Prose title="Rastreio e acompanhamento">
        <p>
          Você recebe um e-mail a cada mudança de status: pedido confirmado, em preparação, enviado
          e entregue. O status também fica disponível a qualquer momento na área “Meus Pedidos”.
        </p>
      </Prose>
    </PageShell>
  );
}
