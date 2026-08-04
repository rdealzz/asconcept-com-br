import { createFileRoute } from "@tanstack/react-router";

async function syncPayment(paymentId: string) {
  const { mapMpStatus, mpGetPayment } = await import("@/lib/mercadopago.server");
  const payment = await mpGetPayment(paymentId);
  if (!payment) return;
  const orderNumber = payment.external_reference;
  if (!orderNumber) return;

  const internal = mapMpStatus(payment.status);

  // Usa exatamente a mesma rotina do fluxo do site: além de gravar o status,
  // ela dá baixa no estoque e enfileira o e-mail de "pedido confirmado"
  // (idempotente via flags stock_decremented / mail_sent).
  const { persistPayment } = await import("@/lib/payments-core.server");
  await persistPayment(orderNumber, payment, internal);
}


export const Route = createFileRoute("/api/public/payments/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const url = new URL(request.url);
          const raw = await request.text();
          let body: { data?: { id?: string | number }; id?: string | number; type?: string } = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            /* corpo vazio em pings */
          }
          const paymentId = String(
            body.data?.id ?? body.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "",
          );
          if (!paymentId) return Response.json({ received: true, ignored: "no id" });

          const { verifyMpWebhook } = await import("@/lib/mercadopago.server");
          const valid = await verifyMpWebhook(request, paymentId);
          if (!valid) return new Response("Invalid signature", { status: 401 });

          await syncPayment(paymentId);
          return Response.json({ received: true });
        } catch (e) {
          console.error("[mp-webhook] error", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
} as never);
