import { useEffect, useRef, useState } from "react";

/**
 * "Este elemento está chegando na tela?" — com um observador só para a página
 * inteira.
 *
 * Um IntersectionObserver por card custa caro numa grade de dezenas de peças:
 * cada um é um objeto do navegador, com sua própria conta de interseção a cada
 * rolagem. Aqui existe um observador por margem usada, compartilhado por todos
 * os elementos, e o retorno de chamada de cada um fica num mapa.
 *
 * Dispara uma vez e para de observar: serve para começar um pré-carregamento,
 * não para acompanhar a visibilidade ao longo do tempo.
 */

type Alvo = Element;

const observadores = new Map<string, IntersectionObserver>();
const inscritos = new WeakMap<Alvo, () => void>();

function observadorDe(margem: string): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  const existente = observadores.get(margem);
  if (existente) return existente;

  const novo = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        const avisar = inscritos.get(e.target);
        // Só uma vez: quem já foi avisado sai da lista antes de qualquer coisa,
        // para um segundo quadro de interseção não repetir o trabalho.
        inscritos.delete(e.target);
        novo.unobserve(e.target);
        avisar?.();
      }
    },
    { rootMargin: margem },
  );
  observadores.set(margem, novo);
  return novo;
}

/**
 * `true` assim que o elemento entra na margem pedida — e nunca volta a `false`.
 *
 * @param margem Quanto antes da borda da tela contar como "chegando". Uma tela
 *   inteira de antecedência é o padrão: dá tempo de a foto do hover chegar
 *   antes de o cliente encostar o mouse no card.
 */
export function useNearViewport<T extends Element>(margem = "600px") {
  const ref = useRef<T | null>(null);
  const [perto, setPerto] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (perto || !el) return;

    const obs = observadorDe(margem);
    // Sem IntersectionObserver (navegador antigo, ambiente de teste), o
    // conservador é assumir que está à vista — o pré-carregamento acontece
    // cedo demais, e não deixa de acontecer.
    if (!obs) {
      setPerto(true);
      return;
    }

    inscritos.set(el, () => setPerto(true));
    obs.observe(el);
    return () => {
      inscritos.delete(el);
      obs.unobserve(el);
    };
  }, [margem, perto]);

  return [ref, perto] as const;
}

/** Roda no tempo ocioso do navegador, com recuo para `setTimeout`. */
export function noOcioso(fn: () => void, atrasoMax = 1500): () => void {
  if (typeof window === "undefined") return () => {};
  const ocioso = window.requestIdleCallback;
  if (!ocioso) {
    const t = window.setTimeout(fn, Math.min(400, atrasoMax));
    return () => window.clearTimeout(t);
  }
  const id = ocioso(fn, { timeout: atrasoMax });
  return () => window.cancelIdleCallback?.(id);
}

/**
 * `true` quando o cliente pediu economia de dados. Pré-carregar foto de hover
 * num plano limitado é gastar o dado dele com um efeito que ele talvez nem
 * use — nesse caso a foto só chega quando ele encostar no card.
 */
export function economizandoDados(): boolean {
  if (typeof navigator === "undefined") return false;
  const conexao = (navigator as { connection?: { saveData?: boolean } }).connection;
  return conexao?.saveData === true;
}

/**
 * `true` num aparelho com ponteiro que paira — mouse, trackpad.
 *
 * Celular não tem hover: a segunda foto do card nunca vai aparecer ali. Baixar
 * essa foto no telefone seria dobrar os bytes da vitrine em troca de um efeito
 * que aquele aparelho não consegue exibir.
 */
export function temHover(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
