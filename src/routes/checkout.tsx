import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, CreditCard, QrCode, FileText, Loader2 } from "lucide-react";
import { useCart, formatBRL } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { useOrders } from "@/lib/orders-context";
import type { CheckoutAddress, PaymentMethod } from "@/lib/types";
import { formatCep, normalizeCep, quoteShipping, FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Finalizar Compra — A&S Concept" },
      { name: "description", content: "Complete seu pedido A&S Concept com envio nacional e pagamento seguro." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { user, openAuth } = useAuth();
  const { items, subtotal, count } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) openAuth();
  }, [user, openAuth]);

  if (!user) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center">
          <h1 className="font-serif text-3xl">Entre para finalizar</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            É necessário estar autenticado para prosseguir ao checkout.
          </p>
          <button
            onClick={openAuth}
            className="mt-8 bg-charcoal px-8 py-3 text-[11px] tracking-luxe uppercase text-ivory hover:bg-navy"
          >
            Entrar / Cadastrar
          </button>
        </div>
      </Shell>
    );
  }

  if (items.length === 0) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center">
          <h1 className="font-serif text-3xl">Sua sacola está vazia</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Adicione peças à sua sacola para prosseguir.
          </p>
          <Link
            to="/"
            className="mt-8 inline-block bg-charcoal px-8 py-3 text-[11px] tracking-luxe uppercase text-ivory hover:bg-navy"
          >
            Voltar à vitrine
          </Link>
        </div>
      </Shell>
    );
  }

  return <CheckoutForm email={user.email} subtotal={subtotal} count={count} navigate={navigate} />;
}

