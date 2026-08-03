import { Lock, ShieldCheck } from "lucide-react";

function Flag({ label }: { label: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-sm border border-current/30 bg-current/5 px-2 text-[9px] font-medium tracking-[0.14em] uppercase">
      {label}
    </span>
  );
}

/**
 * Selo de compra segura + bandeiras aceitas.
 * `tone="dark"` para fundos escuros (rodapé), `light` para o checkout.
 */
export function TrustSeals({
  tone = "light",
  className = "",
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const base = tone === "dark" ? "text-ivory/70" : "text-muted-foreground";
  return (
    <div className={`${base} ${className}`}>
      <div className="flex items-center gap-2 text-[11px] tracking-luxe uppercase text-[color:var(--gold)]">
        <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
        Compra 100% segura
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Flag label="Visa" />
        <Flag label="Mastercard" />
        <Flag label="Elo" />
        <Flag label="Pix" />
        <Flag label="Mercado Pago" />
      </div>
      <p className="mt-3 flex items-start gap-2 text-[11px] font-light leading-relaxed">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
        Seus dados estão protegidos com criptografia de ponta a ponta. O pagamento é
        processado pelo Mercado Pago — não armazenamos os dados do seu cartão.
      </p>
    </div>
  );
}
