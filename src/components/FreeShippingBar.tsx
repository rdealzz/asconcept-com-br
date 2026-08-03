import { Truck } from "lucide-react";
import { formatBRL } from "@/lib/cart-context";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";

/** Aviso fixo no topo do site. */
export function FreeShippingBar() {
  return (
    <div className="fixed inset-x-0 top-0 z-[60] bg-charcoal text-ivory">
      <div className="mx-auto flex max-w-[1600px] items-center justify-center gap-2 px-4 py-2 text-[10px] tracking-luxe uppercase md:text-[11px]">
        <Truck className="h-3.5 w-3.5 text-[color:var(--gold)]" strokeWidth={1.5} />
        Frete grátis acima de {formatBRL(FREE_SHIPPING_THRESHOLD)}
      </div>
    </div>
  );
}
