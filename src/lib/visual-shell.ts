import { useEffect } from "react";

/** Largura de referência do desenho e coeficiente de ampliação acima dela. */
const BASE_W = 1920;
const FONT_BASE = 16;
const COEF = 0.6666;

/**
 * Prepara uma rota para o desenho novo: escala adaptativa.
 *
 * A escala mora no `font-size` do <html>, então precisa ser ligada e desligada
 * por rota — solta, ela escalaria também o checkout, que não faz parte deste
 * redesenho. O atributo `data-fluid` é o que ativa as media queries do CSS.
 *
 * A rolagem é a nativa do navegador. A versão anterior interceptava a roda do
 * mouse para "suavizar" o movimento, e era justamente isso que deixava a
 * página lenta e arrastada.
 */
export function useVisualShell() {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-fluid", "1");

    // Abaixo de 1920 quem manda são as media queries; acima, cresce por aqui.
    const ajustar = () => {
      const reducao = ((BASE_W - window.innerWidth) / BASE_W) * 100 * COEF;
      const tamanho = FONT_BASE - (FONT_BASE * reducao) / 100;
      if (tamanho > FONT_BASE) html.style.fontSize = `${tamanho}px`;
      else html.style.removeProperty("font-size");
    };
    ajustar();
    window.addEventListener("resize", ajustar, { passive: true });

    return () => {
      window.removeEventListener("resize", ajustar);
      html.removeAttribute("data-fluid");
      html.style.removeProperty("font-size");
    };
  }, []);
}
