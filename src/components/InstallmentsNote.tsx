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
