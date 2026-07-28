import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { getMpPublicKey } from "@/lib/payments.functions";
import { brickCustomization } from "@/lib/mercadopago";

export type CardFormData = {
  token: string;
  paymentMethodId: string;
  issuerId: string | null;
  installments: number;
  payerEmail: string;
};

type BrickProps = {
  amount: number;
  email: string;
  onSubmitCard: (data: CardFormData) => Promise<void>;
};

/**
 * Card Payment Brick do Mercado Pago.
 * Os dados do cartão vão direto do navegador para o Mercado Pago (tokenização);
 * nosso backend recebe apenas o token.
 */
export function CardBrick({ amount, email, onSubmitCard }: BrickProps) {
  const fetchKey = useServerFn(getMpPublicKey);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Brick, setBrick] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { publicKey } = await fetchKey();
        if (cancelled) return;
        if (!publicKey) {
          setError(
            "Pagamento por cartão indisponível: chave pública do Mercado Pago não configurada.",
          );
          return;
        }
        const mod = await import("@mercadopago/sdk-react");
        mod.initMercadoPago(publicKey, { locale: "pt-BR" });
        if (cancelled) return;
        setBrick(mod.CardPayment);
        setReady(true);
      } catch (e) {
        console.error("[mp] brick init failed", e);
        if (!cancelled) setError("Não foi possível carregar o formulário de cartão.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  if (error) {
    return (
      <p className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  // Memoizado: o SDK do Mercado Pago trata um novo objeto de "initialization"
  // como sinal para desmontar e remontar o formulário. Sem isso, o Brick
  // reinicializa a cada renderização do componente pai e pode falhar
  // internamente com "Cannot read properties of null (reading 'onReady')".
  const initialization = useMemo(
    () => ({ amount, payer: { email } }),
    [amount, email],
  );

  if (!ready || !Brick) {
    return (
      <div className="flex items-center gap-3 px-1 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-accent" strokeWidth={1.5} />
        Preparando ambiente seguro…
      </div>
    );
  }

  return (
    <div className="mp-brick">
      <Brick
        initialization={initialization}
        customization={brickCustomization}
        onSubmit={async (formData: {
          token: string;
          payment_method_id: string;
          issuer_id?: string | number;
          installments: number;
          payer?: { email?: string };
        }) => {
          await onSubmitCard({
            token: formData.token,
            paymentMethodId: formData.payment_method_id,
            issuerId: formData.issuer_id ? String(formData.issuer_id) : null,
            installments: Number(formData.installments) || 1,
            payerEmail: formData.payer?.email ?? email,
          });
        }}
        onError={(e: unknown) => console.error("[mp] brick error", e)}
      />
    </div>
  );
}
