import { createFileRoute, Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/Wordmark";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Clock,
  Sparkles,
  Package,
  Truck,
  CheckCircle2,
  Search,
  Mail,
  MapPin,
  CreditCard,
  ArrowRight,
  Check,
  Lock,
} from "lucide-react";
import { useAuth, isMasterAdminEmail } from "@/lib/auth-context";
import { useOrders } from "@/lib/orders-context";
import { formatBRL } from "@/lib/cart-context";
import { supabase } from "@/integrations/supabase/client";
import {
  FLOW_STATUSES,
  ORDER_ORIGIN_LABELS,
  isFinalStatus,
  isPrePaymentStatus,
  type Order,
  type OrderOrigin,
  type OrderStatus,
} from "@/lib/types";
import { OrigemBadge } from "@/components/OrigemBadge";
import { ContactStrip } from "@/components/ContactStrip";

export const Route = createFileRoute("/pedidos/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Meus Pedidos — A&S Conccept" },
      { name: "description", content: "Acompanhe o status dos seus pedidos A&S Conccept." },
      { name: "robots", content: "noindex" },
    ],
  }),
  // Sem guard de redirecionamento: em navegadores mobile (Safari iOS/Chrome
  // Android) a sessão pode ainda não ter hidratado quando o beforeLoad roda, e
  // o redirect derrubava o cliente para fora. O componente renderiza o estado
  // "entre para ver seus pedidos" enquanto a sessão carrega.
  component: OrdersPage,
});

// Os estados do ateliê formam uma progressão de intensidade dentro da paleta —
// do taupe apagado ao dourado preenchido — em vez de pastéis distintos, que no
// fundo escuro viravam ilhas claras e saíam da identidade.
const STATUS_META: Record<OrderStatus, { label: string; icon: string; className: string }> = {
  "Aguardando Pagamento": {
    label: "Aguardando Pagamento",
    icon: "◌",
    className: "border-asc-line bg-asc-bg-raised text-asc-ink-muted",
  },
  "Pagamento recusado": {
    label: "Pagamento Recusado",
    icon: "✕",
    className: "border-destructive/50 bg-destructive/10 text-destructive",
  },
  "Falha no pagamento": {
    label: "Falha no Pagamento",
    icon: "✕",
    className: "border-destructive/50 bg-destructive/10 text-destructive",
  },
  "Aguardando Aprovação": {
    label: "Aguardando Aprovação",
    icon: "⏳",
    className: "border-asc-line bg-asc-bg-raised text-asc-ink-muted",
  },
  "Preparando pedido": {
    label: "Preparando Pedido",
    icon: "📦",
    className: "border-asc-gold/40 bg-asc-bg-raised text-asc-gold",
  },
  "Em trânsito": {
    label: "Em Trânsito",
    icon: "🚚",
    className: "border-asc-gold-soft/60 bg-asc-bg-raised text-asc-gold-soft",
  },
  Entregue: {
    label: "Entregue",
    icon: "✅",
    className: "border-transparent bg-asc-gold text-asc-bg",
  },
  // Ponto final. Divide o acabamento do "Entregue" porque é o mesmo fim de
  // linha: o pedido do site chega nele depois da entrega, e o de balcão pode
  // nascer nele.
  Finalizado: {
    label: "Finalizado",
    icon: "✅",
    className: "border-transparent bg-asc-gold text-asc-bg",
  },
};

/** As etapas do ateliê, na ordem em que avançam. */
const ALL_STATUSES: OrderStatus[] = [...FLOW_STATUSES];

