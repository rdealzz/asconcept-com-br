import { useState } from "react";
import { ChevronDown, Star } from "lucide-react";

type Props = {
  productId: string;
  productName: string;
  description?: string;
};

const SIZE_GUIDE: Array<{ size: string; comprimento: number; busto: number; ombro: number; manga: number }> = [
  { size: "P", comprimento: 68, busto: 98, ombro: 43, manga: 60 },
  { size: "M", comprimento: 71, busto: 104, ombro: 45, manga: 62 },
  { size: "G", comprimento: 74, busto: 110, ombro: 47, manga: 64 },
  { size: "GG", comprimento: 77, busto: 116, ombro: 49, manga: 66 },
];

const REVIEW_POOL: Array<{ name: string; rating: number; comment: string }> = [
  { name: "Rafael Almeida", rating: 5, comment: "Caimento impecável e tecido muito superior ao que esperava." },
  { name: "Bruno Carvalho", rating: 5, comment: "Acabamento de alfaiataria. Chegou antes do prazo e bem embalado." },
  { name: "Marcelo Tavares", rating: 4, comment: "Peça elegante e confortável. Recomendo pedir o tamanho habitual." },
  { name: "Thiago Menezes", rating: 5, comment: "Discreta e sofisticada, exatamente a proposta da marca." },
  { name: "André Siqueira", rating: 5, comment: "Qualidade que se percebe no toque. Já é a minha favorita." },
  { name: "Leonardo Prado", rating: 4, comment: "Ótimo tecido e costura precisa. Vale cada detalhe." },
  { name: "Gustavo Ribeiro", rating: 5, comment: "Vestiu perfeitamente e a cor é fiel às fotos." },
  { name: "Felipe Andrade", rating: 5, comment: "Atendimento atencioso e peça de altíssimo padrão." },
];

/** Seleção estável por produto — as mesmas avaliações a cada abertura. */
function reviewsFor(productId: string) {
  let hash = 0;
  for (let i = 0; i < productId.length; i++) hash = (hash * 31 + productId.charCodeAt(i)) >>> 0;
  const count = 3 + (hash % 3);
  const start = hash % REVIEW_POOL.length;
  return Array.from({ length: count }, (_, i) => REVIEW_POOL[(start + i) % REVIEW_POOL.length]);
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i <= rating ? "fill-[color:var(--gold)] text-[color:var(--gold)]" : "text-border"}`}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

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
    <div className="border-b border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-14 w-full items-center justify-between text-left"
      >
        <span className="font-serif text-sm tracking-wide">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pb-6 text-sm font-light leading-relaxed text-muted-foreground">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductInfoAccordion({ productId, productName, description }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ detalhes: true });
  const toggle = (key: string) => setOpen((s) => ({ ...s, [key]: !s[key] }));
  const reviews = reviewsFor(productId);
  const average =
    Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10;

  return (
    <div className="mt-10 border-t border-border">
      <Section title="Detalhes do Produto" open={!!open.detalhes} onToggle={() => toggle("detalhes")}>
        <p>
          {description?.trim() ||
            `${productName} — peça da curadoria A&S Conccept, produzida em série limitada com acabamento de atelier.`}
        </p>
      </Section>

      <Section title="Guia de Tamanhos" open={!!open.tamanhos} onToggle={() => toggle("tamanhos")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-luxe uppercase text-muted-foreground">
                <th className="py-2 pr-3 text-left font-normal">Tam.</th>
                <th className="py-2 pr-3 text-right font-normal">Comprimento</th>
                <th className="py-2 pr-3 text-right font-normal">Busto</th>
                <th className="py-2 pr-3 text-right font-normal">Ombro</th>
                <th className="py-2 text-right font-normal">Manga</th>
              </tr>
            </thead>
            <tbody>
              {SIZE_GUIDE.map((r) => (
                <tr key={r.size} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-serif text-foreground">{r.size}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.comprimento} cm</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.busto} cm</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.ombro} cm</td>
                  <td className="py-2 text-right tabular-nums">{r.manga} cm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px]">
          Medidas de referência em centímetros, com variação de até 2 cm entre peças.
        </p>
      </Section>

      <Section title="Formas de Pagamento" open={!!open.pagamento} onToggle={() => toggle("pagamento")}>
        <div className="flex flex-wrap gap-2">
          {["Visa", "Mastercard", "Elo", "PIX"].map((m) => (
            <span
              key={m}
              className="border border-border px-3 py-1.5 text-[10px] tracking-luxe uppercase text-foreground"
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

      <Section
        title="Avaliações do Produto"
        open={!!open.avaliacoes}
        onToggle={() => toggle("avaliacoes")}
      >
        <div className="mb-4 flex items-center gap-2">
          <Stars rating={Math.round(average)} />
          <span className="text-[11px] tracking-luxe uppercase">
            {average.toFixed(1)} · {reviews.length} avaliações
          </span>
        </div>
        <ul className="space-y-4">
          {reviews.map((r, i) => (
            <li key={`${r.name}-${i}`} className="border-b border-border/50 pb-4 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="font-serif text-sm text-foreground">{r.name}</span>
                <Stars rating={r.rating} />
              </div>
              <p className="mt-1 text-xs">{r.comment}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export default ProductInfoAccordion;
