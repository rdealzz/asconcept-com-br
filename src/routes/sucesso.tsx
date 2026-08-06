import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Check, Loader2 } from "lucide-react";

import { getPaymentStatus } from "@/lib/payments.functions";
import { useCart } from "@/lib/cart-context";
import { ContactStrip } from "@/components/ContactStrip";
import { Wordmark } from "@/components/Wordmark";

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
    order: z.string().optional(),
  }),
  component: SucessoPage,
});

/** De quanto em quanto tempo perguntamos ao Mercado Pago, e por quanto tempo. */
const INTERVALO_MS = 4000;
const TENTATIVAS = 45;

function SucessoPage() {
  const { order } = Route.useSearch();
  const consultar = useServerFn(getPaymentStatus);
  const navigate = useNavigate();
  const { clear } = useCart();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "paid"; orderNumber: string }
    | { kind: "pending"; orderNumber: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  /**
   * Confirmação do pagamento.
   *
   * A fonte oficial é a webhook do Mercado Pago, que chega ao servidor sem
   * depender do navegador. Esta consulta existe para a pessoa ver o resultado
   * na tela: ela pergunta o status do próprio pedido até o pagamento entrar,
   * e desiste depois de alguns minutos sem travar a página — o pedido segue
   * sendo confirmado pela webhook de qualquer forma.
   */
  useEffect(() => {
    if (!order) {
      setState({ kind: "error", message: "Pedido não informado." });
      return;
    }
    let cancelado = false;
    let tentativas = 0;
    let timer = 0;

    const perguntar = async () => {
      tentativas += 1;
      try {
        const res = await consultar({ data: { orderNumber: order } });
        if (cancelado) return;
        if (res.paid) {
          clear();
          setState({ kind: "paid", orderNumber: order });
          return;
        }
        setState({ kind: "pending", orderNumber: order });
      } catch (e) {
        if (cancelado) return;
        // Falha de rede não vira tela de erro: o pedido existe e a webhook
        // resolve. Mostramos o estado de "em processamento".
        if (tentativas === 1) {
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Falha ao consultar o pagamento.",
          });
          return;
        }
      }
      if (!cancelado && tentativas < TENTATIVAS) {
        timer = window.setTimeout(perguntar, INTERVALO_MS);
      }
    };

    void perguntar();
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [order, consultar, clear]);

  return (
    <main className="min-h-screen bg-background px-6 py-24">
      <div className="mx-auto max-w-lg border border-border bg-card p-10 text-center shadow-sm">
        <Wordmark className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground" />
        {state.kind === "loading" && (
          <>
            <Loader2 className="mx-auto mt-6 h-8 w-8 animate-spin text-accent" strokeWidth={1.5} />
            <h1 className="mt-4 font-serif text-2xl text-asc-ink">Confirmando seu pagamento…</h1>
            <p className="mt-3 text-sm text-muted-foreground">Aguarde um instante.</p>
          </>
        )}
        {state.kind === "paid" && (
          <>
            <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-full border border-accent/50 bg-accent/10">
              <Check className="h-6 w-6 text-accent" strokeWidth={1.5} />
            </div>
            <h1 className="mt-4 font-serif text-2xl text-asc-ink">Pagamento aprovado</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Pedido <strong>{state.orderNumber}</strong> confirmado. Você receberá um e-mail com os
              detalhes e um aviso a cada etapa do ateliê.
            </p>
            <Link
              to="/pedidos/$id"
              params={{ id: state.orderNumber }}
              className="asc-btn-primary mt-8 inline-block px-8 py-3 text-[11px] tracking-luxe uppercase"
            >
              Acompanhar Pedido
            </Link>
          </>
        )}
        {state.kind === "pending" && (
          <>
            <Loader2
              className="mx-auto mt-6 h-6 w-6 animate-spin text-accent"
              strokeWidth={1.5}
              aria-hidden
            />
            <h1 className="mt-4 font-serif text-2xl text-asc-ink">Pagamento em processamento</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Assim que o Mercado Pago confirmar, o pedido <strong>{state.orderNumber}</strong> será
              atualizado e avisamos por e-mail. O Pix costuma levar alguns instantes.
            </p>
            <Link
              to="/pedidos/$id"
              params={{ id: state.orderNumber }}
              className="mt-6 inline-block border border-border px-6 py-3 text-[11px] uppercase tracking-luxe text-asc-ink"
            >
              Ver pedido
            </Link>
          </>
        )}
        {state.kind === "error" && (
          <>
            <h1 className="mt-6 font-serif text-2xl text-asc-ink">Não foi possível confirmar</h1>
            <p className="mt-3 text-sm text-asc-error">{state.message}</p>
            {order && (
              <Link
                to="/pedidos/$id"
                params={{ id: order }}
                className="mt-6 inline-block border border-border px-6 py-3 text-[11px] uppercase tracking-luxe text-asc-ink"
              >
                Ver pedido {order}
              </Link>
            )}
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-3 inline-block border border-border px-6 py-3 text-[11px] uppercase tracking-luxe text-asc-ink"
            >
              Voltar à loja
            </button>
          </>
        )}
      </div>
      <ContactStrip />
    </main>
  );
}
