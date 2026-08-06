import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { travarRolagem, destravarRolagem } from "@/lib/smooth-scroll";

const MIN_VISIBLE_MS = 1400;
const MAX_VISIBLE_MS = 2600;
const EXIT_MS = 850;

/**
 * Abertura da home.
 *
 * Cortina em obsidiana com o wordmark e uma barra que enche, some para cima e
 * só então libera as animações do hero — é o que dá o "momento" de entrada em
 * vez de a página aparecer pela metade enquanto as fontes e fotos chegam.
 *
 * `onReady` avisa a home para começar a animar. A rolagem fica travada até lá.
 */
export function Loader({ onReady }: { onReady: () => void }) {
  const [saindo, setSaindo] = useState(false);
  const [removido, setRemovido] = useState(false);

  // O callback fica numa ref: como ele nasce novo a cada render do pai, tê-lo
  // nas dependências fazia o efeito reiniciar e cancelar os próprios
  // temporizadores — a cortina nunca saía.
  const aoPronto = useRef(onReady);
  aoPronto.current = onReady;

  useEffect(() => {
    const reduzido = prefersReducedMotion();
    const minVisivel = reduzido ? 200 : MIN_VISIBLE_MS;
    const saida = reduzido ? 0 : EXIT_MS;

    travarRolagem();
    window.scrollTo(0, 0);

    let encerrado = false;
    let tContagem = 0;
    let tRemocao = 0;

    const encerrar = () => {
      if (encerrado) return;
      encerrado = true;
      aoPronto.current();
      destravarRolagem();
      setSaindo(true);
      tRemocao = window.setTimeout(() => setRemovido(true), saida);
    };

    const iniciarContagem = () => {
      window.clearTimeout(tContagem);
      tContagem = window.setTimeout(encerrar, minVisivel);
    };

    if (document.readyState === "complete") iniciarContagem();
    else window.addEventListener("load", iniciarContagem, { once: true });

    // Se o evento de carregamento nunca vier, não deixa o cliente preso.
    const tTeto = window.setTimeout(encerrar, MAX_VISIBLE_MS);

    return () => {
      window.removeEventListener("load", iniciarContagem);
      window.clearTimeout(tContagem);
      window.clearTimeout(tTeto);
      window.clearTimeout(tRemocao);
      if (!encerrado) destravarRolagem();
    };
  }, []);

  if (removido) return null;

  const reduzido = prefersReducedMotion();

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-8 bg-asc-bg-dark text-asc-ink"
      style={{
        transform: saindo ? "translateY(-105%)" : "translateY(0)",
        transition: reduzido ? "none" : `transform ${EXIT_MS}ms cubic-bezier(0.65,0,0.35,1)`,
      }}
    >
      <div className="flex flex-col items-center gap-2">
        <span className="asc-heading-tracked text-2xl text-asc-gold">A&amp;S Conccept</span>
        <span className="asc-tagline text-[0.6rem]">Curadoria de Herança</span>
      </div>

      <div className="h-px w-40 overflow-hidden rounded-full bg-asc-ink/20">
        <div
          className="h-full w-full origin-left bg-asc-gold"
          style={{
            transform: "scaleX(var(--fill, 0))",
            animation: reduzido
              ? "none"
              : `asc-loader-fill ${MIN_VISIBLE_MS - 120}ms cubic-bezier(0.65,0,0.35,1) 120ms both`,
          }}
        />
      </div>
    </div>
  );
}
