import { Link } from "@tanstack/react-router";
import { formatBRL } from "@/lib/cart-context";
import { productParam } from "@/lib/variants";

/**
 * Nome e preço abaixo da foto — o rodapé de todo card de listagem.
 *
 * Existe como componente porque a grade da home e o carrossel "Complete o
 * Look" mostravam a mesma coisa de dois jeitos diferentes, e só um deles
 * aguentava nome longo. A regra agora é uma só, em um lugar só.
 *
 * Duas decisões sustentam o alinhamento da grade:
 *
 *   1. o nome ocupa duas linhas SEMPRE — `line-clamp-2` corta o que passar, e
 *      a altura mínima de duas linhas reserva o espaço mesmo quando o nome tem
 *      uma só. Sem isso, cards de nomes curtos e longos terminam em alturas
 *      diferentes e o preço fica em degraus ao longo da fileira;
 *   2. nome e preço são empilhados, nunca lado a lado. Na grade de duas colunas
 *      do celular sobra menos de 10rem por card, e dividir essa largura com o
 *      preço espremia o nome a ponto de cair uma palavra por linha.
 */
export function ProductCardMeta({
  id,
  name,
  price,
  className = "",
}: {
  id: string;
  name: string;
  price: number;
  className?: string;
}) {
  return (
    <div className={`mt-3 flex flex-col gap-1 ${className}`}>
      <h3 className="font-display text-[0.9rem] leading-snug text-asc-ink sm:text-base">
        <Link
          to="/produto/$id"
          params={{ id: productParam({ id, name }) }}
          // `min-h` em `em` acompanha o corpo do texto em cada breakpoint, então
          // as duas linhas reservadas continuam valendo quando a fonte cresce.
          className="line-clamp-2 min-h-[2.75em] break-words transition-colors duration-ascfast ease-asc hover:text-asc-gold"
        >
          {name}
        </Link>
      </h3>
      <span className="font-sans text-sm tabular-nums text-asc-ink">{formatBRL(price)}</span>
    </div>
  );
}
