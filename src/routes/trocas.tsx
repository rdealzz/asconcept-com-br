import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Prose } from "@/components/PageShell";
import { SUPPORT_EMAIL, WHATSAPP_DISPLAY, WHATSAPP_LINK } from "@/components/WhatsAppFab";

export const Route = createFileRoute("/trocas")({
  head: () => ({
    meta: [
      { title: "Trocas e Devoluções — A&S Conccept" },
      {
        name: "description",
        content:
          "Política de trocas e devoluções da A&S Conccept: 7 dias corridos de arrependimento, condições da peça e como solicitar por e-mail ou WhatsApp.",
      },
      { property: "og:title", content: "Trocas e Devoluções — A&S Conccept" },
      {
        property: "og:description",
        content: "7 dias corridos para arrependimento, conforme o Código de Defesa do Consumidor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrocasPage,
});

function TrocasPage() {
  return (
    <PageShell
      eyebrow="Política"
      title="Trocas e Devoluções"
      intro="Queremos que a peça sirva e faça sentido para você. Se algo não estiver certo, resolvemos juntos."
    >
      <Prose title="Direito de arrependimento — 7 dias">
        <p>
          Em compras realizadas pela internet, você tem até <strong>7 dias corridos</strong> a
          partir do recebimento para desistir da compra, conforme o artigo 49 do Código de
          Defesa do Consumidor. Nesse caso, devolvemos o valor pago integralmente, incluindo o
          frete.
        </p>
      </Prose>
      <Prose title="Condições para troca ou devolução">
        <p>Para que a solicitação seja aceita, a peça precisa estar:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>sem uso e sem sinais de lavagem, perfume ou maquiagem;</li>
          <li>com todas as etiquetas originais presas;</li>
          <li>na embalagem original, junto com eventuais brindes e acessórios.</li>
        </ul>
      </Prose>
      <Prose title="Defeito de fabricação">
        <p>
          Identificou um defeito? Nos avise em até 30 dias do recebimento com fotos do problema.
          Fazemos a troca pela mesma peça, quando houver estoque, ou o reembolso integral.
        </p>
      </Prose>
      <Prose title="Como solicitar">
        <p>
          Envie o número do pedido, o motivo e fotos da peça para{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-[color:var(--gold)] underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          ou pelo WhatsApp{" "}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[color:var(--gold)] underline-offset-4 hover:underline"
          >
            {WHATSAPP_DISPLAY}
          </a>
          . Respondemos com as instruções de postagem em até 2 dias úteis. Após recebermos e
          conferirmos a peça, o reembolso é processado pelo mesmo meio de pagamento em até 10
          dias úteis.
        </p>
      </Prose>
    </PageShell>
  );
}
