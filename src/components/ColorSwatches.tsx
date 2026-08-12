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
 * Sobre o desenho, refeito depois de ver as bolinhas na loja: o que dá
 * presença a um seletor de cor é o contorno, não o tamanho. A peça preta em
 * fundo escuro era o caso que não funcionava — o círculo virava mancha. A
 * solução está em `ANEL`, logo abaixo. A cor ativa ganha anel dourado com
 * folga, e o ponteiro levanta a bolinha alguns pixels — o suficiente para o
 * cliente entender que aquilo se clica.
 */

const MEDIDAS = {
  /**
   * Grade da vitrine. As medidas crescem a partir de `sm` porque a coluna do
   * celular tem menos de 11rem: quatro bolinhas com folga de dedo cabem ali,
   * e no computador elas ganham o tamanho que a foto grande pede.
   */
  sm: {
    bolinha: "h-5 w-5 sm:h-[22px] sm:w-[22px]",
    area: "h-8 w-8 sm:h-9 sm:w-9",
    gap: "gap-1.5 sm:gap-2",
  },
  /** Página da peça e vitrine giratória, onde há espaço para respirar. */
  md: {
    bolinha: "h-[26px] w-[26px] sm:h-7 sm:w-7",
    area: "h-10 w-10 sm:h-11 sm:w-11",
    gap: "gap-2 sm:gap-2.5",
  },
} as const;

/**
 * Os anéis de cada bolinha.
 *
 * O problema que isto resolve: peça preta em fundo escuro. Um fio escuro em
 * volta de um círculo preto não aparece — a bolinha vira uma mancha. E um fio
 * claro sozinho sumiria numa peça branca em fundo claro.
 *
 * Por isso são dois, sempre, um por cima do outro: um **claro colado no
 * círculo** e um **escuro logo fora dele**. Qualquer cor de peça, em qualquer
 * fundo e nos dois temas, tem pelo menos um dos dois lhe dando contorno. É o
 * mesmo truque dos seletores de cor da Apple e da Nike.
 *
 * Os anéis ficam FORA do círculo (`0 0 0 Npx`, não `inset`) para não comerem a
 * cor — o que importa na bolinha dividida ao meio, onde cada metade tem só uns
 * 10 pixels para se mostrar.
 */
const ANEL = {
  parada:
    "0 0 0 1.5px rgba(255,255,255,0.92), 0 0 0 2.5px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.28)",
  ponteiro:
    "0 0 0 1.5px rgba(255,255,255,0.98), 0 0 0 3px rgba(0,0,0,0.36), 0 8px 16px rgba(0,0,0,0.4)",
  /** Cor em exibição: o anel externo vira o dourado da casa, mais grosso. */
  ativa: "0 0 0 2px rgba(255,255,255,0.96), 0 0 0 4px var(--gold), 0 3px 10px rgba(0,0,0,0.32)",
  ativaPonteiro:
    "0 0 0 2px rgba(255,255,255,1), 0 0 0 4.5px var(--gold), 0 8px 18px rgba(0,0,0,0.42)",
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
              style={
                {
                  background: swatchBackground(p.variant, p.name),
                  // Os dois estados viajam como variáveis para o CSS poder
                  // trocar entre eles no `:hover` — sombra em `style` não tem
                  // como reagir ao ponteiro.
                  "--anel": ativa ? ANEL.ativa : ANEL.parada,
                  "--anel-ponteiro": ativa ? ANEL.ativaPonteiro : ANEL.ponteiro,
                } as React.CSSProperties
              }
              className={`${medida.bolinha} rounded-full shadow-[var(--anel)] transition-[transform,box-shadow] duration-[240ms] ease-asc
                group-hover/cor:-translate-y-[3px] group-hover/cor:scale-110 group-hover/cor:shadow-[var(--anel-ponteiro)]
                group-focus-visible/cor:-translate-y-[3px] group-focus-visible/cor:scale-110 group-focus-visible/cor:shadow-[var(--anel-ponteiro)] ${
                  ativa ? "scale-[1.06]" : ""
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
