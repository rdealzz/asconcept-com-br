import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Check, Loader2 } from "lucide-react";

import { confirmStripePayment } from "@/lib/checkout.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { useCart } from "@/lib/cart-context";
import { markCouponUsed } from "@/lib/coupons";

export const Route = createFileRoute("/sucesso")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pagamento Confirmado — A&S Conccept" },
      { name: "description", content: "Seu pedido A&S Conccept foi confirmado com sucesso." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: z.object({
    session_id: z.string().optional(),
    order: z.string().optional(),
  }),
  component: SucessoPage,
});

function SucessoPage() {
  const { session_id: sessionId, order } = Route.useSearch();
  const confirm = useServerFn(confirmStripePayment);
  const navigate = useNavigate();
  const { clear, coupon } = useCart();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "paid"; orderNumber: string }
    | { kind: "pending"; orderNumber: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    if (!sessionId) {
      if (order) {
        setState({ kind: "pending", orderNumber: order });
        return;
      }
      setState({ kind: "error", message: "Sessão de pagamento não encontrada." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await confirm({
          data: { sessionId, environment: getStripeEnvironment() },
        });
        if (cancelled) return;
        if (res.paid) {
          if (coupon) markCouponUsed(coupon.code);
          clear();
          setState({ kind: "paid", orderNumber: res.orderNumber });
        } else {
          setState({ kind: "pending", orderNumber: res.orderNumber });
        }
      } catch (e) {
        if (!cancelled)
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Falha ao confirmar pagamento.",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, order, confirm, clear, coupon]);

  return (
    <main className="min-h-screen bg-background px-6 py-24">
      <div className="mx-auto max-w-lg border border-border bg-card p-10 text-center shadow-sm">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">A&S Conccept</p>
        {state.kind === "loading" && (
          <>
            <Loader2 className="mx-auto mt-6 h-8 w-8 animate-spin text-accent" strokeWidth={1.5} />
            <h1 className="mt-4 font-serif text-2xl text-charcoal">Confirmando seu pagamento…</h1>
            <p className="mt-3 text-sm text-muted-foreground">Aguarde um instante.</p>
          </>
        )}
        {state.kind === "paid" && (
          <>
            <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-full border border-accent/50 bg-accent/10">
              <Check className="h-6 w-6 text-accent" strokeWidth={1.5} />
            </div>
            <h1 className="mt-4 font-serif text-2xl text-charcoal">Pagamento aprovado</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Pedido <strong>{state.orderNumber}</strong> confirmado. Você receberá um e-mail com os detalhes.
            </p>
            <Link
              to="/pedidos/$id"
              params={{ id: state.orderNumber }}
              className="mt-8 inline-block bg-charcoal px-8 py-3 text-[11px] tracking-luxe uppercase text-ivory hover:bg-navy"
            >
              Acompanhar Pedido
            </Link>
          </>
        )}
        {state.kind === "pending" && (
          <>
            <h1 className="mt-6 font-serif text-2xl text-charcoal">Pagamento em processamento</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Assim que confirmarmos, o pedido <strong>{state.orderNumber}</strong> será atualizado.
              Pix pode levar alguns minutos.
            </p>
            <Link
              to="/pedidos/$id"
              params={{ id: state.orderNumber }}
              className="mt-6 inline-block border border-border px-6 py-3 text-[11px] uppercase tracking-luxe text-charcoal"
            >
              Ver pedido
            </Link>
          </>
        )}
        {state.kind === "error" && (
          <>
            <h1 className="mt-6 font-serif text-2xl text-charcoal">Não foi possível confirmar</h1>
            <p className="mt-3 text-sm text-red-700">{state.message}</p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-6 inline-block border border-border px-6 py-3 text-[11px] uppercase tracking-luxe text-charcoal"
            >
              Voltar à loja
            </button>
          </>
        )}
      </div>
    </main>
  );
}
