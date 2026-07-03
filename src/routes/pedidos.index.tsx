import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useOrders } from "@/lib/orders-context";
import { formatBRL } from "@/lib/cart-context";
import type { Order, OrderStatus } from "@/lib/types";

export const Route = createFileRoute("/pedidos/")({
  head: () => ({
    meta: [
      { title: "Meus Pedidos — A&S Concept" },
      { name: "description", content: "Acompanhe o status dos seus pedidos A&S Concept." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrdersPage,
});

const STATUSES: OrderStatus[] = ["Pendente", "Aprovado", "Enviado", "Entregue"];

function OrdersPage() {
  const { user, openAuth } = useAuth();
  const { orders, byUser, updateStatus } = useOrders();

  const visible = user?.isAdmin ? orders : user ? byUser(user.email) : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Voltar à loja
          </Link>
          <span className="font-serif text-xl tracking-widest">A&S Concept</span>
          <span className="w-24" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-serif text-3xl">
          {user?.isAdmin ? "Todos os Pedidos" : "Meus Pedidos"}
        </h1>
        <p className="mt-1 text-[11px] tracking-luxe uppercase text-muted-foreground">
          {user?.isAdmin ? "Painel administrativo" : "Histórico do cliente"}
        </p>

        {!user ? (
          <div className="mt-16 border border-border bg-secondary/30 p-10 text-center">
            <p className="font-serif text-xl">Entre para ver seus pedidos</p>
            <button
              onClick={openAuth}
              className="mt-6 bg-charcoal px-8 py-3 text-[11px] tracking-luxe uppercase text-ivory hover:bg-navy"
            >
              Entrar / Cadastrar
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-16 border border-dashed border-border p-10 text-center">
            <p className="font-serif text-xl">Nenhum pedido por aqui ainda</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Quando você concluir uma compra, ela aparecerá aqui.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block bg-charcoal px-8 py-3 text-[11px] tracking-luxe uppercase text-ivory hover:bg-navy"
            >
              Explorar a coleção
            </Link>
          </div>
        ) : (
          <ul className="mt-10 space-y-6">
            {visible.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                admin={!!user.isAdmin}
                onStatus={(s) => updateStatus(o.id, s)}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function OrderCard({
  order,
  admin,
  onStatus,
}: {
  order: Order;
  admin: boolean;
  onStatus: (s: OrderStatus) => void;
}) {
  const created = new Date(order.createdAt).toLocaleString("pt-BR");
  return (
    <li className="border border-border bg-background">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">Pedido</p>
          <Link
            to="/pedidos/$id"
            params={{ id: order.id }}
            className="font-mono text-sm hover:text-accent"
          >
            {order.id}
          </Link>
          <p className="mt-1 text-[11px] text-muted-foreground">{created}</p>
          {admin && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cliente: <span className="text-foreground">{order.customerEmail}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={order.status} />
          {admin && (
            <select
              value={order.status}
              onChange={(e) => onStatus(e.target.value as OrderStatus)}
              className="border border-border bg-background px-2 py-1 text-[11px] tracking-luxe uppercase"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="grid gap-4 px-6 py-4 sm:grid-cols-[1fr_auto]">
        <ul className="space-y-2 text-sm">
          {order.items.map((i) => (
            <li key={`${i.id}-${i.size}`} className="flex items-center gap-3">
              <img src={i.image} alt={i.name} className="h-12 w-9 object-cover" />
              <span className="flex-1">
                {i.name}{" "}
                <span className="text-muted-foreground">· Tam. {i.size} · x{i.quantity}</span>
              </span>
              <span className="tabular-nums">{formatBRL(i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-border pt-4 text-sm sm:min-w-[200px] sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
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
            <span className="font-serif text-lg tabular-nums">{formatBRL(order.total)}</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Pagamento: {paymentLabel(order.paymentMethod)}
          </p>
        </div>
      </div>
    </li>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, string> = {
    Pendente: "bg-yellow-100 text-yellow-900 border-yellow-300",
    Aprovado: "bg-blue-100 text-blue-900 border-blue-300",
    Enviado: "bg-purple-100 text-purple-900 border-purple-300",
    Entregue: "bg-emerald-100 text-emerald-900 border-emerald-300",
  };
  return (
    <span className={`inline-block border px-3 py-1 text-[10px] tracking-luxe uppercase ${map[status]}`}>
      {status}
    </span>
  );
}

export function paymentLabel(m: Order["paymentMethod"]) {
  return m === "pix" ? "PIX" : m === "credit_card" ? "Cartão de Crédito" : "Boleto";
}
