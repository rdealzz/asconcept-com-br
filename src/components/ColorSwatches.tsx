import { Link } from "@tanstack/react-router";
import { useCallback } from "react";
import type { Product } from "@/lib/cart-context";
import { productImageSrc } from "@/lib/product-images";
import { productParam, swatchBackground, swatchLabel } from "@/lib/variants";

/**
 * Seletores de cor — as bolinhas embaixo da foto.
 *
 * Sem texto: um álbum com cinco cores vira cinco bolinhas, e o nome da cor
 * chega pelo `title` e pelo rótulo acessível. Peça de duas cores (a preta com
 * logo vermelho, a preta com logo branco) sai dividida ao meio na diagonal —
 * metade a cor da peça, metade a do logo. Sem isso o cliente veria dois
 * quadrados pretos iguais e teria de adivinhar.
 *
 * Cada bolinha é um link de verdade para a página daquela cor, e não um botão
 * que troca a foto: é o que faz o meio do mouse abrir em outra aba, o robô de
 * busca enxergar as variações e o clique levar direto à variação escolhida —
 * sem ter de escolher de novo lá dentro.
 *
 * Sobre o desenho, que foi refeito depois de ver as bolinhas na loja: elas
 * eram pequenas demais e sumiam no fundo. O que dá presença a um seletor de
 * cor é o contorno, não o tamanho — uma bolinha branca sobre fundo claro (ou
 * preta sobre fundo escuro) precisa de dois fios: um claro por dentro e um
 * escuro por fora. Com os dois, qualquer cor se destaca de qualquer fundo, nos
 * dois temas. A cor ativa ganha anel dourado com folga, e o ponteiro levanta a
 * bolinha alguns pixels — o suficiente para o cliente entender que aquilo se
 * clica.
 */

const MEDIDAS = {
  /** Grade da vitrine: cabe numa coluna de celular com quatro cores. */
  sm: { bolinha: "h-[18px] w-[18px]", area: "h-8 w-8", gap: "gap-1.5" },
  /** Página da peça e vitrine giratória, onde há espaço para respirar. */
  md: { bolinha: "h-6 w-6", area: "h-10 w-10", gap: "gap-2" },
} as const;

export function ColorSwatches({
  members,
  activeId,
  size = "sm",
  max,
  className = "",
  onSelect,
  onPreview,
}: {
  members: readonly Product[];
  /** Cor em exibição — ganha o anel dourado. */
  activeId?: string;
  size?: keyof typeof MEDIDAS;
  /** Acima disto a fileira encerra com "+N", para não quebrar o card. */
  max?: number;
  className?: string;
  /** Chamado antes de navegar (fechar um modal, por exemplo). */
  onSelect?: (p: Product) => void;
  /**
   * Ponteiro sobre uma cor (ou saindo de todas, com `null`). É o que permite
   * ao card da vitrine trocar a foto enquanto o cliente passeia pelas cores,
   * antes mesmo de clicar.
   */
  onPreview?: (p: Product | null) => void;
}) {
  const medida = MEDIDAS[size];

  /**
   * A foto da outra cor precisa estar em cache antes do clique.
   *
   * A troca em si é instantânea — o catálogo inteiro já está em memória, e a
   * navegação é do roteador, sem recarregar a página. O que sobraria de espera
   * é a capa da variação, então ela é baixada assim que o ponteiro chega à
   * fileira (não a cada bolinha): quando o cliente decidir, todas já estão
   * prontas.
   */
  const preaquecerTodas = useCallback(() => {
    if (typeof window === "undefined") return;
    for (const p of members) {
      if (!p.image) continue;
      const img = new Image();
      img.decoding = "async";
      img.fetchPriority = "low";
      img.src = productImageSrc(p.image, 1000);
    }
  }, [members]);

  if (members.length < 2) return null;

  const visiveis = max ? members.slice(0, max) : members;
  const resto = members.length - visiveis.length;

  return (
    <div
      className={`flex flex-wrap items-center ${medida.gap} ${className}`}
      role="group"
      aria-label="Cores disponíveis"
      onMouseEnter={preaquecerTodas}
      onTouchStart={preaquecerTodas}
      onMouseLeave={() => onPreview?.(null)}
    >
      {visiveis.map((p) => {
        const rotulo = swatchLabel(p);
        const ativa = p.id === activeId;
        return (
          <Link
            key={p.id}
            to="/produto/$id"
            params={{ id: productParam(p) }}
            title={rotulo}
            aria-label={`Ver na cor ${rotulo}`}
            aria-current={ativa ? "true" : undefined}
            onMouseEnter={() => onPreview?.(p)}
            onFocus={() => onPreview?.(p)}
            onClick={() => onSelect?.(p)}
            // A área clicável é bem maior que a bolinha — é ela que dá o alvo
            // de dedo no celular sem inchar o desenho.
            className={`group/cor grid ${medida.area} place-items-center rounded-full focus-visible:outline-none`}
          >
            <span
              aria-hidden
              style={{ background: swatchBackground(p.variant, p.name) }}
              className={`${medida.bolinha} rounded-full ring-1 ring-asc-ink/25 transition-[transform,box-shadow] duration-[240ms] ease-asc
                shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.25)]
                group-hover/cor:-translate-y-[3px] group-hover/cor:scale-110
                group-hover/cor:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3),0_6px_12px_rgba(0,0,0,0.35)]
                group-focus-visible/cor:-translate-y-[3px] group-focus-visible/cor:scale-110 ${
                  ativa
                    ? "scale-105 ring-2 ring-asc-gold ring-offset-2 ring-offset-background shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3),0_0_0_1px_rgba(197,160,89,0.35),0_4px_10px_rgba(0,0,0,0.3)]"
                    : ""
                }`}
            />
          </Link>
        );
      })}
      {resto > 0 && (
        <span className="pl-0.5 text-[11px] tabular-nums text-asc-ink-muted">+{resto}</span>
      )}
    </div>
  );
}
