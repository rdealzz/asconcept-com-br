import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Clock,
  Sparkles,
  Package,
  Truck,
  CheckCircle2,
  Search,
} from "lucide-react";
import { useAuth, isMasterAdminEmail } from "@/lib/auth-context";
import { useOrders } from "@/lib/orders-context";
import { formatBRL } from "@/lib/cart-context";
import { supabase } from "@/integrations/supabase/client";
import type { Order, OrderStatus } from "@/lib/types";

export const Route = createFileRoute("/pedidos/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Meus Pedidos — A&S Conccept" },
      { name: "description", content: "Acompanhe o status dos seus pedidos A&S Conccept." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/" });
  },
  component: OrdersPage,
});

const STATUS_META: Record<OrderStatus, { label: string; icon: string; className: string }> = {
  "Aguardando Aprovação": {
    label: "Aguardando Aprovação",
    icon: "⏳",
    className: "bg-[#FDF6E3] text-[#7A5B10] border-[#E9CE79]",
  },
  "Preparando pedido": {
    label: "Preparando Pedido",
    icon: "📦",
    className: "bg-[#EDE6D3] text-[#5A4A1F] border-[#B8944F]",
  },
  "Em trânsito": {
    label: "Em Trânsito",
    icon: "🚚",
    className: "bg-[#EEE7FA] text-[#3B1F63] border-[#B9A3E6]",
  },
  Entregue: {
    label: "Entregue",
    icon: "✅",
    className: "bg-[#E2F1E9] text-[#134E36] border-[#77C2A0]",
  },
};

const ALL_STATUSES = Object.keys(STATUS_META) as OrderStatus[];