function OrdersPage() {
  const { user, loading, openAuth } = useAuth();
  const { orders, byUser } = useOrders();

  // Log de diagnóstico temporário para a checagem de sessão em mobile.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      void supabase.auth.getSession().then(({ data, error }) => {
        if (error) console.error("[pedidos] getSession error", error.message);
        else if (data.session) {
          console.error("[pedidos] sessão existe no storage, mas o contexto está sem usuário");
        }
      });
    }
  }, [loading, user]);

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
          <Wordmark className="font-serif text-xl tracking-widest" />
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

        {loading ? (
          <EmptyCard
            title="Carregando seus pedidos…"
            subtitle="Um instante enquanto confirmamos sua sessão."
          />
        ) : !user ? (
          <EmptyCard
            title="Entre para ver seus pedidos"
            action={
              <button
                onClick={openAuth}
                className="mt-6 asc-btn-primary px-8 py-3 text-[11px] tracking-luxe uppercase"
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
                className="mt-6 inline-block asc-btn-primary px-8 py-3 text-[11px] tracking-luxe uppercase"
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
      <ContactStrip />
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
      <p className="font-serif text-xl text-asc-ink">{title}</p>
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
              tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
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
                    <p className="truncate font-serif text-sm">{c.name ?? c.email.split("@")[0]}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                    {c.phone && (
                      <p className="truncate text-[11px] text-[color:var(--gold)]">📱 {c.phone}</p>
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
                  <p className="truncate text-sm text-asc-ink">{l.email}</p>
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

/**
 * Taxa padrão do gateway.
 *
 * Herdada da configuração antiga (Stripe Brasil, 4,99% + R$ 0,50) e mantida
 * apenas como ponto de partida: a loja cobra pelo Mercado Pago, cuja taxa
 * depende do plano e do prazo de recebimento da conta. Por isso os dois
 * valores viraram campos editáveis — inventar um número aqui seria precificar
 * a coleção inteira em cima de um palpite.
 */
const TAXA_PADRAO_PCT = "4,99";
const TAXA_PADRAO_FIXA = "0,50";

const paraNumero = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));

function MarkupCalculator() {
  const [cost, setCost] = useState<string>("");
  const [margin, setMargin] = useState<string>("60");
  const [taxaPct, setTaxaPct] = useState<string>(TAXA_PADRAO_PCT);
  const [taxaFixa, setTaxaFixa] = useState<string>(TAXA_PADRAO_FIXA);

  const parsed = useMemo(() => {
    const c = paraNumero(cost);
    const m = paraNumero(margin);
    const pct = paraNumero(taxaPct);
    const fixa = paraNumero(taxaFixa);
    if (!isFinite(c) || c <= 0 || !isFinite(m) || m < 0) return null;
    if (!isFinite(pct) || pct < 0 || pct >= 100 || !isFinite(fixa) || fixa < 0) return null;
    const rate = pct / 100;
    // Queremos que o valor líquido recebido (após o gateway) cubra o custo mais
    // a margem.
    // desired = c * (1 + m/100)
    // net(P) = P - P*rate - fixed = P*(1-rate) - fixed
    // desired = P*(1-rate) - fixed  =>  P = (desired + fixed) / (1 - rate)
    const desired = c * (1 + m / 100);
    const price = (desired + fixa) / (1 - rate);
    const taxaEstimada = price * rate + fixa;
    const net = price - taxaEstimada;
    const profit = net - c;
    return { desired, price, taxaEstimada, net, profit, cost: c, margin: m };
  }, [cost, margin, taxaPct, taxaFixa]);

  return (
    <div className="mt-10 animate-[fade-in_0.4s_ease-out]">
      <section className="border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
            Precificação
          </p>
          <h3 className="font-serif text-xl">Calculadora de Markup + Taxa do Mercado Pago</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            O preço sugerido preserva a margem líquida desejada mesmo depois do desconto do gateway.
            Ajuste a taxa abaixo para a do seu plano no Mercado Pago — ela varia com o prazo de
            recebimento e com a forma de pagamento (Pix costuma ser bem menor que cartão).
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
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-lg tabular-nums outline-none focus:border-asc-line"
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
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-lg tabular-nums outline-none focus:border-asc-line"
            />
          </label>
          <label className="block">
            <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              Taxa do gateway (%)
            </span>
            <input
              value={taxaPct}
              onChange={(e) => setTaxaPct(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              placeholder="Ex: 4,99"
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-lg tabular-nums outline-none focus:border-asc-line"
            />
          </label>
          <label className="block">
            <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              Taxa fixa por transação (R$)
            </span>
            <input
              value={taxaFixa}
              onChange={(e) => setTaxaFixa(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              placeholder="Ex: 0,50"
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-lg tabular-nums outline-none focus:border-asc-line"
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
              label="Taxa do gateway estimada"
              value={`− ${formatBRL(parsed.taxaEstimada)}`}
            />
            <ResultCell label="Valor líquido recebido" value={formatBRL(parsed.net)} />
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
          Fórmula: preço = (custo × (1 + margem%) + R$ 0,50) ÷ (1 − 4,99%). Assim, após a dedução da
          taxa, o valor líquido corresponde exatamente ao custo mais o percentual de lucro
          pretendido.
        </p>
      </section>
    </div>
  );
}

function ResultCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`bg-card px-6 py-5 ${accent ? "bg-asc-bg-raised" : ""}`}>
      <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-serif tabular-nums ${
          accent ? "text-[color:var(--gold)] text-3xl" : "text-2xl text-asc-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function AdminOrdersList({ orders }: { orders: Order[] }) {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "todos" | "nao-pagos">("todos");
  /** Loja ou balcão: os dois fluxos dividem a lista e raramente se procuram juntos. */
  const [origemFiltro, setOrigemFiltro] = useState<OrderOrigin | "todos">("todos");
  const [term, setTerm] = useState("");

  const totaisPorOrigem = useMemo(
    () => ({
      online: orders.filter((o) => o.origin === "online").length,
      manual: orders.filter((o) => o.origin === "manual").length,
    }),
    [orders],
  );

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (origemFiltro !== "todos" && o.origin !== origemFiltro) return false;
      if (statusFilter === "nao-pagos" && !isPrePaymentStatus(o.status)) return false;
      if (statusFilter !== "todos" && statusFilter !== "nao-pagos" && o.status !== statusFilter)
        return false;
      if (!term.trim()) return true;
      const q = term.trim().toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, origemFiltro, statusFilter, term]);

  // Um cartão por etapa do ateliê, mais um para o que ainda não foi pago —
  // esse é o balde que antes se disfarçava de "Aguardando Aprovação".
  const totals = useMemo(() => {
    const cartoes: {
      key: OrderStatus | "nao-pagos";
      label: string;
      icon: string;
      count: number;
    }[] = ALL_STATUSES.map((s) => ({
      key: s,
      label: STATUS_META[s].label,
      icon: STATUS_META[s].icon,
      count: orders.filter((o) => o.status === s).length,
    }));
    const naoPagos = orders.filter((o) => isPrePaymentStatus(o.status)).length;
    if (naoPagos > 0) {
      cartoes.push({ key: "nao-pagos", label: "Sem pagamento", icon: "◌", count: naoPagos });
    }
    return cartoes;
  }, [orders]);

  return (
    <div className="mt-10 space-y-8">
      {/* Cada cartão é um filtro: clicar aplica, clicar de novo limpa. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {totals.map((t) => {
          const ativo = statusFilter === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter((cur) => (cur === t.key ? "todos" : t.key))}
              aria-pressed={ativo}
              title={ativo ? "Clique para remover o filtro" : `Ver apenas: ${t.label}`}
              className={`group relative flex cursor-pointer flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-all duration-asc ease-asc hover:-translate-y-0.5 ${
                ativo
                  ? "border-asc-gold bg-asc-bg-raised shadow-[0_0_0_1px_var(--asc-gold),0_10px_28px_-12px_rgba(197,160,89,0.55)]"
                  : "border-border bg-background hover:border-asc-gold/50 hover:shadow-[0_8px_22px_-14px_rgba(0,0,0,0.6)]"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span
                  className={`text-[10px] tracking-luxe uppercase ${
                    ativo ? "text-asc-gold" : "text-muted-foreground"
                  }`}
                >
                  {t.icon} {t.label}
                </span>
                <span
                  className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums transition-colors ${
                    ativo
                      ? "bg-asc-gold text-asc-bg"
                      : "bg-asc-bg-raised text-muted-foreground group-hover:text-asc-ink"
                  }`}
                >
                  {t.count}
                </span>
              </span>
              <span className="font-serif text-3xl tabular-nums text-asc-ink">{t.count}</span>
              <span
                className={`text-[10px] tracking-luxe uppercase transition-opacity ${
                  ativo ? "text-asc-gold opacity-100" : "opacity-0 group-hover:opacity-60"
                }`}
              >
                {ativo ? "Filtrando ·  clique para limpar" : "Clique para filtrar"}
              </span>
            </button>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        {/* Loja ou balcão. Fica ao lado da busca, e não entre os cartões de
            etapa, porque é outra pergunta: os cartões filtram "em que ponto
            está", este filtra "de onde veio". */}
        <div className="flex items-center gap-1">
          {(
            [
              ["todos", "Todos"],
              ["online", ORDER_ORIGIN_LABELS.online],
              ["manual", ORDER_ORIGIN_LABELS.manual],
            ] as const
          ).map(([chave, rotulo]) => {
            const ativo = origemFiltro === chave;
            const contagem =
              chave === "todos" ? orders.length : totaisPorOrigem[chave as OrderOrigin];
            return (
              <button
                key={chave}
                onClick={() => setOrigemFiltro(chave)}
                aria-pressed={ativo}
                className={`rounded-md border px-3 py-2 text-[11px] tracking-luxe uppercase transition-colors duration-ascfast ease-asc ${
                  ativo
                    ? "border-asc-gold bg-asc-bg-raised text-asc-gold"
                    : "border-border text-muted-foreground hover:border-asc-gold/50 hover:text-asc-ink"
                }`}
              >
                {rotulo} <span className="tabular-nums opacity-70">{contagem}</span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar por ID, cliente ou e-mail"
            className="w-full rounded-md border border-border bg-background px-9 py-2 text-sm outline-none transition-colors duration-ascfast ease-asc focus:border-asc-gold"
          />
        </div>
        {(statusFilter !== "todos" || origemFiltro !== "todos" || term) && (
          <span className="text-[11px] text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "pedido" : "pedidos"}
          </span>
        )}
        <button
          onClick={() => {
            setStatusFilter("todos");
            setOrigemFiltro("todos");
            setTerm("");
          }}
          className="rounded-md border border-border px-4 py-2 text-[11px] tracking-luxe uppercase text-muted-foreground transition-colors duration-ascfast ease-asc hover:border-asc-gold hover:text-asc-gold"
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

  const naoPago = isPrePaymentStatus(order.status);
  /**
   * Venda de balcão que já nasceu fechada: não tem etapa antes nem depois, e a
   * escada do ateliê seria uma encenação — as quatro etapas apareceriam como
   * "cumpridas" sem nunca terem existido. Pedido manual que nasceu no fluxo
   * (encomenda a preparar) não entra aqui: ele percorre a escada como qualquer
   * outro.
   */
  const vendaManualFechada = order.origin === "manual" && isFinalStatus(order.status);
  const currentIndex = ALL_STATUSES.indexOf(order.status);
  const proximo = currentIndex >= 0 ? ALL_STATUSES[currentIndex + 1] : undefined;

  const changeStatus = async (next: OrderStatus) => {
    if (next === order.status) return;
    try {
      await updateStatus(
        order.id,
        next,
        next === "Em trânsito" ? tracking || undefined : order.trackingCode,
      );
      setSavedFlash(`Status atualizado para "${STATUS_META[next].label}"`);
      setTimeout(() => setSavedFlash(null), 2400);
    } catch (e) {
      // A mensagem do servidor explica o motivo (fora de ordem, pedido não
      // pago). Engoli-la deixava o admin sem saber o que aconteceu.
      setSavedFlash(e instanceof Error ? e.message : "Não foi possível atualizar o pedido.");
      setTimeout(() => setSavedFlash(null), 5000);
    }
  };

  const saveTracking = async () => {
    try {
      await updateStatus(order.id, "Em trânsito", tracking.trim() || undefined);
      setSavedFlash("Código de rastreio salvo.");
      setTimeout(() => setSavedFlash(null), 2400);
    } catch {
      setSavedFlash("Não foi possível salvar o rastreio.");
    }
  };

  const customerName =
    order.customerName ||
    order.customerEmail
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

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
        {/* De onde veio, e em que ponto está — nessa ordem: a origem diz qual
            fluxo esperar do pedido, e o status, onde ele parou. */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <OrigemBadge origin={order.origin} />
          <StatusBadge status={order.status} />
        </div>
      </header>

      <div className="grid gap-6 px-6 py-5 md:grid-cols-[1.1fr_1.4fr_1fr]">
        {/* Quem comprou */}
        <section>
          <h3 className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
            Quem comprou
          </h3>
          <p className="mt-2 font-serif text-lg text-asc-ink">{customerName}</p>

          {/* E-mail em destaque: é por ele que sai toda a comunicação do pedido,
              e era a linha mais apagada do card. */}
          <a
            href={`mailto:${order.customerEmail}`}
            className="mt-2 flex items-center gap-2 rounded-md border border-asc-line bg-asc-bg-raised px-3 py-2 text-xs text-asc-ink transition-colors duration-ascfast ease-asc hover:border-asc-gold hover:text-asc-gold"
          >
            <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span className="break-all">{order.customerEmail}</span>
          </a>

          {/* Forma de pagamento em destaque, ao lado de quem comprou. */}
          <div className="mt-2 flex items-center gap-2 rounded-md border border-asc-line bg-asc-bg-raised px-3 py-2 text-xs">
            <CreditCard
              className="h-3.5 w-3.5 shrink-0 text-[color:var(--gold)]"
              strokeWidth={1.5}
            />
            <span className="text-muted-foreground">Pagamento</span>
            <span className="ml-auto font-medium text-asc-ink">
              {paymentLabel(order.paymentMethod)}
            </span>
          </div>

          <div className="mt-3 rounded-md border border-asc-line bg-asc-bg-raised p-3 text-xs">
            <p className="flex items-center gap-2 text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
              <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} /> Endereço de entrega
            </p>
            {order.address?.logradouro || order.address?.cidade || order.address?.cep ? (
              <div className="mt-2 space-y-0.5 leading-relaxed">
                <p className="font-medium text-asc-ink">
                  {order.address.logradouro}
                  {order.address.numero ? `, ${order.address.numero}` : ""}
                  {order.address.complemento ? ` — ${order.address.complemento}` : ""}
                </p>
                <p className="text-asc-ink">
                  {[
                    order.address.bairro,
                    [order.address.cidade, order.address.uf].filter(Boolean).join("/"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {order.address.cep && (
                  <p className="text-muted-foreground">CEP {order.address.cep}</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const linha = [
                      customerName,
                      `${order.address.logradouro ?? ""}${order.address.numero ? `, ${order.address.numero}` : ""}${order.address.complemento ? ` — ${order.address.complemento}` : ""}`,
                      [
                        order.address.bairro,
                        [order.address.cidade, order.address.uf].filter(Boolean).join("/"),
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      order.address.cep ? `CEP ${order.address.cep}` : "",
                    ]
                      .filter(Boolean)
                      .join("\n");
                    void navigator.clipboard?.writeText(linha);
                    setSavedFlash("Endereço copiado.");
                    setTimeout(() => setSavedFlash(null), 2000);
                  }}
                  className="mt-2 text-[10px] tracking-luxe uppercase text-[color:var(--gold)] underline-offset-4 hover:underline"
                >
                  Copiar endereço
                </button>
              </div>
            ) : (
              <p className="mt-2 italic text-muted-foreground">Endereço não informado.</p>
            )}
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
                    Tam. <span className="text-asc-ink">{i.size}</span> · Qtd.{" "}
                    <span className="text-asc-ink">{i.quantity}</span> ·{" "}
                    <span className="text-asc-ink">{formatBRL(i.price)}</span> un.
                  </p>
                </div>
                <span className="text-xs tabular-nums text-asc-ink">
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
            <span className="font-serif text-base text-asc-ink tabular-nums">
              {formatBRL(order.total)}
            </span>
          </div>
        </section>

        {/* Gestão de status */}
        <section>
          <h3 className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
            Fluxo de aprovação
          </h3>

          {/* Pedido sem pagamento não entra no fluxo: a única ação é confirmar
              o pagamento na mão, e é isso que o botão diz. */}
          {naoPago ? (
            <div className="mt-2 rounded-md border border-dashed border-destructive/50 bg-destructive/5 p-3">
              <p className="text-xs leading-relaxed text-asc-ink">
                Pagamento não confirmado ({STATUS_META[order.status].label}). O estoque continua
                intacto e nada é cobrado.
              </p>
              <button
                onClick={() => changeStatus("Aguardando Aprovação")}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-[color:var(--gold)] bg-[color:var(--gold)]/10 px-3 py-2.5 text-[11px] font-medium tracking-luxe uppercase text-[color:var(--gold)] transition-all duration-asc ease-asc hover:bg-[color:var(--gold)] hover:text-asc-bg"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Confirmar pagamento recebido
              </button>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                Use apenas se recebeu o valor por fora (Pix manual, transferência). O pedido entra
                na fila de aprovação e o cliente recebe a confirmação por e-mail.
              </p>
            </div>
          ) : vendaManualFechada ? (
            <div className="mt-2 rounded-md border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5 p-3">
              <p className="text-xs leading-relaxed text-asc-ink">
                Venda registrada manualmente e já concluída. O estoque foi baixado no cadastro — não
                há etapa a avançar.
              </p>
            </div>
          ) : (
            <>
              {/* O próximo passo vem primeiro e em destaque: é a ação que o
                  admin realmente veio fazer. */}
              {proximo && (
                <button
                  onClick={() => changeStatus(proximo)}
                  className="group mt-2 flex w-full items-center gap-3 rounded-md border border-[color:var(--gold)] bg-[color:var(--gold)]/10 px-3 py-3 text-left transition-all duration-asc ease-asc hover:bg-[color:var(--gold)] hover:text-asc-bg"
                >
                  <StatusIcon status={proximo} />
                  <span className="flex-1">
                    <span className="block text-[10px] tracking-luxe uppercase opacity-70">
                      Avançar para
                    </span>
                    <span className="block text-sm font-medium">{STATUS_META[proximo].label}</span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-asc ease-asc group-hover:translate-x-1"
                    strokeWidth={1.8}
                  />
                </button>
              )}

              <p className="mt-3 text-[10px] tracking-luxe uppercase text-muted-foreground">
                Etapas
              </p>
              <ol className="mt-2 space-y-1.5">
                {ALL_STATUSES.map((s, index) => {
                  const active = s === order.status;
                  const concluido = index < currentIndex;
                  const selectable = index === currentIndex + 1;
                  return (
                    <li
                      key={s}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-all ${
                        active
                          ? `${STATUS_META[s].className} font-medium`
                          : concluido
                            ? "border-transparent bg-asc-bg-raised text-muted-foreground"
                            : "border-border/60 bg-background/40 text-muted-foreground/60"
                      }`}
                    >
                      {concluido ? (
                        <Check className="h-3.5 w-3.5 text-[color:var(--gold)]" strokeWidth={2} />
                      ) : active ? (
                        <StatusIcon status={s} />
                      ) : (
                        <Lock className="h-3 w-3 opacity-50" strokeWidth={1.5} />
                      )}
                      <span className="flex-1">{STATUS_META[s].label}</span>
                      {active && <span className="text-[10px] uppercase tracking-luxe">Atual</span>}
                      {selectable && (
                        <span className="text-[10px] uppercase tracking-luxe opacity-60">
                          Próximo
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          {showTracking && (
            <div className="mt-4 border border-dashed border-[color:var(--gold)] bg-asc-bg-raised p-3">
              <label className="block text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
                Código de rastreio
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value.toUpperCase())}
                  placeholder="AS123BR"
                  className="w-full border border-border bg-background px-2 py-1.5 font-mono text-xs uppercase outline-none focus:border-asc-line"
                />
                <button
                  onClick={saveTracking}
                  className="asc-btn-primary px-3 text-[10px] tracking-luxe uppercase"
                >
                  Salvar
                </button>
              </div>
            </div>
          )}

          {savedFlash && (
            <p className="mt-3 border border-[color:var(--gold)]/60 bg-asc-bg-raised px-3 py-2 text-[11px] text-asc-ink animate-[fade-in_0.3s_ease-out]">
              ✦ {savedFlash}
            </p>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
            <Mail className="mt-px h-3 w-3 shrink-0" strokeWidth={1.5} />
            <span>
              Cada avanço de etapa dispara o e-mail correspondente para{" "}
              <span className="text-asc-ink">{order.customerEmail}</span>.
              {proximo === "Preparando pedido" && (
                <>
                  {" "}
                  Aprovar também <span className="text-asc-ink">baixa o estoque</span> das peças.
                </>
              )}
            </span>
          </p>
        </section>
      </div>
    </li>
  );
}

/* ---------- Cliente ---------- */

function CustomerOrderCard({ order }: { order: Order }) {
  const [openDetails, setOpenDetails] = useState(false);
  const created = new Date(order.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const first = order.items[0];
  const extra = order.items.length - 1;
  const addr = order.address;

  return (
    <li className="border border-border bg-card transition-shadow hover:shadow-[0_12px_32px_-24px_rgba(0,0,0,0.5)]">
      <div className="flex flex-wrap items-center gap-6 p-6 md:p-8">
        <div className="relative h-24 w-20 flex-none overflow-hidden bg-secondary">
          {first?.image ? (
            <img src={first.image} alt={first.name} className="h-full w-full object-cover" />
          ) : null}
          {extra > 0 && (
            <span className="absolute inset-x-0 bottom-0 bg-charcoal/80 py-0.5 text-center text-[9px] tracking-luxe uppercase text-ivory">
              +{extra}
            </span>
          )}
        </div>

        <div className="min-w-[180px] flex-1">
          <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">Pedido</p>
          <Link
            to="/pedidos/$id"
            params={{ id: order.id }}
            className="font-mono text-sm transition-colors hover:text-[color:var(--gold)]"
          >
            {order.id}
          </Link>
          <p className="mt-2 text-xs font-light text-muted-foreground">{created}</p>
          <p className="mt-1 text-xs font-light text-muted-foreground">
            {first?.name}
            {extra > 0 ? ` e mais ${extra} ${extra === 1 ? "item" : "itens"}` : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <StatusBadge status={order.status} />
          <span className="font-serif text-2xl tabular-nums">{formatBRL(order.total)}</span>
          <button
            onClick={() => setOpenDetails((v) => !v)}
            className="text-[10px] tracking-luxe uppercase text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {openDetails ? "Ocultar detalhes" : "Ver detalhes"}
          </button>
        </div>
      </div>

      {openDetails && (
        <div className="animate-[fade-in_0.3s_ease-out_both] border-t border-border px-6 py-8 md:px-8">
          <div className="grid gap-10 md:grid-cols-[1fr_260px]">
            <div>
              <p className="mb-4 text-[10px] tracking-luxe uppercase text-muted-foreground">
                Itens
              </p>
              <ul className="space-y-4 text-sm font-light">
                {order.items.map((i) => (
                  <li key={`${i.id}-${i.size}`} className="flex items-center gap-4">
                    <img src={i.image} alt={i.name} className="h-16 w-12 flex-none object-cover" />
                    <span className="flex-1">
                      {i.name}
                      <span className="block text-xs text-muted-foreground">
                        Tam. {i.size} · x{i.quantity}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatBRL(i.price * i.quantity)}</span>
                  </li>
                ))}
              </ul>

              {addr?.logradouro && (
                <div className="mt-8">
                  <p className="mb-2 text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Entrega
                  </p>
                  <p className="text-sm font-light leading-relaxed text-muted-foreground">
                    {addr.logradouro}, {addr.numero}
                    {addr.complemento ? ` · ${addr.complemento}` : ""}
                    <br />
                    {addr.bairro} · {addr.cidade}/{addr.uf}
                    <br />
                    CEP {addr.cep}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-3 text-sm font-light md:border-l md:border-border md:pl-8">
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
              <p className="flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                  Total
                </span>
                <span className="font-serif text-lg tabular-nums">{formatBRL(order.total)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Pagamento: {paymentLabel(order.paymentMethod)}
              </p>
              {order.trackingCode && (
                <p className="text-xs text-muted-foreground">
                  Rastreio: <span className="font-mono text-foreground">{order.trackingCode}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
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
  if (m === "mp_pix") return "Pix · Mercado Pago";
  if (m === "mp_card") return "Cartão · Mercado Pago";
  if (m === "pix") return "Pix";
  if (m === "credit_card") return "Cartão de crédito";
  if (m === "boleto") return "Boleto";
  // Valor desconhecido não pode virar "Boleto" por descuido: mostra o que veio.
  return m ? String(m) : "—";
}
