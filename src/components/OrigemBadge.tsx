import { ORDER_ORIGIN_LABELS, type OrderOrigin } from "@/lib/types";

/**
 * Selo de origem do pedido.
 *
 * Duas vendas que se parecem na lista e não se parecem na vida: a do site
 * percorre preparação, envio e entrega, com e-mail a cada etapa; a de balcão
 * costuma nascer fechada, porque a peça já saiu com o cliente. O selo é o que
 * deixa o admin ver de qual delas se trata sem abrir o pedido.
 *
 * Mora aqui, e não na rota onde apareceu primeiro, porque as duas telas de
 * pedido o usam — e um `import` de rota para rota arrastaria a home inteira
 * para dentro do pacote de `/pedidos`.
 *
 * A cor segue a paleta do painel em vez do verde/azul do pedido original: no
 * fundo escuro do ateliê, dois pastéis saturados viram ilhas que não pertencem
 * à identidade. Dourado é a loja; cinza contido é o balcão.
 */
export function OrigemBadge({
  origin,
  className = "",
}: {
  origin: OrderOrigin;
  className?: string;
}) {
  const online = origin === "online";
  return (
    <span
      title={online ? "Pedido feito pelo site" : "Venda registrada à mão no painel"}
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[9px] tracking-luxe uppercase ${
        online
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-border bg-secondary text-muted-foreground"
      } ${className}`}
    >
      <span aria-hidden>{online ? "●" : "◆"}</span>
      {ORDER_ORIGIN_LABELS[origin]}
    </span>
  );
}
