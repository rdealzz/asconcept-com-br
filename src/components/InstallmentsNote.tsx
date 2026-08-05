import { useQuery } from "@tanstack/react-query";
import { getInstallments } from "@/lib/installments.functions";
import { formatBRL } from "@/lib/cart-context";

/**
 * Mostra o parcelamento sem juros real da conta Mercado Pago.
 * Se a API não responder, nada é exibido (nunca inventamos taxas).
 */
export function InstallmentsNote({
  amount,
  className = "",
}: {
  amount: number;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["mp-installments", amount],
    queryFn: () => getInstallments({ data: { amount } }),
    staleTime: 10 * 60 * 1000,
    enabled: amount > 0,
  });
  const option = data?.option;
  if (!option) return null;
  return (
    <span className={`block text-[11px] font-light text-muted-foreground ${className}`}>
      ou {option.installments}x de {formatBRL(option.installmentAmount)} sem juros
    </span>
  );
}

/**
 * Selo discreto de condição de pagamento — "Em até Nx sem juros".
 * O número de parcelas vem da própria conta do Mercado Pago.
 */
export function InstallmentsBadge({
  amount,
  className = "",
}: {
  amount: number;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["mp-installments", amount],
    queryFn: () => getInstallments({ data: { amount } }),
    staleTime: 10 * 60 * 1000,
    enabled: amount > 0,
  });
  const option = data?.option;
  if (!option) return null;
  return (
    <span
      className={`inline-flex items-center gap-2 border border-accent/40 px-3 py-1.5 text-[10px] font-light uppercase tracking-[0.28em] text-accent ${className}`}
    >
      Em até {option.installments}x sem juros
    </span>
  );
}

/**
 * Lista limpa das condições reais: parcelas sem juros marcadas como
 * "sem juros" e, a partir da primeira com acréscimo, o valor total da API.
 */
export function InstallmentsTable({
  amount,
  className = "",
}: {
  amount: number;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["mp-installments", amount],
    queryFn: () => getInstallments({ data: { amount } }),
    staleTime: 10 * 60 * 1000,
    enabled: amount > 0,
  });
  const options = data?.options ?? [];
  if (!options.length) return null;
  return (
    <ul className={`divide-y divide-border/60 ${className}`}>
      {options.map((o) => (
        <li
          key={o.installments}
          className="flex items-baseline justify-between py-1.5 text-[12px] font-light"
        >
          <span className="tabular-nums">
            {o.installments}x de {formatBRL(o.installmentAmount)}
          </span>
          <span
            className={
              o.interestFree
                ? "text-[10px] uppercase tracking-[0.22em] text-accent"
                : "text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
            }
          >
            {o.interestFree ? "Sem juros" : `Total ${formatBRL(o.totalAmount)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
