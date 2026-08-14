import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * `useLayoutEffect` no navegador, `useEffect` no servidor.
 *
 * A diferença importa aqui: quem volta para a home dentro da mesma sessão
 * precisa que a cortina saia ANTES da primeira pintura, senão ela pisca. O
 * `useLayoutEffect` garante isso — e reclamaria em voz alta se rodasse na
 * renderização do servidor, onde não existe layout para medir.
 */
const useEfeitoDeLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

const MIN_VISIBLE_MS = 700;
const MAX_VISIBLE_MS = 1500;
const EXIT_MS = 600;

/**
 * Marca de que a cortina já foi exibida nesta visita.
 *
 * `sessionStorage`, e não `localStorage`, de propósito: quem volta amanhã
 * merece ver a abertura de novo — ela é parte da marca. Quem está navegando
 * agora, não.
 */
const CHAVE_SESSAO = "asconcept.aberturaVista";

/** Já viu a cortina nesta sessão? Falha fechada: na dúvida, mostra. */
function jaViuNestaSessao(): boolean {
  try {
    return window.sessionStorage.getItem(CHAVE_SESSAO) === "1";
  } catch {
    return false;
  }
}

function marcarVista(): void {
  try {
    window.sessionStorage.setItem(CHAVE_SESSAO, "1");
  } catch {
    /* modo privativo ou armazenamento cheio — só perde a memória da sessão */
  }
}

/**
 * Abertura da home.
 *
 * Cortina em obsidiana com o wordmark e uma barra que enche, some para cima e
 * só então libera as animações do hero — é o que dá o "momento" de entrada em
 * vez de a página aparecer pela metade enquanto as fontes e fotos chegam.
 *
 * Duas coisas mudaram depois da auditoria, e as duas custavam venda:
 *
 *   1. **Uma vez por sessão.** Ela rodava em TODA visita à home. Quem entrava
 *      numa peça e voltava assistia de novo, e de novo — e o cliente que
 *      chegou pelo Instagram encontrava uma porta fechada antes da vitrine. É
 *      também o que o Google mede como LCP: a cortina, não a loja;
 *   2. **Sem travar a rolagem.** Segurar a página parada por até 2,6 s é o
 *      tipo de atrito que faz desistir. Agora a pessoa pode rolar por baixo da
 *      cortina enquanto ela sai.
 *
 * O tempo também encolheu: 700 ms de piso (era 1,4 s) e 1,5 s de teto (era
 * 2,6 s). O momento continua existindo; a espera, não.
 *
 * `onReady` avisa a home para começar a animar.
 */
export function Loader({ onReady }: { onReady: () => void }) {
  const [saindo, setSaindo] = useState(false);
  const [removido, setRemovido] = useState(false);

  // O callback fica numa ref: como ele nasce novo a cada render do pai, tê-lo
  // nas dependências fazia o efeito reiniciar e cancelar os próprios
  // temporizadores — a cortina nunca saía.
  const aoPronto = useRef(onReady);
  aoPronto.current = onReady;

  /**
   * A cortina nasce montada, no servidor e no navegador.
   *
   * Decidir no primeiro render (lendo `sessionStorage`) seria mais direto, mas
   * o servidor não tem `sessionStorage`: ele renderizaria a cortina e o
   * navegador, na hidratação, diria que não — e árvore que não bate é erro de
   * hidratação, com a home repintada inteira por causa disso. Então a decisão
   * fica no efeito de layout, que roda antes da primeira pintura.
   */
  useEfeitoDeLayout(() => {
    // Já viu a abertura nesta sessão: sai antes de pintar, sem animação. É o
    // caso de quem entrou numa peça e voltou para a home.
    if (jaViuNestaSessao()) {
      setRemovido(true);
      aoPronto.current();
      return;
    }

    const reduzido = prefersReducedMotion();
    const minVisivel = reduzido ? 200 : MIN_VISIBLE_MS;
    const saida = reduzido ? 0 : EXIT_MS;

    marcarVista();

    let encerrado = false;
    let tContagem = 0;
    let tRemocao = 0;

    const encerrar = () => {
      if (encerrado) return;
      encerrado = true;
      aoPronto.current();
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
    };
  }, []);

  if (removido) return null;

  const reduzido = prefersReducedMotion();

  return (
    <div
      aria-hidden
      // Sem captar ponteiro: a cortina é decoração, e quem já quer rolar (ou
      // tocar num link do hero que aparece por trás dela) não deve esbarrar
      // numa camada invisível de meio segundo.
      className="pointer-events-none fixed inset-0 z-[200] flex flex-col items-center justify-center gap-8 bg-asc-bg-dark text-asc-ink"
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
