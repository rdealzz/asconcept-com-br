/**
 * Rolagem suave.
 *
 * Escrita à mão de propósito: o lockfile deste projeto aponta para um registro
 * privado, e somar uma dependência nova arriscaria o build. São poucas linhas
 * e, em troca, dá para desligar a rolagem com precisão quando abre a sacola,
 * um modal ou a tela de abertura.
 *
 * Como funciona: intercepta a roda do mouse, acumula o destino e persegue esse
 * destino a cada quadro. Toque não é interceptado — no celular a rolagem
 * nativa já é suave e mexer nela costuma piorar.
 */

type Estado = {
  ativo: boolean;
  alvo: number;
  atual: number;
  raf: number;
  travas: number;
};

const est: Estado = { ativo: false, alvo: 0, atual: 0, raf: 0, travas: 0 };

/** Quanto do caminho até o destino é percorrido por quadro. */
const SUAVIDADE = 0.1;

function suportado() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  // Sem ponteiro fino (celular/tablet) fica com a rolagem nativa.
  return window.matchMedia("(min-width: 769px) and (hover: hover)").matches;
}

function limite() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

/** Última posição que NÓS aplicamos — serve para reconhecer rolagem externa. */
let ultimoAplicado = -1;

function quadro() {
  est.raf = requestAnimationFrame(quadro);
  if (est.travas > 0) return;

  const y = window.scrollY;

  // Se a página está numa posição que não fomos nós que definimos, ela veio de
  // fora (âncora, teclado, barra de rolagem, scrollTo de código). Adotamos essa
  // posição em vez de puxar o cliente de volta — era isso que travava a página.
  if (ultimoAplicado < 0 || Math.abs(y - ultimoAplicado) > 2) {
    est.atual = y;
    est.alvo = y;
    ultimoAplicado = y;
    return;
  }

  const dif = est.alvo - est.atual;
  if (Math.abs(dif) < 0.4) {
    est.atual = est.alvo;
    return; // já chegou: não mexe na página, para não brigar com ninguém
  }
  est.atual += dif * SUAVIDADE;
  window.scrollTo(0, est.atual);
  ultimoAplicado = window.scrollY;
}

function naRoda(e: WheelEvent) {
  if (est.travas > 0) return;
  // Deixa passar quando o cursor está sobre algo que rola por dentro
  // (a sacola, um acordeão com scroll próprio).
  let n = e.target as HTMLElement | null;
  while (n && n !== document.body) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return;
    n = n.parentElement;
  }
  e.preventDefault();
  est.alvo = Math.min(limite(), Math.max(0, est.alvo + e.deltaY));
}

export function iniciarRolagemSuave() {
  if (est.ativo || !suportado()) return;
  est.ativo = true;
  est.atual = window.scrollY;
  est.alvo = window.scrollY;
  ultimoAplicado = -1;
  window.addEventListener("wheel", naRoda, { passive: false });
  est.raf = requestAnimationFrame(quadro);
}

export function pararRolagemSuave() {
  if (!est.ativo) return;
  est.ativo = false;
  window.removeEventListener("wheel", naRoda);
  cancelAnimationFrame(est.raf);
  est.raf = 0;
}

/**
 * Trava a rolagem da página (sacola aberta, modal, tela de abertura).
 * Conta chamadas: dois travamentos exigem dois destravamentos, então fechar um
 * modal não libera a rolagem enquanto outro ainda estiver aberto.
 */
export function travarRolagem() {
  est.travas += 1;
  if (est.travas === 1 && typeof document !== "undefined") {
    document.documentElement.style.overflow = "hidden";
  }
}

export function destravarRolagem() {
  est.travas = Math.max(0, est.travas - 1);
  if (est.travas === 0 && typeof document !== "undefined") {
    document.documentElement.style.removeProperty("overflow");
    est.atual = window.scrollY;
    est.alvo = window.scrollY;
  }
}