function OrdersPage() {
  const { user, loading, openAuth } = useAuth();
  const { orders, byUser } = useOrders();
  const navigate = useNavigate();

  // Trava runtime anti-devtools: se, por qualquer razão, um usuário não-mestre
  // acabar renderizando esta rota, força signOut + redirect. Manipular
  // `isAdmin` no console não libera nada — o componente sempre revalida.
  useEffect(() => {
    if (loading) return;
    if (!user) return; // estado de "faça login" abaixo cuida disso
    const allowed = isMasterAdminEmail(user.email);
    if (!allowed) {
      void supabase.auth.signOut().finally(() => {
        navigate({ to: "/", replace: true });
      });
    }
  }, [loading, user, navigate]);

  const isAllowedAdmin = !!user && isMasterAdminEmail(user.email);
  const visible = isAllowedAdmin ? orders : user ? byUser(user.email) : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar à loja
          </Link>
          <span className="font-serif text-xl tracking-widest">A&S Conccept</span>
          <span className="w-24" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 animate-[fade-in_0.5s_ease-out_both]">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-3xl">
            {isAllowedAdmin ? "Gestão de Pedidos" : "Meus Pedidos"}
          </h1>
          {isAllowedAdmin && (
            <span className="rounded-sm border border-[color:var(--gold)] px-2 py-0.5 text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
              Admin · {user.name ?? user.email}
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] tracking-luxe uppercase text-muted-foreground">
          {isAllowedAdmin
            ? "Painel exclusivo do desenvolvedor master"
            : "Histórico de compras da sua conta"}
        </p>

        {!user ? (
          <EmptyCard
            title="Entre para ver seus pedidos"
            action={
              <button
                onClick={openAuth}
                className="mt-6 bg-charcoal px-8 py-3 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy"
              >
                Entrar / Cadastrar
              </button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyCard
            title={
              isAllowedAdmin
                ? "Nenhum pedido registrado no momento."
                : "Nenhum pedido por aqui ainda"
            }
            subtitle={
              isAllowedAdmin
                ? "Quando um cliente concluir uma compra, ela aparecerá listada nesta área."
                : "Quando você concluir uma compra, ela aparecerá aqui."
            }
            action={
              <Link
                to="/"
                className="mt-6 inline-block bg-charcoal px-8 py-3 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy"
              >
                Explorar a coleção
              </Link>
            }
          />
        ) : isAllowedAdmin ? (
          <AdminDashboard orders={visible} />
        ) : (
          <ul className="mt-10 space-y-6">
            {visible.map((o) => (
              <CustomerOrderCard key={o.id} order={o} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function EmptyCard({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-16 border border-dashed border-border bg-background p-12 text-center">
      <p className="font-serif text-xl text-charcoal">{title}</p>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      {action}
    </div>
  );
}

/* ---------- Admin Dashboard (Tabs) ---------- */

function AdminDashboard({ orders }: { orders: Order[] }) {
  const [tab, setTab] = useState<"pedidos" | "clientes" | "calculadora">("pedidos");
  return (
    <div className="mt-8">
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(
          [
            { id: "pedidos", label: "Controle de Pedidos" },
            { id: "clientes", label: "Clientes & Leads" },
            { id: "calculadora", label: "Calculadora de Markup" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-5 py-3 text-[11px] tracking-luxe uppercase transition-colors whitespace-nowrap ${
              tab === t.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute inset-x-2 -bottom-[1px] h-[2px] bg-[color:var(--gold)]" />
            )}
          </button>
        ))}
      </div>
      {tab === "pedidos" && <AdminOrdersList orders={orders} />}
      {tab === "clientes" && <AdminClientsPanel />}
      {tab === "calculadora" && <MarkupCalculator />}
    </div>
  );
}

type NewsletterLead = { id: string; email: string; created_at: string };

function AdminClientsPanel() {
  const { listCustomers } = useAuth();
  const customers = listCustomers();
  const [sub, setSub] = useState<"clientes" | "leads">("clientes");
  const [leads, setLeads] = useState<NewsletterLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);

  useEffect(() => {
    if (sub !== "leads") return;
    let cancelled = false;
    setLoadingLeads(true);
    void supabase
      .from("newsletter_subscribers")
      .select("id, email, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingLeads(false);
        if (error) {
          console.error("[leads] fetch failed", error);
          return;
        }
        setLeads((data ?? []) as NewsletterLead[]);
      });
    return () => {
      cancelled = true;
    };
  }, [sub]);

  return (
    <div className="mt-10 animate-[fade-in_0.4s_ease-out] space-y-6">
      <div className="flex gap-1 border-b border-border">
        {(
          [
            { id: "clientes", label: `Clientes (${customers.length})` },
            { id: "leads", label: `Newsletter (${leads.length || "—"})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`relative px-4 py-2 text-[10px] tracking-luxe uppercase transition-colors ${
              sub === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {sub === t.id && (
              <span className="absolute inset-x-2 -bottom-[1px] h-[2px] bg-[color:var(--gold)]" />
            )}
          </button>
        ))}
      </div>

      {sub === "clientes" ? (
        <section className="border border-border bg-card">
          <header className="flex items-baseline justify-between border-b border-border px-5 py-4">
            <div>
              <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
                Cadastros
              </p>
              <h3 className="font-serif text-xl">Clientes registrados</h3>
            </div>
            <span className="font-serif text-2xl tabular-nums">{customers.length}</span>
          </header>
          {customers.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum cliente cadastrado ainda.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {customers.map((c) => (
                <li key={c.email} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-serif text-sm">
                      {c.name ?? c.email.split("@")[0]}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                    {c.phone && (
                      <p className="truncate text-[11px] text-[color:var(--gold)]">
                        📱 {c.phone}
                      </p>
                    )}
                  </div>
                  {c.createdAt && (
                    <span className="shrink-0 text-[10px] tracking-luxe uppercase text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="border border-border bg-card">
          <header className="flex items-baseline justify-between border-b border-border px-5 py-4">
            <div>
              <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
                Leads capturados
              </p>
              <h3 className="font-serif text-xl">Assinantes da Newsletter</h3>
            </div>
            <span className="font-serif text-2xl tabular-nums">{leads.length}</span>
          </header>
          {loadingLeads ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Carregando leads…
            </p>
          ) : leads.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum e-mail capturado ainda.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {leads.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <p className="truncate text-sm text-charcoal">{l.email}</p>
                  <span className="shrink-0 text-[10px] tracking-luxe uppercase text-muted-foreground">
                    {new Date(l.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/* ---------- Calculadora de Markup Financeiro ---------- */

const STRIPE_BR_RATE = 0.0499; // 4,99%
const STRIPE_BR_FIXED = 0.5; // R$ 0,50 por transação

function MarkupCalculator() {
  const [cost, setCost] = useState<string>("");
  const [margin, setMargin] = useState<string>("60");

  const parsed = useMemo(() => {
    const c = Number(cost.replace(",", "."));
    const m = Number(margin.replace(",", "."));
    if (!isFinite(c) || c <= 0 || !isFinite(m) || m < 0) return null;
    // Queremos que o valor líquido recebido (após Stripe) cubra o custo mais a margem.
    // desired = c * (1 + m/100)
    // net(P) = P - P*rate - fixed = P*(1-rate) - fixed
    // desired = P*(1-rate) - fixed  =>  P = (desired + fixed) / (1 - rate)
    const desired = c * (1 + m / 100);
    const price = (desired + STRIPE_BR_FIXED) / (1 - STRIPE_BR_RATE);
    const stripeFee = price * STRIPE_BR_RATE + STRIPE_BR_FIXED;
    const net = price - stripeFee;
    const profit = net - c;
    return { desired, price, stripeFee, net, profit, cost: c, margin: m };
  }, [cost, margin]);

  return (
    <div className="mt-10 animate-[fade-in_0.4s_ease-out]">
      <section className="border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
            Precificação
          </p>
          <h3 className="font-serif text-xl">Calculadora de Markup + Taxa Stripe (Brasil)</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Taxa considerada: 4,99% + R$ 0,50 por transação. O preço sugerido garante que a
            margem líquida desejada seja preservada mesmo após o desconto do gateway.
          </p>
        </header>

        <div className="grid gap-6 px-6 py-6 md:grid-cols-2">
          <label className="block">
            <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              Custo bruto de produção (R$)
            </span>
            <input
              value={cost}
              onChange={(e) => setCost(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              placeholder="Ex: 180,00"
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-lg tabular-nums outline-none focus:border-charcoal"
            />
          </label>
          <label className="block">
            <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              Margem de lucro desejada (%)
            </span>
            <input
              value={margin}
              onChange={(e) => setMargin(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              placeholder="Ex: 60"
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-lg tabular-nums outline-none focus:border-charcoal"
            />
          </label>
        </div>

        {parsed ? (
          <div className="grid gap-px border-t border-border bg-border md:grid-cols-2">
            <ResultCell
              label="Preço final sugerido (etiqueta)"
              value={formatBRL(parsed.price)}
              accent
            />
            <ResultCell
              label="Taxa Stripe estimada"
              value={`− ${formatBRL(parsed.stripeFee)}`}
            />
            <ResultCell
              label="Valor líquido recebido"
              value={formatBRL(parsed.net)}
            />
            <ResultCell
              label={`Lucro real (margem ${parsed.margin.toFixed(0)}%)`}
              value={formatBRL(parsed.profit)}
            />
          </div>
        ) : (
          <p className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
            Informe o custo e a margem para calcular.
          </p>
        )}

        <p className="border-t border-border px-6 py-3 text-[10px] leading-relaxed text-muted-foreground">
          Fórmula: preço = (custo × (1 + margem%) + R$ 0,50) ÷ (1 − 4,99%). Assim, após a
          dedução da taxa, o valor líquido corresponde exatamente ao custo mais o percentual
          de lucro pretendido.
        </p>
      </section>
    </div>
  );
}

function ResultCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`bg-card px-6 py-5 ${accent ? "bg-[color:var(--ivory)]" : ""}`}>
      <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-serif tabular-nums ${
          accent ? "text-[color:var(--gold)] text-3xl" : "text-2xl text-charcoal"
        }`}
      >
        {value}
      </p>
    </div>
  );
}


function AdminOrdersList({ orders }: { orders: Order[] }) {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "todos">("todos");
  const [term, setTerm] = useState("");

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "todos" && o.status !== statusFilter) return false;
      if (!term.trim()) return true;
      const q = term.trim().toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, statusFilter, term]);

  const totals = useMemo(() => {
    return ALL_STATUSES.map((s) => ({
      status: s,
      count: orders.filter((o) => o.status === s).length,
    }));
  }, [orders]);

  return (
    <div className="mt-10 space-y-8">
      <section className="grid gap-3 sm:grid-cols-5">
        {totals.map((t) => (
          <button
            key={t.status}
            onClick={() =>
              setStatusFilter((cur) => (cur === t.status ? "todos" : t.status))
            }
            className={`flex flex-col items-start gap-1 border px-4 py-3 text-left transition-all ${
              statusFilter === t.status
                ? "border-charcoal bg-charcoal text-ivory"
                : "border-border bg-background hover:border-charcoal"
            }`}
          >
            <span className="text-[10px] tracking-luxe uppercase opacity-80">
              {STATUS_META[t.status].icon} {STATUS_META[t.status].label}
            </span>
            <span className="font-serif text-2xl tabular-nums">{t.count}</span>
          </button>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar por ID, cliente ou e-mail"
            className="w-full border border-border bg-background px-9 py-2 text-sm outline-none focus:border-charcoal"
          />
        </div>
        <button
          onClick={() => {
            setStatusFilter("todos");
            setTerm("");
          }}
          className="border border-border px-4 py-2 text-[11px] tracking-luxe uppercase text-muted-foreground transition-colors hover:border-charcoal hover:text-foreground"
        >
          Limpar filtros
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyCard title="Nenhum pedido corresponde aos filtros." />
      ) : (
        <ul className="space-y-6">
          {filtered.map((o) => (
            <AdminOrderCard key={o.id} order={o} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminOrderCard({ order }: { order: Order }) {
  const { updateStatus } = useOrders();
  const created = new Date(order.createdAt).toLocaleString("pt-BR");
  const meta = STATUS_META[order.status];
  const [tracking, setTracking] = useState(order.trackingCode ?? "");
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const showTracking = order.status === "Em trânsito" || !!order.trackingCode;

  const changeStatus = (next: OrderStatus) => {
    if (next === order.status) return;
    updateStatus(order.id, next, next === "Em trânsito" ? tracking || undefined : order.trackingCode);
    setSavedFlash(`Status atualizado para "${STATUS_META[next].label}"`);
    setTimeout(() => setSavedFlash(null), 2400);
  };

  const saveTracking = () => {
    updateStatus(order.id, "Em trânsito", tracking.trim() || undefined);
    setSavedFlash("Código de rastreio enviado ao cliente.");
    setTimeout(() => setSavedFlash(null), 2400);
  };

  const customerName =
    order.customerName ||
    order.customerEmail.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <li className="border border-border bg-card shadow-[0_1px_0_0_rgba(0,0,0,0.03)] transition-shadow hover:shadow-[0_4px_18px_-6px_rgba(0,0,0,0.15)]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">Pedido</p>
          <Link
            to="/pedidos/$id"
            params={{ id: order.id }}
            className="font-mono text-sm hover:text-[color:var(--gold)]"
          >
            {order.id}
          </Link>
          <p className="mt-1 text-[11px] text-muted-foreground">{created}</p>
        </div>
        <StatusBadge status={order.status} />
      </header>

      <div className="grid gap-6 px-6 py-5 md:grid-cols-[1.1fr_1.4fr_1fr]">
        {/* Quem comprou */}
        <section>
          <h3 className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
            Quem comprou
          </h3>
          <p className="mt-2 font-serif text-lg">{customerName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground break-all">
            {order.customerEmail}
          </p>
          <div className="mt-4 space-y-0.5 border-t border-border pt-3 text-xs text-muted-foreground">
            <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]/80">
              Endereço
            </p>
            <p className="text-charcoal">
              {order.address.logradouro}, {order.address.numero}
              {order.address.complemento ? ` — ${order.address.complemento}` : ""}
            </p>
            <p className="text-charcoal">
              {order.address.bairro} · {order.address.cidade}/{order.address.uf}
            </p>
            <p>CEP {order.address.cep}</p>
          </div>
        </section>

        {/* O que comprou */}
        <section>
          <h3 className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
            O que comprou
          </h3>
          <ul className="mt-2 space-y-3">
            {order.items.map((i) => (
              <li
                key={`${i.id}-${i.size}`}
                className="flex items-center gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <img
                  src={i.image}
                  alt={i.name}
                  className="h-16 w-12 flex-none border border-border object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-serif text-sm">{i.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Tam. <span className="text-charcoal">{i.size}</span> · Qtd.{" "}
                    <span className="text-charcoal">{i.quantity}</span> ·{" "}
                    <span className="text-charcoal">{formatBRL(i.price)}</span> un.
                  </p>
                </div>
                <span className="text-xs tabular-nums text-charcoal">
                  {formatBRL(i.price * i.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-border pt-2 text-xs text-muted-foreground">
            <span>
              Subtotal {formatBRL(order.subtotal)} · Frete{" "}
              {order.shippingCost === 0 ? "Grátis" : formatBRL(order.shippingCost)}
            </span>
            <span className="font-serif text-base text-charcoal tabular-nums">
              {formatBRL(order.total)}
            </span>
          </div>
        </section>

        {/* Gestão de status */}
        <section>
          <h3 className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
            Fluxo de aprovação
          </h3>
          <div className="mt-2 space-y-2">
            {ALL_STATUSES.map((s) => {
              const active = s === order.status;
              return (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-xs transition-all ${
                    active
                      ? `${STATUS_META[s].className} font-medium`
                      : "border-border bg-background hover:border-charcoal"
                  }`}
                >
                  <StatusIcon status={s} />
                  <span className="flex-1">{STATUS_META[s].label}</span>
                  {active && <span className="text-[10px] uppercase tracking-luxe">Atual</span>}
                </button>
              );
            })}
          </div>

          {showTracking && (
            <div className="mt-4 border border-dashed border-[color:var(--gold)] bg-[color:var(--ivory)] p-3">
              <label className="block text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
                Código de rastreio
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value.toUpperCase())}
                  placeholder="AS123BR"
                  className="w-full border border-border bg-background px-2 py-1.5 font-mono text-xs uppercase outline-none focus:border-charcoal"
                />
                <button
                  onClick={saveTracking}
                  className="bg-charcoal px-3 text-[10px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy"
                >
                  Salvar
                </button>
              </div>
            </div>
          )}

          {savedFlash && (
            <p className="mt-3 border border-[color:var(--gold)]/60 bg-[color:var(--ivory)] px-3 py-2 text-[11px] text-charcoal animate-[fade-in_0.3s_ease-out]">
              ✦ {savedFlash}
            </p>
          )}
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Pagamento: <span className="text-charcoal">{paymentLabel(order.paymentMethod)}</span>
            <br />
            Toda alteração dispara e-mail transacional para {order.customerEmail}.
          </p>
        </section>
      </div>
    </li>
  );
}

/* ---------- Cliente ---------- */

function CustomerOrderCard({ order }: { order: Order }) {
  const created = new Date(order.createdAt).toLocaleString("pt-BR");
  return (
    <li className="border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">Pedido</p>
          <Link
            to="/pedidos/$id"
            params={{ id: order.id }}
            className="font-mono text-sm hover:text-[color:var(--gold)]"
          >
            {order.id}
          </Link>
          <p className="mt-1 text-[11px] text-muted-foreground">{created}</p>
          {order.trackingCode && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Rastreio: <span className="font-mono text-charcoal">{order.trackingCode}</span>
            </p>
          )}
        </div>
        <StatusBadge status={order.status} />
      </div>
      <div className="grid gap-4 px-6 py-4 sm:grid-cols-[1fr_auto]">
        <ul className="space-y-3 text-sm">
          {order.items.map((i) => (
            <li key={`${i.id}-${i.size}`} className="flex items-center gap-3">
              <img
                src={i.image}
                alt={i.name}
                className="h-14 w-10 flex-none object-cover"
              />
              <span className="flex-1">
                {i.name}{" "}
                <span className="text-muted-foreground">
                  · Tam. {i.size} · x{i.quantity}
                </span>
              </span>
              <span className="tabular-nums">{formatBRL(i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-border pt-4 text-sm sm:min-w-[220px] sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
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
            <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">
              Total
            </span>
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

/* ---------- Shared UI ---------- */

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-3 py-1 text-[10px] tracking-luxe uppercase ${meta.className}`}
    >
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

function StatusIcon({ status }: { status: OrderStatus }) {
  const cls = "h-3.5 w-3.5";
  if (status === "Aguardando Aprovação") return <Clock className={cls} strokeWidth={1.5} />;
  if (status === "Preparando pedido") return <Package className={cls} strokeWidth={1.5} />;
  if (status === "Em trânsito") return <Truck className={cls} strokeWidth={1.5} />;
  return <CheckCircle2 className={cls} strokeWidth={1.5} />;
}

export function paymentLabel(m: Order["paymentMethod"]) {
  return m === "pix" ? "PIX" : m === "credit_card" ? "Cartão de Crédito" : "Boleto";
}
