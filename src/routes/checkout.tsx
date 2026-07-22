import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { createStripeHostedSession } from "@/lib/checkout.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Finalizar Compra — A&S Conccept" },
      {
        name: "description",
        content:
          "Complete seu pedido A&S Conccept com envio nacional e pagamento seguro pelo Stripe.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutRedirectPage,
});

function CheckoutRedirectPage() {
  const { items, coupon } = useCart();
  const { user, loading, openAuth } = useAuth();
  const navigate = useNavigate();
  const startSession = useServerFn(createStripeHostedSession);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      openAuth();
      navigate({ to: "/" });
      return;
    }
    if (items.length === 0) {
      navigate({ to: "/" });
      return;
    }
    if (!isPaymentsConfigured()) {
      setError(
        "Pagamentos ainda não configurados para esta build. Conclua a etapa de go-live para aceitar pagamentos reais.",
      );
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const origin = window.location.origin;
        const result = await startSession({
          data: {
            items: items.map((i) => ({ id: i.id, quantity: i.qty, size: i.size })),
            couponCode: coupon?.code ?? null,
            environment: getStripeEnvironment(),
            successUrl: `${origin}/sucesso`,
            cancelUrl: `${origin}/`,
          },
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        // Redireciona direto para a página segura do Stripe.
        window.location.href = result.url;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao iniciar pagamento.");
      }
    })();
  }, [loading, user, items, coupon, startSession, navigate, openAuth]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-background px-6 py-24 text-center">
      <div className="max-w-md">
        {error ? (
          <>
            <h1 className="font-serif text-2xl text-charcoal">Não foi possível iniciar o pagamento</h1>
            <p className="mt-4 text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-8 bg-charcoal px-8 py-3 text-[11px] tracking-luxe uppercase text-ivory hover:bg-navy"
            >
              Voltar à Sacola
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-accent" strokeWidth={1.5} />
            <p className="mt-6 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Pagamento Seguro
            </p>
            <h1 className="mt-3 font-serif text-2xl text-charcoal">
              Redirecionando ao ambiente Stripe…
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Estamos preparando sua sessão de pagamento. Não feche esta janela.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
