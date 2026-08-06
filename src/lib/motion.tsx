import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Base de movimento da A&S Conccept.
 *
 * Tudo aqui é feito à mão, sem biblioteca de animação: molas integradas num
 * único requestAnimationFrame, revelações por máscara de recorte e um
 * observador de entrada em tela. O objetivo é a mesma sensação de mola das
 * bibliotecas conhecidas, sem somar peso ao pacote nem dependência nova.
 */

export type Spring = { tension: number; friction: number };

/** Curvas usadas nas revelações de texto e na tela de abertura. */
export const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Respeita quem pediu menos animação no sistema. */
export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Efeitos de hover ficam desligados no celular, onde não existe ponteiro. */
export function hoverEnabled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 769px) and (hover: hover)").matches;
}

/* ─────────────────────────── molas ─────────────────────────── */

type SpringState = { x: number; v: number; target: number };

const springs = new Set<{
  state: SpringState;
  config: Spring;
  apply: (v: number) => void;
}>();

let rafId = 0;
let lastT = 0;

function tick(t: number) {
  const dt = Math.min(0.064, (t - lastT) / 1000 || 0.016);
  lastT = t;
  for (const s of springs) {
    const { state, config } = s;
    const dx = state.x - state.target;
    // Integração simples: aceleração = -tensão·deslocamento - atrito·velocidade
    state.v += (-config.tension * dx - config.friction * state.v) * dt;
    state.x += state.v * dt;
    // Perto o bastante e devagar o bastante: encaixa no alvo e para de gastar quadro.
    if (Math.abs(state.x - state.target) < 0.0005 && Math.abs(state.v) < 0.0005) {
      state.x = state.target;
      state.v = 0;
    }
    s.apply(state.x);
  }
  rafId = requestAnimationFrame(tick);
}

function ensureLoop() {
  if (!rafId) {
    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
  }
}

/**
 * Anima um número de 0 a 1 com física de mola e entrega o valor a cada quadro.
 * Devolve uma função para mudar o alvo.
 */
export function useSpringValue(config: Spring, apply: (v: number) => void, initial = 0) {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const entry = useRef<{ state: SpringState; config: Spring; apply: (v: number) => void }>(null!);

  if (!entry.current) {
    entry.current = {
      state: { x: initial, v: 0, target: initial },
      config,
      apply: (v) => applyRef.current(v),
    };
  }

  useEffect(() => {
    const e = entry.current;
    if (prefersReducedMotion()) {
      // Sem animação: vai direto ao alvo a cada mudança.
      return;
    }
    springs.add(e);
    ensureLoop();
    return () => {
      springs.delete(e);
      if (springs.size === 0 && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
  }, []);

  return (target: number) => {
    const e = entry.current;
    e.state.target = target;
    if (prefersReducedMotion()) {
      e.state.x = target;
      e.state.v = 0;
      applyRef.current(target);
    }
  };
}

/* ─────────────────── entrada em tela (Inview) ─────────────────── */

/**
 * Dispara uma única vez quando o elemento entra na tela.
 * `delayIn` em milissegundos, para escalonar itens de uma lista.
 */
export function useInview<T extends HTMLElement>(delayIn = 0) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setShown(true);
      return;
    }
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.disconnect();
          timer = window.setTimeout(() => setShown(true), delayIn);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [delayIn]);

  return { ref, shown };
}

/**
 * Bloco que sobe e aparece ao entrar na tela.
 * É a revelação padrão das seções.
 */
export function Inview({
  children,
  delayIn = 0,
  y = 28,
  scale,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delayIn?: number;
  y?: number;
  scale?: number;
  className?: string;
  as?: "div" | "li" | "article" | "figure" | "section";
}) {
  const { ref, shown } = useInview<HTMLDivElement>(delayIn);
  const from = [y ? `translateY(${y}px)` : "", scale ? `scale(${scale})` : ""]
    .filter(Boolean)
    .join(" ");

  const style: CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : from || "none",
    transition:
      "opacity 700ms cubic-bezier(0.16,1,0.3,1), transform 700ms cubic-bezier(0.16,1,0.3,1)",
    willChange: shown ? "auto" : "opacity, transform",
  };

  return (
    <Tag ref={ref as never} className={className} style={style}>
      {children}
    </Tag>
  );
}

/* ─────────────────── revelação de texto ─────────────────── */

/**
 * Título que sobe de trás de uma máscara, palavra por palavra.
 *
 * Cada palavra vive numa caixa com `overflow:hidden`; o miolo começa 115%
 * abaixo e sobe. O `padding-bottom` na caixa existe para a máscara não cortar
 * as descidas de letras como "g" e "ç".
 */
export function WordReveal({
  text,
  play = true,
  stagger = 140,
  duration = 1100,
  delay = 0,
  className = "",
  wordClassName = "",
}: {
  text: string;
  play?: boolean;
  stagger?: number;
  duration?: number;
  delay?: number;
  className?: string;
  wordClassName?: string;
}) {
  const words = text.split(" ").filter(Boolean);
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          className="inline-block overflow-hidden align-bottom"
          style={{ paddingBottom: "0.12em" }}
        >
          <span
            className={`inline-block ${wordClassName}`}
            style={{
              transform: play ? "translateY(0)" : "translateY(115%)",
              opacity: play ? 1 : 0,
              transition: `transform ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay + i * stagger}ms, opacity ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay + i * stagger}ms`,
            }}
          >
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

/**
 * Linhas empilhadas que sobem uma após a outra, cada uma sob sua máscara.
 * Usado nos títulos de seção.
 */
export function StackedLines({
  lines,
  play,
  stagger = 120,
  duration = 950,
  baseDelay = 0,
  className = "",
}: {
  lines: string[];
  play?: boolean;
  stagger?: number;
  duration?: number;
  baseDelay?: number;
  className?: string;
}) {
  const { ref, shown } = useInview<HTMLSpanElement>(0);
  const visible = play ?? shown;

  return (
    <span ref={ref} className={`block ${className}`}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden" style={{ paddingBottom: "0.14em" }}>
          <span
            className="block"
            style={{
              transform: visible ? "translateY(0)" : "translateY(115%)",
              opacity: visible ? 1 : 0,
              transition: `transform ${duration}ms cubic-bezier(0.16,1,0.3,1) ${baseDelay + i * stagger}ms, opacity ${duration}ms cubic-bezier(0.16,1,0.3,1) ${baseDelay + i * stagger}ms`,
            }}
          >
            {line}
          </span>
        </span>
      ))}
    </span>
  );
}

/* ─────────────────── parallax por rolagem ─────────────────── */

/**
 * Mapeia a passagem do elemento pela tela (0 quando o topo dele encosta na
 * base da janela, 1 quando a base dele encosta no topo) e entrega esse
 * progresso a cada quadro. Usado no deslocamento da foto do hero e nas
 * palavras-fantasma.
 */
export function useScrollProgress<T extends HTMLElement>(onProgress: (p: number) => void) {
  const ref = useRef<T>(null);
  const cb = useRef(onProgress);
  cb.current = onProgress;

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    const medir = () => {
      const r = el.getBoundingClientRect();
      const total = window.innerHeight + r.height;
      const p = total === 0 ? 0 : (window.innerHeight - r.top) / total;
      cb.current(Math.min(1, Math.max(0, p)));
      raf = requestAnimationFrame(medir);
    };
    raf = requestAnimationFrame(medir);
    return () => cancelAnimationFrame(raf);
  }, []);

  return ref;
}
