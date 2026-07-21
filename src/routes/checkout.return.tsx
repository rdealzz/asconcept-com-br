import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { confirmStripePayment } from "@/lib/checkout.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { useCart } from "@/lib/cart-context";

export const Route = createFileRoute("/checkout/return")({
  ssr: false,
  validateSearch: z.object({
    session_id: z.string().optional(),
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id: sessionId } = Route.useSearch();
  const confirm = useServerFn(confirmStripePayment);
  const navigate = useNavigate();
  const { clear } = useCart();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "paid"; orderNumber: string }
    | { kind: "pending"; orderNumber: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    if (!sessionId) {
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
          clear();
          setState({ kind: "paid", orderNumber: res.orderNumber });
          setTimeout(() => {
            navigate({ to: "/pedidos/$id", params: { id: res.orderNumber } });
          }, 2200);
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
  }, [sessionId, confirm, navigate, clear]);

  return (
    <main className="min-h-screen bg-[#f6f2ea] px-6 py-24">
      <div className="mx-auto max-w-lg rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm">
        <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-500">A&S Conccept</p>
        {state.kind === "loading" && (
          <>
            <h1 className="mt-4 font-serif text-2xl text-neutral-900">Confirmando seu pagamento…</h1>
            <p className="mt-3 text-sm text-neutral-600">Aguarde um instante.</p>
          </>
        )}
        {state.kind === "paid" && (
          <>
            <h1 className="mt-4 font-serif text-2xl text-neutral-900">Pagamento aprovado</h1>
            <p className="mt-3 text-sm text-neutral-600">
              Pedido <strong>{state.orderNumber}</strong> confirmado. Redirecionando…
            </p>
          </>
        )}
        {state.kind === "pending" && (
          <>
            <h1 className="mt-4 font-serif text-2xl text-neutral-900">Pagamento em processamento</h1>
            <p className="mt-3 text-sm text-neutral-600">
              Assim que confirmarmos, o pedido <strong>{state.orderNumber}</strong> será atualizado.
            </p>
            <Link
              to="/pedidos/$id"
              params={{ id: state.orderNumber }}
              className="mt-6 inline-block rounded-full bg-[#0f1e35] px-6 py-3 text-xs uppercase tracking-widest text-[#f6f2ea]"
            >
              Ver pedido
            </Link>
          </>
        )}
        {state.kind === "error" && (
          <>
            <h1 className="mt-4 font-serif text-2xl text-neutral-900">Não foi possível confirmar</h1>
            <p className="mt-3 text-sm text-red-700">{state.message}</p>
            <Link
              to="/checkout"
              className="mt-6 inline-block rounded-full border border-neutral-300 px-6 py-3 text-xs uppercase tracking-widest text-neutral-800"
            >
              Voltar ao checkout
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
