import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useOrders } from "@/lib/orders-context";
import { formatBRL } from "@/lib/cart-context";
import { StatusBadge, paymentLabel } from "./pedidos.index";

export const Route = createFileRoute("/pedidos/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Detalhes do Pedido — A&S Conccept" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderDetail,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="font-serif text-3xl">Pedido não encontrado</h1>
      <Link to="/pedidos" className="mt-6 inline-block text-sm underline">
        Ver todos os pedidos
      </Link>
    </div>
  ),
});

function OrderDetail() {
  const { id } = Route.useParams();
  const { getById } = useOrders();
  const { user } = useAuth();
  const order = getById(id);

  if (!order) {
    throw notFound();
  }
  if (user && !user.isAdmin && order.customerEmail.toLowerCase() !== user.email.toLowerCase()) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center">
          <h1 className="font-serif text-3xl">Sem acesso a este pedido</h1>
          <Link to="/pedidos" className="mt-6 inline-block text-sm underline">
            Voltar aos meus pedidos
          </Link>
        </div>
      </Shell>
    );
  }

  const created = new Date(order.createdAt).toLocaleString("pt-BR");

  return (
    <Shell>
      <div className="mx-auto max-w-3xl py-12">
        <div className="flex items-center gap-3 text-accent">
          <CheckCircle2 className="h-6 w-6" strokeWidth={1.4} />
          <span className="text-[11px] tracking-luxe uppercase">Pedido registrado com sucesso</span>
        </div>
        <h1 className="mt-3 font-serif text-3xl">Obrigado pela sua compra</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedido <span className="font-mono">{order.id}</span> · {created}
        </p>
        <div className="mt-4"><StatusBadge status={order.status} /></div>

        <section className="mt-10 border border-border">
          <header className="border-b border-border px-6 py-4">
            <h2 className="font-serif text-xl">Itens</h2>
          </header>
          <ul className="divide-y divide-border">
            {order.items.map((i) => (
              <li key={`${i.id}-${i.size}`} className="flex items-center gap-4 px-6 py-4">
                <img src={i.image} alt={i.name} className="h-16 w-12 object-cover" />
                <div className="flex-1 text-sm">
                  <p className="font-serif">{i.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Tam. {i.size} · Qtd. {i.quantity}
                  </p>
                </div>
                <span className="text-sm tabular-nums">{formatBRL(i.price * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-border px-6 py-4 text-sm">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatBRL(order.subtotal)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Frete</span>
              <span className="tabular-nums">
                {order.shippingCost === 0 ? "Grátis" : formatBRL(order.shippingCost)}
              </span>
            </p>
            <p className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
              <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">Total</span>
              <span className="font-serif text-2xl tabular-nums">{formatBRL(order.total)}</span>
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="border border-border p-6">
            <h3 className="text-[11px] tracking-luxe uppercase text-muted-foreground">Endereço</h3>
            <AddressBlock address={order.address} />
          </div>
          <div className="border border-border p-6">
            <h3 className="text-[11px] tracking-luxe uppercase text-muted-foreground">Pagamento</h3>
            <p className="mt-3 text-sm">{paymentLabel(order.paymentMethod)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {order.paymentMethod === "pix"
                ? "QR Code enviado por e-mail."
                : order.paymentMethod === "boleto"
                  ? "Boleto disponível em até 1h."
                  : order.paymentMethod === "stripe"
                    ? "Pagamento confirmado pelo Stripe."
                    : "Cobrança realizada no cartão informado."}
            </p>
          </div>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/pedidos" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Meus pedidos
          </Link>
          <Link to="/" className="font-serif text-xl tracking-widest">A&S Conccept</Link>
          <span className="w-24" />
        </div>
      </header>
      <main className="px-6">{children}</main>
    </div>
  );
}

function AddressBlock({ address }: { address: Record<string, string | undefined> }) {
  const hasAny = Boolean(
    address?.logradouro || address?.cidade || address?.cep || address?.uf,
  );
  if (!hasAny) {
    return (
      <p className="mt-3 text-sm text-muted-foreground italic">
        Endereço será atualizado assim que o pagamento for confirmado.
      </p>
    );
  }
  const line1 = [address.logradouro, address.numero].filter(Boolean).join(", ");
  const withComp = address.complemento ? `${line1} — ${address.complemento}` : line1;
  const cityLine = [address.bairro, [address.cidade, address.uf].filter(Boolean).join("/")]
    .filter(Boolean)
    .join(" — ");
  return (
    <p className="mt-3 text-sm leading-relaxed">
      {withComp}
      {cityLine && (<><br />{cityLine}</>)}
      {address.cep && (<><br />CEP {address.cep}</>)}
    </p>
  );
}

