import { useEffect, useMemo, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";

import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createStripeCheckoutSession } from "@/lib/checkout.functions";

type Props = {
  open: boolean;
  onClose: () => void;
  input: {
    items: { id: string; quantity: number; size: "P" | "M" | "G" | "GG" }[];
    customerName: string;
    customerEmail: string;
    address: Record<string, unknown>;
    couponCode: string | null;
  } | null;
  onOrderCreated: (orderNumber: string) => void;
};

export function StripeCheckoutModal({ open, onClose, input, onOrderCreated }: Props) {
  const createSession = useServerFn(createStripeCheckoutSession);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !input) return;
    let cancelled = false;
    setClientSecret(null);
    setError(null);

    (async () => {
      try {
        const returnUrl =
          `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
        const result = await createSession({
          data: {
            ...input,
            environment: getStripeEnvironment(),
            returnUrl,
          },
        });
        if (cancelled) return;
        if ("error" in result) {
          setError(result.error);
          return;
        }
        onOrderCreated(result.orderNumber);
        setClientSecret(result.clientSecret);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao iniciar pagamento.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, input, createSession, onOrderCreated]);

  const options = useMemo(
    () => (clientSecret ? { fetchClientSecret: async () => clientSecret } : null),
    [clientSecret],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
              Pagamento seguro
            </p>
            <h2 className="font-serif text-lg text-neutral-900">Finalizar com cartão</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-xs uppercase tracking-widest text-neutral-500 hover:bg-neutral-100"
          >
            Fechar
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 sm:p-4">
          {error && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}
          {!error && !clientSecret && (
            <div className="flex h-64 items-center justify-center text-sm text-neutral-500">
              Preparando pagamento…
            </div>
          )}
          {options && (
            <EmbeddedCheckoutProvider stripe={getStripe()} options={options}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      </div>
    </div>
  );
}
