import { useEffect, useState } from "react";
import { Check, Copy, Loader2, QrCode } from "lucide-react";

import { formatBRL } from "@/lib/cart-context";

export type PixCharge = {
  orderNumber: string;
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string | null;
  amount: number;
};

function useCountdown(expiresAt: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => setLeft(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PixPanel({
  charge,
  awaiting,
}: {
  charge: PixCharge;
  awaiting: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown(charge.expiresAt);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(charge.qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard indisponível */
    }
  };

  return (
    <section className="border border-[color:var(--gold)]/40 bg-card/40 p-6 sm:p-8">
      <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        <QrCode className="h-3.5 w-3.5" strokeWidth={1.5} /> Pagamento via Pix
      </p>
      <h2 className="mt-3 font-serif text-2xl text-charcoal">
        {formatBRL(charge.amount)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Abra o app do seu banco, escaneie o código e confirme. A aprovação é automática.
      </p>

      {charge.qrCodeBase64 && (
        <div className="mt-6 flex justify-center">
          <div className="border border-[color:var(--gold)]/50 bg-ivory p-4">
            <img
              src={`data:image/png;base64,${charge.qrCodeBase64}`}
              alt={`QR Code Pix do pedido ${charge.orderNumber}`}
              className="h-52 w-52 object-contain"
            />
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Pix copia e cola
        </p>
        <p className="mt-2 max-h-24 overflow-y-auto break-all border border-border bg-background/60 p-3 text-[11px] text-muted-foreground">
          {charge.qrCode}
        </p>
        <button
          onClick={copy}
          className="mt-3 inline-flex items-center gap-2 border border-charcoal px-6 py-3 text-[11px] uppercase tracking-luxe text-charcoal transition-colors hover:bg-charcoal hover:text-ivory"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Código copiado" : "Copiar código"}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
        {awaiting && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={1.5} />
            Aguardando confirmação do pagamento…
          </span>
        )}
        {countdown && <span>Expira em {countdown}</span>}
        <span>Pedido {charge.orderNumber}</span>
      </div>
    </section>
  );
}
