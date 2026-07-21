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

async function markPaid(sessionId: string, orderNumber: string | null) {
  const supabase = getSupabase();
  const patch = { status: "Preparando pedido", updated_at: new Date().toISOString() };
  const base = supabase.from("orders").update(patch);
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
  if (!data) return;
  if (!data.stock_decremented) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("consume_order_stock", { _order_number: data.order_number });
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
            if (
              session.payment_status === "paid" ||
              event.type === "checkout.session.completed"
            ) {
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
