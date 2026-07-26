import { createFileRoute } from "@tanstack/react-router";

import { mapMpStatus, mpGetPayment, verifyMpWebhook } from "@/lib/mercadopago.server";

async function syncPayment(paymentId: string) {
  const payment = await mpGetPayment(paymentId);
  if (!payment) return;
  const orderNumber = payment.external_reference;
  if (!orderNumber) return;

  const internal = mapMpStatus(payment.status);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("order_number, status, stock_decremented")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error || !order) return;

  await supabaseAdmin
    .from("orders")
    .update({
      mp_payment_id: String(payment.id),
      mp_status: payment.status,
      status: internal,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("order_number", orderNumber);

  if (payment.status === "approved" && !(order as { stock_decremented: boolean }).stock_decremented) {
    try {
      await (
        supabaseAdmin.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<unknown>
      )("consume_order_stock", { _order_number: orderNumber });
    } catch (e) {
      console.error("[mp-webhook] consume_order_stock failed", e);
    }
  }
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
