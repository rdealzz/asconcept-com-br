import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { formatBRL, type Product } from "@/lib/cart-context";
import { FavoriteButton } from "@/components/ProductActions";
import { ArrowButton } from "@/components/ui-kit";
import { Inview, StackedLines } from "@/lib/motion";

/**
 * RelatedProducts — "Complete o Look" ao fim da página de produto.
 * Carrossel horizontal, cards sem sombra, fio dourado no hover.
 */
export function RelatedProducts({
  title = "Complete o Look",
  products,
}: {
  title?: string;
  products: Product[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  function scrollBy(dir: 1 | -1) {
    scrollerRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  }

  return (
    <section className="mx-auto max-w-[1600px] px-6 py-[var(--asc-section-y-sm)] md:px-12">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="font-serif text-2xl md:text-3xl">
          <StackedLines lines={[title]} duration={800} />
        </h2>
        <div className="hidden gap-2 sm:flex">
          <ArrowButton direction="prev" label="Anterior" onClick={() => scrollBy(-1)} />
          <ArrowButton
            direction="next"
            variant="solid"
            label="Próximo"
            onClick={() => scrollBy(1)}
          />
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="scrollbar-hide flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2"
      >
        {products.map((p, i) => (
          <Inview
            key={p.id}
            delayIn={i * 90}
            y={32}
            className="group w-[220px] shrink-0 snap-start sm:w-[260px]"
          >
            <Link to="/produto/$id" params={{ id: p.id }} className="block">
              <div className="relative mb-3 aspect-[3/4] overflow-hidden border border-asc-line bg-asc-bg-raised transition-colors duration-asc ease-asc group-hover:border-asc-gold/60">
                <img
                  src={p.image}
                  alt={p.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-ascslow ease-asc group-hover:scale-105"
                />
              </div>
              <h3 className="font-serif text-base leading-snug text-asc-ink transition-colors duration-ascfast ease-asc group-hover:text-asc-gold">
                {p.name}
              </h3>
              <p className="mt-1 text-sm tabular-nums text-asc-ink-muted">{formatBRL(p.price)}</p>
            </Link>
            <FavoriteButton productId={p.id} className="mt-2" />
          </Inview>
        ))}
      </div>
    </section>
  );
}
