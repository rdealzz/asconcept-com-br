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
 */

const MEDIDAS = {
  sm: { bolinha: "h-4 w-4", area: "h-7 w-7", gap: "gap-1" },
  md: { bolinha: "h-5 w-5", area: "h-8 w-8", gap: "gap-1.5" },
} as const;

export function ColorSwatches({
  members,
  activeId,
  size = "sm",
  max,
  className = "",
  onSelect,
}: {
  members: readonly Product[];
  /** Cor em exibição — ganha o anel. */
  activeId?: string;
  size?: keyof typeof MEDIDAS;
  /** Acima disto a fileira encerra com "+N", para não quebrar o card. */
  max?: number;
  className?: string;
  /** Chamado antes de navegar (fechar um modal, por exemplo). */
  onSelect?: (p: Product) => void;
}) {
  const medida = MEDIDAS[size];

  /**
   * A foto da outra cor precisa estar em cache antes do clique.
   *
   * A troca em si é instantânea — o catálogo inteiro já está em memória, e a
   * navegação é do roteador, sem recarregar a página. O que sobraria de espera
   * é a capa da variação, então ela é baixada ao passar o mouse (ou ao encostar
   * o dedo), enquanto o cliente ainda está decidindo.
   */
  const preaquecer = useCallback((p: Product) => {
    if (!p.image || typeof window === "undefined") return;
    const img = new Image();
    img.decoding = "async";
    img.fetchPriority = "low";
    img.src = productImageSrc(p.image, 1000);
  }, []);

  if (members.length < 2) return null;

  const visiveis = max ? members.slice(0, max) : members;
  const resto = members.length - visiveis.length;

  return (
    <div
      className={`flex flex-wrap items-center ${medida.gap} ${className}`}
      role="group"
      aria-label="Cores disponíveis"
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
            onMouseEnter={() => preaquecer(p)}
            onTouchStart={() => preaquecer(p)}
            onClick={() => onSelect?.(p)}
            className={`grid ${medida.area} place-items-center rounded-full transition-transform duration-ascfast ease-asc hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-asc-gold ${
              ativa ? "ring-1 ring-asc-gold ring-offset-2 ring-offset-background" : ""
            }`}
          >
            <span
              aria-hidden
              className={`${medida.bolinha} rounded-full border border-asc-ink/15 shadow-[0_1px_2px_rgba(0,0,0,0.18)]`}
              style={{ background: swatchBackground(p.variant, p.name) }}
            />
          </Link>
        );
      })}
      {resto > 0 && (
        <span className="pl-0.5 text-[10px] tabular-nums text-muted-foreground">+{resto}</span>
      )}
    </div>
  );
}
