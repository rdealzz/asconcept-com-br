import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { type StripeEnv, verifyStripeWebhook } from "@/lib/stripe.server";

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

/**
 * Pagamento confirmado pelo Stripe.
 *
 * O pedido vai para a fila de aprovação do ateliê — e não direto para
 * "Preparando pedido", que é etapa de decisão humana. A baixa de estoque
 * acontece aqui porque é aqui que o dinheiro entrou.
 *
 * O `.eq("status", ...)` no update é o que impede um pedido já entregue de
 * voltar para o começo do fluxo: o Stripe reenvia o mesmo evento quando não
 * recebe 200, e sem essa cláusula cada reenvio rebobinava o pedido.
 */
async function markPaid(sessionId: string, orderNumber: string | null) {
  const supabase = getSupabase();
  const patch = { status: "Aguardando Aprovação", updated_at: new Date().toISOString() };
  const base = supabase.from("orders").update(patch).eq("status", "Aguardando Pagamento");
  const { data, error } = orderNumber
    ? await base
        .eq("order_number", orderNumber)
        .select("order_number, stock_decremented")
        .maybeSingle()
    : await base
        .eq("stripe_session_id", sessionId)
        .select("order_number, stock_decremented")
        .maybeSingle();
  if (error) {
    console.error("webhook markPaid error:", error);
    return;
  }
  // Sem linha afetada: o pedido já tinha saído de "Aguardando Pagamento" (evento
  // repetido ou confirmação já feita no retorno do checkout). Nada a fazer.
  if (!data) return;
  if (!data.stock_decremented) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: stockError } = (await (supabase.rpc as any)("consume_order_stock", {
        _order_number: data.order_number,
      })) ?? { error: null };
      // .rpc() devolve { error } em vez de lançar: sem esta checagem a baixa
      // falhava em silêncio.
      if (stockError) {
        console.error(
          `[stripe-webhook] consume_order_stock recusado para ${data.order_number} — estoque NÃO baixou`,
          stockError,
        );
      }
    } catch (e) {
      console.error("consume_order_stock failed:", e);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;
        try {
          const event = await verifyStripeWebhook(request, env);
          if (
            event.type === "checkout.session.completed" ||
            event.type === "checkout.session.async_payment_succeeded"
          ) {
            const session = event.data.object as {
              id: string;
              metadata?: Record<string, string> | null;
              payment_status?: string;
            };
            // Só o pagamento confirmado baixa estoque. A condição anterior
            // aceitava `checkout.session.completed` sozinho, e sessão concluída
            // não quer dizer paga (Pix/boleto concluem a sessão como
            // `unpaid` e só depois confirmam) — dava baixa sem dinheiro entrar.
            if (session.payment_status === "paid") {
              await markPaid(session.id, session.metadata?.orderNumber ?? null);
            }
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
} as never);
