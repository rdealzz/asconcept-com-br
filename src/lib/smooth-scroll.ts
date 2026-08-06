/**
 * Trava de rolagem.
 *
 * Antes este arquivo também interceptava a roda do mouse e perseguia um
 * destino a cada quadro ("rolagem suave" feita à mão). O efeito colateral era
 * o que se sentia como site pesado: cada gesto da roda virava dezenas de
 * `window.scrollTo`, forçando recálculo de layout na página inteira e
 * atrasando o movimento em relação ao dedo. A rolagem nativa do navegador já
 * é suave, roda fora da thread principal e responde na hora — então ela ficou.
 *
 * O que sobrou aqui é só o que a rolagem nativa não dá de graça: travar a
 * página quando a sacola, um modal ou a tela de abertura estão abertos.
 */

let travas = 0;
/** Posição da página no momento em que ela foi travada. */
let topoSalvo = 0;

/**
 * Trava a rolagem da página (sacola aberta, modal, tela de abertura).
 * Conta chamadas: dois travamentos exigem dois destravamentos, então fechar um
 * modal não libera a rolagem enquanto outro ainda estiver aberto.
 */
export function travarRolagem() {
  travas += 1;
  if (travas > 1 || typeof document === "undefined") return;

  topoSalvo = window.scrollY;
  const barra = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.overflow = "hidden";
  // Compensa o sumiço da barra de rolagem, senão o conteúdo dá um pulo lateral.
  if (barra > 0) document.body.style.paddingRight = `${barra}px`;
}

export function destravarRolagem() {
  travas = Math.max(0, travas - 1);
  if (travas > 0 || typeof document === "undefined") return;

  document.documentElement.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  // Alguns navegadores devolvem a página ao topo ao liberar o overflow.
  if (topoSalvo > 0 && window.scrollY === 0) window.scrollTo(0, topoSalvo);
}
