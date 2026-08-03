import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Prose } from "@/components/PageShell";
import { SUPPORT_EMAIL } from "@/components/WhatsAppFab";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos e Condições — A&S Conccept" },
      {
        name: "description",
        content:
          "Termos e condições de compra da A&S Conccept: preços, prazos de processamento, envio, trocas, cancelamento e uso do site.",
      },
      { property: "og:title", content: "Termos e Condições — A&S Conccept" },
      {
        property: "og:description",
        content: "Regras de compra, pagamento, envio e cancelamento da A&S Conccept.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermosPage,
});

function TermosPage() {
  return (
    <PageShell
      eyebrow="Documento Legal"
      title="Termos e Condições"
      intro="Ao comprar na A&S Conccept, você concorda com as condições descritas abaixo."
    >
      <Prose title="Preços e pagamento">
        <p>
          Todos os preços são apresentados em Reais (BRL) e podem ser atualizados sem aviso
          prévio; vale sempre o valor exibido no momento da finalização do pedido. Os pagamentos
          são processados pelo Mercado Pago, em cartão de crédito ou Pix. O pedido só é
          confirmado após a aprovação do pagamento.
        </p>
      </Prose>
      <Prose title="Processamento e envio">
        <p>
          Pedidos aprovados são separados e despachados em até 2 dias úteis. O prazo de entrega
          depende do CEP e é informado no checkout. Enviamos por transportadora com rastreio, e
          o código é disponibilizado em "Meus Pedidos" e por e-mail.
        </p>
      </Prose>
      <Prose title="Disponibilidade das peças">
        <p>
          Trabalhamos com séries limitadas. Caso um item se esgote entre o pedido e a
          separação, entramos em contato para oferecer a troca por outra peça ou o reembolso
          integral.
        </p>
      </Prose>
      <Prose title="Trocas e cancelamento">
        <p>
          Aplicam-se as condições descritas na página de Trocas e Devoluções, incluindo o
          direito de arrependimento de 7 dias corridos previsto no Código de Defesa do
          Consumidor.
        </p>
      </Prose>
      <Prose title="Uso do site e contato">
        <p>
          O conteúdo, as imagens e a identidade visual do site são de propriedade da A&amp;S
          Conccept e não podem ser reproduzidos sem autorização. Dúvidas sobre estes termos
          podem ser enviadas para {SUPPORT_EMAIL}. Este documento é regido pela legislação
          brasileira.
        </p>
      </Prose>
    </PageShell>
  );
}
