import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { productImageSrc } from "@/lib/product-images";

/** Largura em que a foto é exibida no palco da página da peça. */
const GALLERY_WIDTH = 1000;

/**
 * Galeria da peça — foto parada, com seta de cada lado.
 *
 * Substitui o palco giratório na página do produto: virar a peça para trocar de
 * foto era bonito, mas escondia a navegação — quem chegava não via como passar
 * para a próxima. Aqui a troca é explícita: seta à esquerda, seta à direita,
 * contador embaixo. No celular o arrasto lateral continua valendo, porque é o
 * gesto que todo mundo já tenta; clique curto amplia.
 *
 * A troca é uma transição suave de opacidade entre as fotos empilhadas, sem
 * biblioteca de animação: as fotos ficam todas montadas e só a atual fica
 * visível, então passar de uma para outra não recarrega nada.
 */
export function ProductGallery({
  images,
  alt,
  index,
  onIndex,
  onOpen,
  className = "",
  imageClassName = "",
}: {
  images: string[];
  alt: string;
  /** Foto visível. */
  index: number;
  onIndex: (i: number) => void;
  /** Clique curto (sem arrasto) — amplia a foto. */
  onOpen?: () => void;
  className?: string;
  imageClassName?: string;
}) {
  const srcs = useMemo(() => images.map((s) => productImageSrc(s, GALLERY_WIDTH)), [images]);
  const n = srcs.length;
  const atual = n ? ((index % n) + n) % n : 0;

  const ir = useCallback(
    (passo: number) => {
      if (n < 2) return;
      onIndex((((atual + passo) % n) + n) % n);
    },
    [atual, n, onIndex],
  );

  /* ── arrasto lateral no celular ─────────────────────────────────── */
  const gesto = useRef<{ x: number; y: number; t: number; id: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesto.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    // Arrasto horizontal claro troca a foto; o resto conta como clique curto.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      ir(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && performance.now() - g.t < 500) onOpen?.();
  };

  /* ── setas do teclado, quando o palco está em foco ───────────────── */
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      ir(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      ir(-1);
    } else if ((e.key === "Enter" || e.key === " ") && onOpen) {
      e.preventDefault();
      onOpen();
    }
  };

  /* ── pré-carga das vizinhas: a próxima já chega pronta ───────────── */
  useEffect(() => {
    if (typeof window === "undefined" || n < 2) return;
    for (const passo of [1, -1]) {
      const i = (((atual + passo) % n) + n) % n;
      const img = new Image();
      img.decoding = "async";
      img.src = srcs[i];
    }
  }, [atual, n, srcs]);

  if (!n) return null;

  return (
    <div className={`group relative ${className}`}>
      <div
        tabIndex={0}
        role="group"
        aria-label={`${alt} — foto ${atual + 1} de ${n}. Use as setas para trocar de foto.`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (gesto.current = null)}
        onKeyDown={onKeyDown}
        className="relative h-full w-full cursor-zoom-in touch-pan-y select-none outline-none"
      >
        {srcs.map((src, i) => (
          <img
            key={src + i}
            src={src}
            alt={i === atual ? alt : ""}
            aria-hidden={i !== atual}
            draggable={false}
            decoding="async"
            loading={i === 0 ? "eager" : "lazy"}
            className={`pointer-events-none absolute inset-0 mx-auto h-full w-full object-contain transition-opacity duration-asc ease-asc ${
              i === atual ? "opacity-100" : "opacity-0"
            } ${imageClassName}`}
          />
        ))}
      </div>

      {n > 1 && (
        <>
          <button
            type="button"
            onClick={() => ir(-1)}
            aria-label="Foto anterior"
            className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-asc-line bg-asc-bg-dark/70 text-asc-ink backdrop-blur transition-colors duration-ascfast ease-asc hover:border-asc-gold hover:text-asc-gold md:left-3"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => ir(1)}
            aria-label="Próxima foto"
            className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-asc-line bg-asc-bg-dark/70 text-asc-ink backdrop-blur transition-colors duration-ascfast ease-asc hover:border-asc-gold hover:text-asc-gold md:right-3"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <span className="asc-label pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-asc-line bg-asc-bg-dark/60 px-3 py-1 text-[10px] tabular-nums text-asc-ink-muted backdrop-blur">
            {atual + 1} / {n}
          </span>
        </>
      )}
    </div>
  );
}
