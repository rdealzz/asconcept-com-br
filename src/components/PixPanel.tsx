import { useEffect, useState } from "react";
import { Check, Copy, Loader2, QrCode, ShieldCheck } from "lucide-react";

import { WHATSAPP_LINK } from "@/components/WhatsAppFab";

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

      <aside className="mt-6 border border-[color:var(--gold)]/45 bg-[color:var(--ivory)] p-4 sm:p-5">
        <p className="flex items-center gap-2 font-serif text-sm text-charcoal">
          <ShieldCheck className="h-4 w-4 text-[color:var(--gold)]" strokeWidth={1.5} />
          Por que o Pix aparece em outro nome?
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Como a A&S Conccept ainda não possui CNPJ próprio, os pagamentos via Pix são
          processados pela conta pessoal do fundador da marca, verificada e protegida pelo
          Mercado Pago. Por isso, o comprovante pode aparecer em nome de{" "}
          <strong className="text-charcoal">Erick</strong>, CEO e fundador da A&S Conccept.
          Assim que formalizarmos nosso CNPJ, essa informação será atualizada.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Seus dados de pagamento não são armazenados pela A&S Conccept — são processados
          exclusivamente pelo Mercado Pago, uma das maiores plataformas de pagamento da América
          Latina, garantindo total segurança e privacidade. Qualquer dúvida,{" "}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-charcoal"
          >
            fale com a gente pelo WhatsApp
          </a>
          .
        </p>
        <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--gold)]/30 pt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#009EE3] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            <ShieldCheck className="h-3 w-3" strokeWidth={2} /> Mercado Pago
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Pagamento protegido
          </span>
        </div>
      </aside>

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
