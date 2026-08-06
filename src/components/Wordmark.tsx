import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/**
 * A assinatura "A&S Conccept" — sempre clicável, sempre voltando à home.
 *
 * Em toda página interna (checkout, pedidos, institucionais) o wordmark era
 * texto morto: o cliente clicava e nada acontecia. Como logo no topo, é o
 * primeiro lugar onde se procura a saída — então aqui ele é um link de
 * verdade, com o mesmo realce dourado no hover em todas as abas.
 *
 * `className` continua controlando a tipografia de cada página; o que a
 * component garante é o destino, o rótulo acessível e a interação.
 */
export function Wordmark({
  className = "",
  children,
}: {
  className?: string;
  /** Sobrescreve o texto — para variações como "A&S" ou com o & dourado. */
  children?: ReactNode;
}) {
  return (
    <Link
      to="/"
      aria-label="A&S Conccept — ir para a página inicial"
      title="Ir para a página inicial"
      className={`inline-block cursor-pointer rounded-sm transition-colors duration-ascfast ease-asc hover:text-asc-gold ${className}`}
    >
      {children ?? <>A&amp;S Conccept</>}
    </Link>
  );
}
