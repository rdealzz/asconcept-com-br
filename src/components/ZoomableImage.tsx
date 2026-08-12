import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, RotateCcw, X, ZoomIn } from "lucide-react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type Props = {
  src: string;
  alt: string;
  /** classe aplicada à imagem inline */
  className?: string;
};

/**
 * Imagem do produto com lupa no hover (desktop) e visualizador ampliado
 * em tela cheia com roda do mouse, arrasto e pinça.
 */
export function ZoomableImage({ src, alt, className = "" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="relative h-full w-full cursor-zoom-in" onClick={() => setOpen(true)}>
        <img src={src} alt={alt} className={`h-full w-full ${className}`} />
        <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 bg-charcoal/70 px-2.5 py-1 text-[10px] tracking-luxe uppercase text-ivory">
          <ZoomIn className="h-3 w-3" strokeWidth={1.5} />
          Ampliar
        </span>
      </div>

      {open && <ZoomViewer src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function ZoomViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const stateRef = useRef({ zoom, offset });
  stateRef.current = { zoom, offset };

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomAt = useCallback((next: number, px: number, py: number) => {
    const { zoom: z, offset: o } = stateRef.current;
    const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
    const k = clamped / z;
    setZoom(clamped);
    setOffset(
      clamped === MIN_ZOOM ? { x: 0, y: 0 } : { x: px - (px - o.x) * k, y: py - (py - o.y) * k },
    );
  }, []);

  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const next = stateRef.current.zoom * Math.exp(-dy * 0.0018);
      zoomAtRef.current(next, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stepZoom = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    zoomAt(stateRef.current.zoom * factor, r.width / 2, r.height / 2);
  };

  const body = typeof document !== "undefined" ? document.body : null;
  if (!body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex flex-col bg-charcoal animate-in fade-in duration-200">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-serif text-sm text-ivory">{alt}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => stepZoom(1 / 1.4)}
            aria-label="Diminuir zoom"
            className="rounded-full p-2 text-ivory/80 hover:text-accent"
          >
            <Minus className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <span className="w-12 text-center text-[11px] tabular-nums text-ivory/70">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => stepZoom(1.4)}
            aria-label="Aumentar zoom"
            className="rounded-full p-2 text-ivory/80 hover:text-accent"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={reset}
            aria-label="Redefinir zoom"
            className="rounded-full p-2 text-ivory/80 hover:text-accent"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-2 text-ivory/80 hover:text-accent"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden touch-none select-none"
        style={{ cursor: zoom > 1 ? (drag.current ? "grabbing" : "grab") : "zoom-in" }}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          zoomAt(zoom > 1 ? 1 : 2.5, e.clientX - r.left, e.clientY - r.top);
        }}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: drag.current ? "none" : "transform 0.12s ease-out",
          }}
        />
      </div>

      <p className="pb-4 text-center text-[10px] tracking-luxe uppercase text-ivory/50">
        Role para ampliar · arraste para mover · duplo clique para alternar
      </p>
    </div>,
    body,
  );
}

export default ZoomableImage;