function CheckoutForm({
  email,
  subtotal,
  count,
  navigate,
}: {
  email: string;
  subtotal: number;
  count: number;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { items, clear } = useCart() as ReturnType<typeof useCart> & { clear?: () => void };
  const cart = useCart();
  const { createOrder } = useOrders();

  const [address, setAddress] = useState<CheckoutAddress>({
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
  });
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const quote = useMemo(() => quoteShipping(address.cep, subtotal), [address.cep, subtotal]);
  const shippingCost = quote?.displayCost ?? 0;
  const total = subtotal + shippingCost;

  useEffect(() => {
    const digits = normalizeCep(address.cep);
    if (digits.length !== 8) return;
    let cancelled = false;
    setCepLoading(true);
    setCepError(null);
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.erro) {
          setCepError("CEP não encontrado.");
          return;
        }
        setAddress((prev) => ({
          ...prev,
          logradouro: data.logradouro || prev.logradouro,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          uf: data.uf || prev.uf,
        }));
      })
      .catch(() => {
        if (!cancelled) setCepError("Não foi possível consultar o CEP.");
      })
      .finally(() => {
        if (!cancelled) setCepLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address.cep]);

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!quote) {
      setFormError("Informe um CEP válido para calcular o frete.");
      return;
    }
    if (!address.logradouro.trim() || !address.numero.trim() || !address.bairro.trim() || !address.cidade.trim() || !address.uf.trim()) {
      setFormError("Preencha todos os campos obrigatórios do endereço.");
      return;
    }
    setPlacing(true);
    // Simula processamento do pagamento
    await new Promise((r) => setTimeout(r, 900));
    const order = createOrder({
      customerEmail: email,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.qty,
        size: i.size,
        image: i.image,
      })),
      address: { ...address, cep: formatCep(address.cep) },
      shippingCost,
      subtotal,
      total,
      paymentMethod: payment,
    });
    if (typeof clear === "function") clear();
    else {
      // Fallback: esvazia removendo cada item
      cart.items.forEach((i) => cart.remove(i.id, i.size));
    }
    setPlacing(false);
    navigate({ to: "/pedidos/$id", params: { id: order.id } });
  };

  return (
    <Shell>
      <div className="mx-auto grid max-w-6xl gap-10 py-10 lg:grid-cols-[1.4fr_1fr] lg:py-16">
        <form onSubmit={placeOrder} className="space-y-10">
          <section>
            <h2 className="font-serif text-2xl">Endereço de Entrega</h2>
            <p className="mt-1 text-[11px] tracking-luxe uppercase text-muted-foreground">
              Envio a partir de Curitiba/PR
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-6">
              <Field label="CEP" required className="sm:col-span-2">
                <div className="relative">
                  <input
                    inputMode="numeric"
                    value={formatCep(address.cep)}
                    onChange={(e) => setAddress((a) => ({ ...a, cep: normalizeCep(e.target.value) }))}
                    placeholder="00000-000"
                    className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-charcoal"
                    maxLength={9}
                    required
                  />
                  {cepLoading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                {cepError && <p className="mt-1 text-[11px] text-destructive">{cepError}</p>}
              </Field>
              <Field label="Logradouro" required className="sm:col-span-4">
                <input
                  value={address.logradouro}
                  onChange={(e) => setAddress((a) => ({ ...a, logradouro: e.target.value }))}
                  className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-charcoal"
                  required
                />
              </Field>
              <Field label="Número" required className="sm:col-span-2">
                <input
                  value={address.numero}
                  onChange={(e) => setAddress((a) => ({ ...a, numero: e.target.value }))}
                  className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-charcoal"
                  required
                />
              </Field>
              <Field label="Complemento" className="sm:col-span-4">
                <input
                  value={address.complemento}
                  onChange={(e) => setAddress((a) => ({ ...a, complemento: e.target.value }))}
                  className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-charcoal"
                  placeholder="Apto, bloco, referência"
                />
              </Field>
              <Field label="Bairro" required className="sm:col-span-3">
                <input
                  value={address.bairro}
                  onChange={(e) => setAddress((a) => ({ ...a, bairro: e.target.value }))}
                  className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-charcoal"
                  required
                />
              </Field>
              <Field label="Cidade" required className="sm:col-span-2">
                <input
                  value={address.cidade}
                  onChange={(e) => setAddress((a) => ({ ...a, cidade: e.target.value }))}
                  className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-charcoal"
                  required
                />
              </Field>
              <Field label="UF" required className="sm:col-span-1">
                <input
                  value={address.uf}
                  onChange={(e) => setAddress((a) => ({ ...a, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                  className="w-full border border-border bg-background px-3 py-2 text-sm uppercase outline-none focus:border-charcoal"
                  maxLength={2}
                  required
                />
              </Field>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">Forma de Pagamento</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <PaymentOption
                active={payment === "pix"}
                onClick={() => setPayment("pix")}
                icon={<QrCode className="h-5 w-5" strokeWidth={1.4} />}
                label="PIX"
                hint="Aprovação imediata"
              />
              <PaymentOption
                active={payment === "credit_card"}
                onClick={() => setPayment("credit_card")}
                icon={<CreditCard className="h-5 w-5" strokeWidth={1.4} />}
                label="Cartão de Crédito"
                hint="Até 10x sem juros"
              />
              <PaymentOption
                active={payment === "boleto"}
                onClick={() => setPayment("boleto")}
                icon={<FileText className="h-5 w-5" strokeWidth={1.4} />}
                label="Boleto"
                hint="Compensação em 1-2 dias"
              />
            </div>
          </section>

          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}

          <button
            type="submit"
            disabled={placing}
            className="w-full bg-charcoal py-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy disabled:opacity-60"
          >
            {placing ? "Processando pagamento..." : `Confirmar pedido — ${formatBRL(total)}`}
          </button>
        </form>

        <aside className="h-fit border border-border bg-secondary/30 p-6 lg:sticky lg:top-24">
          <h3 className="font-serif text-xl">Resumo do Pedido</h3>
          <p className="mt-1 text-[11px] tracking-luxe uppercase text-muted-foreground">
            {count} {count === 1 ? "peça" : "peças"}
          </p>
          <ul className="mt-6 space-y-4">
            {items.map((i) => (
              <li key={`${i.id}-${i.size}`} className="flex gap-3">
                <img src={i.image} alt={i.name} className="h-16 w-12 object-cover" />
                <div className="flex-1 text-sm">
                  <p className="font-serif leading-tight">{i.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Tam. {i.size} · Qtd. {i.qty}
                  </p>
                </div>
                <span className="text-sm tabular-nums">{formatBRL(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
            <Row label="Subtotal" value={formatBRL(subtotal)} />
            <Row
              label={quote ? `Frete (${quote.stateName})` : "Frete"}
              value={
                !quote
                  ? "—"
                  : quote.free
                    ? "Grátis"
                    : formatBRL(quote.displayCost)
              }
            />
            {quote && !quote.free && (
              <p className="text-[11px] text-muted-foreground">
                Prazo estimado: {quote.etaDays[0]}–{quote.etaDays[1]} dias úteis. Faltam{" "}
                {formatBRL(Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal))} para frete grátis.
              </p>
            )}
            {quote?.free && (
              <p className="text-[11px] text-accent">Você ganhou frete grátis 🎉</p>
            )}
          </div>
          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">Total</span>
            <span className="font-serif text-2xl tabular-nums">{formatBRL(total)}</span>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Continuar comprando
          </Link>
          <Link to="/" className="font-serif text-xl tracking-widest">A&S Concept</Link>
          <Link to="/pedidos" className="text-[11px] tracking-luxe uppercase text-muted-foreground hover:text-foreground">
            Meus Pedidos
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6">{children}</main>
    </div>
  );
}

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
        {label} {required && <span className="text-accent">*</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function PaymentOption({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-2 border p-4 text-left transition-all ${
        active
          ? "border-charcoal bg-charcoal text-ivory"
          : "border-border bg-background hover:border-charcoal"
      }`}
    >
      {icon}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className={`text-[11px] ${active ? "text-ivory/70" : "text-muted-foreground"}`}>{hint}</p>
      </div>
    </button>
  );
}
