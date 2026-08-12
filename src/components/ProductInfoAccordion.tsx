import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SizeGuideTable } from "@/components/SizeGuide";
import { StoreRating } from "@/components/StoreRating";
import { NOTA_TAMANHO_UNICO, sizeGuideFor } from "@/lib/size-guide";
import type { ProductCategory } from "@/lib/categories";

type Props = {
  productName: string;
  description?: string;
  /** Categoria e nome escolhem a tabela: roupa, calça, calçado ou único. */
  category?: ProductCategory | string | null;
  /** Os tamanhos que a peça oferece — prevalecem sobre a grade genérica. */
  sizes?: readonly string[];
  /** Tamanho escolhido na página, destacado na tabela. */
  selectedSize?: string | null;
};

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-asc-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-14 w-full items-center justify-between gap-4 text-left"
      >
        <span className="font-display text-sm tracking-wide text-asc-ink">{title}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-asc-ink-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pb-6 text-sm font-light leading-relaxed text-asc-ink-muted">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductInfoAccordion({
  productName,
  description,
  category,
  sizes,
  selectedSize = null,
}: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ detalhes: true });
  const toggle = (key: string) => setOpen((s) => ({ ...s, [key]: !s[key] }));

  // A tabela sai da espécie da peça: um boné não mostra busto e manga, uma
  // calça mostra cintura e quadril, e acessório não mostra tabela nenhuma.
  const guide = sizeGuideFor(category, productName, sizes);

  return (
    <div className="mt-10 border-t border-asc-line">
      <Section
        title="Detalhes do Produto"
        open={!!open.detalhes}
        onToggle={() => toggle("detalhes")}
      >
        <p>
          {description?.trim() ||
            `${productName} — peça da curadoria A&S Conccept, produzida em série limitada com acabamento de atelier.`}
        </p>
      </Section>

      <Section
        title={guide ? "Guia de Tamanhos" : "Tamanho"}
        open={!!open.tamanhos}
        onToggle={() => toggle("tamanhos")}
      >
        {guide ? (
          <SizeGuideTable guide={guide} selected={selectedSize} />
        ) : (
          <p className="text-[13px] leading-relaxed">{NOTA_TAMANHO_UNICO}</p>
        )}
      </Section>

      <Section
        title="Formas de Pagamento"
        open={!!open.pagamento}
        onToggle={() => toggle("pagamento")}
      >
        <div className="flex flex-wrap gap-2">
          {["Visa", "Mastercard", "Elo", "PIX"].map((m) => (
            <span
              key={m}
              className="asc-label border border-asc-line px-3 py-1.5 text-[10px] text-asc-ink"
            >
              {m}
            </span>
          ))}
        </div>
        <p className="mt-3">
          Pagamento processado pelo Mercado Pago. Parcele em até 12x no cartão de crédito ou
          finalize à vista no PIX.
        </p>
      </Section>

      {/* Reputação da marca, não da peça: a mesma nota em todas as páginas. */}
      <Section
        title="Avaliações da Loja"
        open={!!open.avaliacoes}
        onToggle={() => toggle("avaliacoes")}
      >
        <StoreRating />
      </Section>
    </div>
  );
}

export default ProductInfoAccordion;
