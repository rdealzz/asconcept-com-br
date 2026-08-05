import { useState } from "react";
import { formatBRL } from "@/lib/cart-context";
import {
  formatCep,
  quoteShipping,
  normalizeCep,
  FREE_SHIPPING_THRESHOLD,
  type ShippingQuote,
} from "@/lib/shipping";

type Props = {
  subtotal: number;
  compact?: boolean;
};

export function ShippingCalculator({ subtotal, compact = false }: Props) {
  const [cep, setCep] = useState("");
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onCalc = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // pequena simulação de latência para feedback visual
    setTimeout(() => {
      const q = quoteShipping(cep, subtotal);
      if (!q) setError("CEP inválido. Verifique e tente novamente.");
      setQuote(q);
      setLoading(false);
    }, 350);
  };

  return (
    <div className={compact ? "" : "border-t border-border pt-6"}>
      <p className="mb-3 text-[11px] tracking-luxe uppercase text-muted-foreground">
        Calcular Frete
      </p>
      <form onSubmit={onCalc} className="flex gap-2">
        <input
          inputMode="numeric"
          value={formatCep(cep)}
          onChange={(e) => {
            setCep(e.target.value);
            setQuote(null);
            setError(null);
          }}
          placeholder="00000-000"
          maxLength={9}
          className="flex-1 border-b border-foreground/30 bg-transparent px-1 py-2 text-sm outline-none focus:border-accent transition-colors tabular-nums"
        />
        <button
          type="submit"
          disabled={loading || normalizeCep(cep).length !== 8}
          className="asc-btn-primary px-5 py-2 text-[10px] tracking-luxe uppercase disabled:opacity-40"
        >
          {loading ? "..." : "Calcular"}
        </button>
      </form>

      {error && (
        <p className="mt-3 text-xs text-destructive">{error}</p>
      )}

      {quote && !error && (
        <div className="mt-4 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {quote.stateName} ({quote.state})
            </span>
            {quote.free ? (
              <span className="font-medium text-accent tracking-luxe uppercase text-[11px]">
                Frete Grátis
              </span>
            ) : (
              <span className="tabular-nums font-medium">
                {formatBRL(quote.displayCost)}
              </span>
            )}
          </div>
          <p className="text-[11px] font-light text-muted-foreground">
            Entrega em {quote.etaDays[0]}–{quote.etaDays[1]} dias úteis · Envio de Curitiba/PR
          </p>
          {!quote.free && subtotal > 0 && (
            <FreeShippingHint subtotal={subtotal} />
          )}
        </div>
      )}
    </div>
  );
}

export function FreeShippingHint({ subtotal }: { subtotal: number }) {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const pct = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const achieved = remaining === 0;

  return (
    <div className="mt-2">
      <p className="text-[11px] font-light text-muted-foreground">
        {achieved ? (
          <>
            🎉 Você ganhou <span className="text-accent font-medium">Frete Grátis</span>!
          </>
        ) : (
          <>
            Faltam apenas{" "}
            <span className="text-foreground font-medium tabular-nums">
              {formatBRL(remaining)}
            </span>{" "}
            para você ganhar <span className="text-accent">Frete Grátis</span>.
          </>
        )}
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
