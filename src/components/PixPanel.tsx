import { useEffect, useState } from "react";
import { Check, Copy, Loader2, QrCode, ShieldCheck, Timer } from "lucide-react";

import { WHATSAPP_LINK, openWhatsApp } from "@/components/WhatsAppFab";
import { SeloCompraSegura } from "@/components/checkout-ui";

import { formatBRL } from "@/lib/cart-context";
import { PIX_EXPIRATION_MINUTES } from "@/lib/mercadopago";

export type PixCharge = {
  orderNumber: string;
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string | null;
  amount: number;
};

/**
 * Conta regressiva até a expiração da cobrança.
 *
 * Devolve os segundos restantes e o rótulo já formatado. Antes formatava só
 * `minutos:segundos`, e como a cobrança nascia com 24 horas de validade o
 * cliente via "1439:41" — número que não se lê como tempo. Agora a cobrança
 * dura 15 minutos (ver PIX_EXPIRATION_MINUTES), mas o formato continua
 * preparado para horas: se algum dia o prazo mudar, o relógio acompanha em vez
 * de estourar os minutos.
 *
 * Sem `expiresAt` não há relógio — melhor nenhum contador que um inventado.
 */
function useCountdown(expiresAt: string | null) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setLeft(null);
      return;
    }
    const target = new Date(expiresAt).getTime();
    if (!Number.isFinite(target)) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (left === null) return { segundos: null, rotulo: null, expirado: false };

  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const dd = (n: number) => String(n).padStart(2, "0");

  return {
    segundos: left,
    rotulo: h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${dd(m)}:${dd(s)}`,
    expirado: left === 0,
  };
}

export function PixPanel({ charge, awaiting }: { charge: PixCharge; awaiting: boolean }) {
  const [copied, setCopied] = useState(false);
  const { rotulo: countdown, segundos, expirado } = useCountdown(charge.expiresAt);
  // Último minuto: o relógio passa a puxar o olho.
  const urgente = segundos !== null && segundos > 0 && segundos <= 60;

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
    <section className="rounded-2xl border border-[color:var(--gold)]/40 bg-card/40 p-6 backdrop-blur-[12px] sm:p-8">
      <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        <QrCode className="h-3.5 w-3.5" strokeWidth={1.5} /> Pagamento via Pix
      </p>
      <h2 className="mt-3 font-serif text-2xl text-asc-ink">{formatBRL(charge.amount)}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Abra o app do seu banco, escaneie o código e confirme. A aprovação é automática.
      </p>

      {charge.qrCodeBase64 && (
        <div className="mt-6 flex justify-center">
          {/* Moldura dourada em duas camadas; o miolo é branco de propósito: o
              QR Code do Mercado Pago é preto e precisa da zona de silêncio
              clara para ser lido pela câmera. Não trocar pela paleta escura. */}
          <div className="rounded-2xl border border-[color:var(--gold)]/60 bg-[color:var(--gold)]/10 p-2 shadow-[0_0_40px_-12px_rgba(197,160,89,0.5)]">
            <div className="rounded-xl bg-white p-4">
              <img
                src={`data:image/png;base64,${charge.qrCodeBase64}`}
                alt={`QR Code Pix do pedido ${charge.orderNumber}`}
                className="h-52 w-52 object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Relógio logo abaixo do QR Code: é aqui que a urgência tem função —
          o cliente acabou de olhar para o código e está decidindo se paga
          agora ou depois. */}
      {countdown && (
        <div className="mt-5 flex flex-col items-center gap-1.5">
          <span
            aria-live="polite"
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-serif text-lg tabular-nums transition-colors duration-asc ease-asc ${
              expirado || urgente
                ? "border-asc-error/50 bg-asc-error/10 text-asc-error"
                : "border-[color:var(--gold)]/50 bg-[color:var(--gold)]/10 text-[color:var(--gold)]"
            }`}
          >
            <Timer className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {expirado ? "Expirado" : countdown}
          </span>
          <p className="text-[11px] font-light text-muted-foreground">
            {expirado
              ? "Este QR Code expirou. Refaça o pedido para gerar um novo."
              : `Este QR Code expira em ${PIX_EXPIRATION_MINUTES} minutos.`}
          </p>
        </div>
      )}

      <div className="mt-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Pix copia e cola
        </p>
        <p className="mt-2 max-h-24 overflow-y-auto break-all rounded-lg border border-border bg-background/60 p-3 text-[11px] text-muted-foreground">
          {charge.qrCode}
        </p>
        <button
          onClick={copy}
          className={`asc-btn-gold mt-3 w-full px-6 py-3.5 sm:w-auto ${copied ? "!bg-none !bg-asc-success/20 !text-asc-success" : ""}`}
          aria-live="polite"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Código copiado" : "Copiar chave Pix"}
        </button>
      </div>

      <aside className="mt-6 border border-[color:var(--gold)]/45 bg-asc-bg-raised p-4 sm:p-5">
        <p className="flex items-center gap-2 font-serif text-sm text-asc-ink">
          <ShieldCheck className="h-4 w-4 text-[color:var(--gold)]" strokeWidth={1.5} />
          Por que o Pix aparece em outro nome?
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Como a A&S Conccept ainda não possui CNPJ próprio, os pagamentos via Pix são processados
          pela conta pessoal do fundador da marca, verificada e protegida pelo Mercado Pago. Por
          isso, o comprovante pode aparecer em nome de{" "}
          <strong className="text-asc-ink">Erick</strong>, CEO e fundador da A&S Conccept. Assim que
          formalizarmos nosso CNPJ, essa informação será atualizada.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Seus dados de pagamento não são armazenados pela A&S Conccept — são processados
          exclusivamente pelo Mercado Pago, uma das maiores plataformas de pagamento da América
          Latina, garantindo total segurança e privacidade. Qualquer dúvida,{" "}
          <a
            href={WHATSAPP_LINK}
            onClick={openWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-asc-ink"
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

      <SeloCompraSegura className="mt-6" />

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
        {awaiting && !expirado && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={1.5} />
            Aguardando confirmação do pagamento…
          </span>
        )}
        <span>Pedido {charge.orderNumber}</span>
      </div>
    </section>
  );
}
