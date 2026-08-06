import { useRef, type ReactNode } from "react";
import { hoverEnabled } from "@/lib/motion";

/**
 * Peças visuais compartilhadas do novo desenho da home.
 * Só aparência — nenhuma delas conhece carrinho, estoque ou pagamento.
 */

/** Rótulo de seção: um ponto dourado e o texto em caixa alta bem espaçada. */
export function Eyebrow({
  children,
  tone = "dark",
  className = "",
}: {
  children: ReactNode;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-xs font-medium uppercase ${className}`}
      style={{ letterSpacing: "0.22em" }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${tone === "light" ? "bg-asc-gold-soft" : "bg-asc-gold"}`}
      />
      <span className={tone === "light" ? "text-asc-ink-inverse-muted" : "text-asc-ink-muted"}>
        {children}
      </span>
    </span>
  );
}

const ARROW = "M5 12h14M13 6l6 6-6 6";

/**
 * Botão pílula com seta que avança ao passar o mouse.
 * `as` permite usar o mesmo desenho num link.
 */
export function PillButton({
  children,
  onClick,
  href,
  variant = "solid",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "solid" | "light" | "outline";
  className?: string;
}) {
  const seta = useRef<HTMLSpanElement>(null);

  const mover = (px: number) => {
    if (!hoverEnabled() || !seta.current) return;
    seta.current.style.transform = `translateX(${px}px)`;
  };

  const cores =
    variant === "light"
      ? "bg-asc-ink text-asc-bg hover:bg-asc-gold"
      : variant === "outline"
        ? "border border-current text-asc-ink hover:bg-asc-ink hover:text-asc-bg"
        : "asc-btn-primary";

  const base = `inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium uppercase tracking-wide transition-colors duration-asc ease-asc ${cores} ${className}`;

  const conteudo = (
    <>
      {children}
      <span
        ref={seta}
        className="inline-block transition-transform duration-ascfast ease-asc"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d={ARROW} />
        </svg>
      </span>
    </>
  );

  const eventos = {
    onMouseEnter: () => mover(5),
    onMouseLeave: () => mover(0),
  };

  if (href) {
    return (
      <a href={href} className={base} {...eventos}>
        {conteudo}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={base} {...eventos}>
      {conteudo}
    </button>
  );
}

/** Seta redonda de carrossel. */
export function ArrowButton({
  onClick,
  direction = "next",
  variant = "outline",
  label,
}: {
  onClick: () => void;
  direction?: "next" | "prev";
  variant?: "outline" | "solid";
  label: string;
}) {
  const icone = useRef<SVGSVGElement>(null);

  const escalar = (v: number) => {
    if (!hoverEnabled() || !icone.current) return;
    icone.current.style.transform = `${direction === "prev" ? "scaleX(-1) " : ""}scale(${v})`;
  };

  return (
    <button
      onClick={onClick}
      aria-label={label}
      onMouseEnter={() => escalar(1.15)}
      onMouseLeave={() => escalar(1)}
      className={`grid h-12 w-12 place-items-center rounded-full transition-colors duration-asc ease-asc sm:h-14 sm:w-14 ${
        variant === "solid"
          ? "border border-asc-ink bg-asc-ink text-asc-bg hover:bg-asc-gold hover:border-asc-gold"
          : "border border-asc-line text-asc-ink hover:border-asc-gold hover:text-asc-gold"
      }`}
    >
      <svg
        ref={icone}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 transition-transform duration-ascfast ease-asc"
        style={{ transform: direction === "prev" ? "scaleX(-1)" : undefined }}
      >
        <path d={ARROW} />
      </svg>
    </button>
  );
}

/** Marcadores do carrossel: o ativo vira um traço, os demais ficam pontos. */
export function CarouselDots({
  count,
  active,
  onSelect,
  tone = "dark",
}: {
  count: number;
  active: number;
  onSelect: (i: number) => void;
  tone?: "dark" | "light";
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          aria-label={`Ir para o item ${i + 1}`}
          aria-current={i === active}
          className="p-1.5"
        >
          <span
            className="block h-1.5 rounded-full transition-all duration-asc ease-asc"
            style={{
              width: i === active ? "1.25rem" : "0.375rem",
              background:
                i === active
                  ? tone === "light"
                    ? "var(--asc-ink)"
                    : "var(--asc-gold)"
                  : tone === "light"
                    ? "rgba(232,220,196,0.4)"
                    : "var(--asc-line-dark)",
            }}
          />
        </button>
      ))}
    </div>
  );
}
