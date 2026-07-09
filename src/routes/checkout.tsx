import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  CreditCard,
  QrCode,
  FileText,
  Loader2,
  Copy,
  Check,
  Download,
} from "lucide-react";
import { useCart, formatBRL } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { useOrders } from "@/lib/orders-context";
import { triggerOrderCreatedMail } from "@/lib/mail";
import { supabase } from "@/integrations/supabase/client";
import { markCouponUsed } from "@/lib/coupons";
import type { CheckoutAddress, PaymentMethod } from "@/lib/types";
import {
  formatCep,
  normalizeCep,
  quoteShipping,
  FREE_SHIPPING_THRESHOLD,
} from "@/lib/shipping";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Finalizar Compra — A&S Concept" },
      {
        name: "description",
        content:
          "Complete seu pedido A&S Concept com envio nacional e pagamento seguro.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

async function consumeOrderStockRemote(orderNumber: string) {
  // Server-side function verifies the order belongs to the caller and only
  // decrements once, so clients cannot arbitrarily deplete inventory.
  await supabase.rpc("consume_order_stock", { _order_number: orderNumber });
}

function CheckoutPage() {
  const { user, loading, openAuth } = useAuth();
  const { items, subtotal, count } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) openAuth();
  }, [loading, user, openAuth]);

  if (loading) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center animate-[fade-in_0.5s_ease-out]">
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
        <div className="mx-auto max-w-md py-24 text-center animate-[fade-in_0.5s_ease-out]">
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

  return (
    <CheckoutForm
      email={user.email}
      subtotal={subtotal}
      count={count}
      navigate={navigate}
    />
  );
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
  const { items, clear, couponCode, couponDiscount } = useCart();
  const { user } = useAuth();
  const { createOrder } = useOrders();

  const [step, setStep] = useState<1 | 2>(1);
  const [customerName, setCustomerName] = useState("");
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

  // Estado do cartão de crédito (só para animação — não persiste, não envia a lugar nenhum)
  const [card, setCard] = useState({ number: "", name: "", expiry: "", cvv: "" });
  const [cardFlipped, setCardFlipped] = useState(false);

  const quote = useMemo(
    () => quoteShipping(address.cep, subtotal),
    [address.cep, subtotal],
  );
  const shippingCost = quote?.displayCost ?? 0;
  const discount = Math.min(subtotal, couponDiscount || 0);
  const total = Math.max(0, subtotal - discount) + shippingCost;


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

  const goToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!customerName.trim()) {
      setFormError("Informe seu nome completo.");
      return;
    }
    if (!quote) {
      setFormError("Informe um CEP válido para calcular o frete.");
      return;
    }
    if (
      !address.logradouro.trim() ||
      !address.numero.trim() ||
      !address.bairro.trim() ||
      !address.cidade.trim() ||
      !address.uf.trim()
    ) {
      setFormError("Preencha todos os campos obrigatórios do endereço.");
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const placeOrder = async () => {
    setFormError(null);
    if (payment === "credit_card") {
      const digits = card.number.replace(/\D/g, "");
      if (digits.length < 13) {
        setFormError("Número do cartão inválido.");
        return;
      }
      if (!card.name.trim()) {
        setFormError("Informe o nome impresso no cartão.");
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(card.expiry)) {
        setFormError("Validade no formato MM/AA.");
        return;
      }
      if (card.cvv.length < 3) {
        setFormError("CVV inválido.");
        return;
      }
    }
    setPlacing(true);
    await new Promise((r) => setTimeout(r, 900));
    const orderItems = items.map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      quantity: i.qty,
      size: i.size,
      image: i.image,
    }));
    try {
      const order = await createOrder({
        customerEmail: email,
        customerName: customerName.trim(),
        items: orderItems,
        address: { ...address, cep: formatCep(address.cep) },
        shippingCost,
        subtotal,
        total,
        paymentMethod: payment,
        couponCode: couponCode ?? null,
        discount,
      });
      await decrementStockRemote(
        items.map((i) => ({ id: i.id, size: i.size, qty: i.qty })),
      );
      if (couponCode && user) {
        try { await markCouponUsed(user.id, couponCode, order.id); } catch { /* ignore */ }
      }
      void triggerOrderCreatedMail(email, order.id, total, orderItems);
      clear();
      setPlacing(false);
      navigate({ to: "/pedidos/$id", params: { id: order.id } });
    } catch (err) {
      setPlacing(false);
      setFormError(
        err instanceof Error ? err.message : "Não foi possível registrar o pedido.",
      );
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-6xl py-8 lg:py-12 animate-[fade-in_0.5s_ease-out]">
        <Stepper current={step} onBack={() => setStep(1)} />

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {step === 1 ? (
              <AddressStep
                customerName={customerName}
                setCustomerName={setCustomerName}
                address={address}
                setAddress={setAddress}
                cepLoading={cepLoading}
                cepError={cepError}
                onSubmit={goToPayment}
                formError={formError}
              />
            ) : (
              <PaymentStep
                payment={payment}
                setPayment={setPayment}
                card={card}
                setCard={setCard}
                cardFlipped={cardFlipped}
                setCardFlipped={setCardFlipped}
                onConfirm={placeOrder}
                placing={placing}
                total={total}
                formError={formError}
              />
            )}
          </div>

          <aside className="h-fit border border-border bg-secondary/30 p-6 lg:sticky lg:top-24">
            <h3 className="font-serif text-xl">Resumo do Pedido</h3>
            <p className="mt-1 text-[11px] tracking-luxe uppercase text-muted-foreground">
              {count} {count === 1 ? "peça" : "peças"}
            </p>
            <ul className="mt-6 space-y-4">
              {items.map((i) => (
                <li key={`${i.id}-${i.size}`} className="flex gap-3">
                  <img
                    src={i.image}
                    alt={i.name}
                    className="h-16 w-12 object-cover"
                  />
                  <div className="flex-1 text-sm">
                    <p className="font-serif leading-tight">{i.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Tam. {i.size} · Qtd. {i.qty}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">
                    {formatBRL(i.price * i.qty)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
              <Row label="Subtotal" value={formatBRL(subtotal)} />
              {discount > 0 && (
                <Row
                  label={couponCode ? `Cupom ${couponCode}` : "Desconto"}
                  value={`− ${formatBRL(discount)}`}
                />
              )}
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
                  Prazo estimado: {quote.etaDays[0]}–{quote.etaDays[1]} dias
                  úteis. Faltam{" "}
                  {formatBRL(Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal))}{" "}
                  para frete grátis.
                </p>
              )}
              {quote?.free && (
                <p className="text-[11px] text-[color:var(--gold)]">
                  Você ganhou frete grátis ✦
                </p>
              )}
            </div>
            <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
              <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">
                Total
              </span>
              <span className="font-serif text-2xl tabular-nums">
                {formatBRL(total)}
              </span>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

/* ---------- Stepper ---------- */

function Stepper({ current, onBack }: { current: 1 | 2; onBack: () => void }) {
  return (
    <div className="flex items-center gap-4">
      <StepDot n={1} active={current >= 1} label="Identificação & Endereço" />
      <div className="h-px flex-1 bg-border" />
      <StepDot n={2} active={current >= 2} label="Pagamento" />
      {current === 2 && (
        <button
          onClick={onBack}
          className="ml-4 text-[11px] tracking-luxe uppercase text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Voltar
        </button>
      )}
    </div>
  );
}

function StepDot({ n, active, label }: { n: number; active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-8 w-8 items-center justify-center border font-serif text-sm transition-colors ${
          active
            ? "border-charcoal bg-charcoal text-ivory"
            : "border-border bg-background text-muted-foreground"
        }`}
      >
        {n}
      </span>
      <span
        className={`text-[11px] tracking-luxe uppercase ${
          active ? "text-charcoal" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ---------- Step 1: Address ---------- */

function AddressStep({
  customerName,
  setCustomerName,
  address,
  setAddress,
  cepLoading,
  cepError,
  onSubmit,
  formError,
}: {
  customerName: string;
  setCustomerName: (v: string) => void;
  address: CheckoutAddress;
  setAddress: React.Dispatch<React.SetStateAction<CheckoutAddress>>;
  cepLoading: boolean;
  cepError: string | null;
  onSubmit: (e: React.FormEvent) => void;
  formError: string | null;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-10 animate-[fade-in_0.35s_ease-out]"
    >
      <section>
        <h2 className="font-serif text-2xl">Identificação</h2>
        <p className="mt-1 text-[11px] tracking-luxe uppercase text-muted-foreground">
          Para personalizarmos sua correspondência
        </p>
        <div className="mt-6">
          <Field label="Nome completo" required>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Como aparece nos documentos"
              className={inputCls}
              required
            />
          </Field>
        </div>
      </section>

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
                onChange={(e) =>
                  setAddress((a) => ({ ...a, cep: normalizeCep(e.target.value) }))
                }
                placeholder="00000-000"
                className={inputCls}
                maxLength={9}
                required
              />
              {cepLoading && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {cepError && (
              <p className="mt-1 text-[11px] text-destructive">{cepError}</p>
            )}
          </Field>
          <Field label="Logradouro" required className="sm:col-span-4">
            <input
              value={address.logradouro}
              onChange={(e) => setAddress((a) => ({ ...a, logradouro: e.target.value }))}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Número" required className="sm:col-span-2">
            <input
              value={address.numero}
              onChange={(e) => setAddress((a) => ({ ...a, numero: e.target.value }))}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Complemento" className="sm:col-span-4">
            <input
              value={address.complemento}
              onChange={(e) => setAddress((a) => ({ ...a, complemento: e.target.value }))}
              className={inputCls}
              placeholder="Apto, bloco, referência"
            />
          </Field>
          <Field label="Bairro" required className="sm:col-span-3">
            <input
              value={address.bairro}
              onChange={(e) => setAddress((a) => ({ ...a, bairro: e.target.value }))}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Cidade" required className="sm:col-span-2">
            <input
              value={address.cidade}
              onChange={(e) => setAddress((a) => ({ ...a, cidade: e.target.value }))}
              className={inputCls}
              required
            />
          </Field>
          <Field label="UF" required className="sm:col-span-1">
            <input
              value={address.uf}
              onChange={(e) =>
                setAddress((a) => ({
                  ...a,
                  uf: e.target.value.toUpperCase().slice(0, 2),
                }))
              }
              className={`${inputCls} uppercase`}
              maxLength={2}
              required
            />
          </Field>
        </div>
      </section>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <button
        type="submit"
        className="w-full bg-charcoal py-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy"
      >
        Avançar ao pagamento →
      </button>
    </form>
  );
}

/* ---------- Step 2: Payment ---------- */

function PaymentStep({
  payment,
  setPayment,
  card,
  setCard,
  cardFlipped,
  setCardFlipped,
  onConfirm,
  placing,
  total,
  formError,
}: {
  payment: PaymentMethod;
  setPayment: (m: PaymentMethod) => void;
  card: { number: string; name: string; expiry: string; cvv: string };
  setCard: React.Dispatch<
    React.SetStateAction<{ number: string; name: string; expiry: string; cvv: string }>
  >;
  cardFlipped: boolean;
  setCardFlipped: (v: boolean) => void;
  onConfirm: () => void;
  placing: boolean;
  total: number;
  formError: string | null;
}) {
  return (
    <div className="space-y-10 animate-[fade-in_0.35s_ease-out]">
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
            label="Boleto Heritage"
            hint="Compensa em 1-2 dias"
          />
        </div>
      </section>

      <section className="min-h-[280px]">
        {payment === "credit_card" && (
          <CreditCardForm
            card={card}
            setCard={setCard}
            flipped={cardFlipped}
            setFlipped={setCardFlipped}
          />
        )}
        {payment === "pix" && <PixPanel total={total} />}
        {payment === "boleto" && <BoletoPanel total={total} />}
      </section>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <button
        onClick={onConfirm}
        disabled={placing}
        className="w-full bg-charcoal py-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy disabled:opacity-60"
      >
        {placing
          ? "Processando pagamento..."
          : `Confirmar pedido — ${formatBRL(total)}`}
      </button>
    </div>
  );
}

/* ---------- Credit Card 3D ---------- */

function CreditCardForm({
  card,
  setCard,
  flipped,
  setFlipped,
}: {
  card: { number: string; name: string; expiry: string; cvv: string };
  setCard: React.Dispatch<
    React.SetStateAction<{ number: string; name: string; expiry: string; cvv: string }>
  >;
  flipped: boolean;
  setFlipped: (v: boolean) => void;
}) {
  const formatNumber = (v: string) =>
    v
      .replace(/\D/g, "")
      .slice(0, 19)
      .replace(/(\d{4})(?=\d)/g, "$1 ")
      .trim();
  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,340px)_1fr] md:items-start">
      <div className="perspective-1000 self-center">
        <div
          className={`transform-style-3d relative aspect-[1.586/1] w-full transition-transform duration-700 ${
            flipped ? "rotate-y-180" : ""
          }`}
        >
          {/* Frente */}
          <div className="backface-hidden absolute inset-0 flex flex-col justify-between rounded-md bg-gradient-to-br from-[#0B0B0F] via-[#1A1A22] to-[#0B0B0F] p-5 text-ivory shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] tracking-luxe uppercase text-[color:var(--gold)]">
                  A&S · Centurion Preferred
                </p>
                <p className="mt-1 font-serif text-lg leading-none">Black Edition</p>
              </div>
              <div className="h-6 w-9 rounded-sm bg-gradient-to-br from-[color:var(--gold)] to-[#8b6d2f]" />
            </div>
            <p className="font-mono text-lg tracking-[0.18em] tabular-nums">
              {(formatNumber(card.number) || "•••• •••• •••• ••••").padEnd(19, " ")}
            </p>
            <div className="flex items-end justify-between text-[10px] tracking-luxe uppercase">
              <div>
                <p className="text-[8px] opacity-60">Titular</p>
                <p className="mt-1 text-xs">{card.name || "SEU NOME"}</p>
              </div>
              <div>
                <p className="text-[8px] opacity-60">Validade</p>
                <p className="mt-1 text-xs font-mono">{card.expiry || "MM/AA"}</p>
              </div>
            </div>
          </div>
          {/* Verso */}
          <div className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col rounded-md bg-gradient-to-br from-[#0B0B0F] via-[#1A1A22] to-[#0B0B0F] p-5 text-ivory shadow-2xl">
            <div className="-mx-5 mt-3 h-10 bg-black" />
            <div className="mt-5 flex items-center gap-2 bg-white/90 px-3 py-2 text-charcoal">
              <span className="flex-1 text-xs italic opacity-70">
                Assinatura autorizada
              </span>
              <span className="font-mono text-sm tracking-widest">
                {card.cvv || "•••"}
              </span>
            </div>
            <p className="mt-auto text-[9px] tracking-luxe uppercase opacity-60">
              A&S Concept · Cartão simulado para demonstração
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        <Field label="Número do cartão" required>
          <input
            inputMode="numeric"
            value={formatNumber(card.number)}
            onChange={(e) =>
              setCard((c) => ({ ...c, number: e.target.value.replace(/\D/g, "") }))
            }
            onFocus={() => setFlipped(false)}
            placeholder="0000 0000 0000 0000"
            className={`${inputCls} font-mono tracking-widest`}
          />
        </Field>
        <Field label="Nome no cartão" required>
          <input
            value={card.name}
            onChange={(e) =>
              setCard((c) => ({ ...c, name: e.target.value.toUpperCase() }))
            }
            onFocus={() => setFlipped(false)}
            placeholder="COMO IMPRESSO"
            className={`${inputCls} uppercase`}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Validade (MM/AA)" required>
            <input
              inputMode="numeric"
              value={card.expiry}
              onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))}
              onFocus={() => setFlipped(false)}
              placeholder="MM/AA"
              className={`${inputCls} font-mono`}
              maxLength={5}
            />
          </Field>
          <Field label="CVV" required>
            <input
              inputMode="numeric"
              value={card.cvv}
              onChange={(e) =>
                setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))
              }
              onFocus={() => setFlipped(true)}
              onBlur={() => setFlipped(false)}
              placeholder="•••"
              className={`${inputCls} font-mono tracking-widest`}
              maxLength={4}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

/* ---------- PIX ---------- */

function PixPanel({ total }: { total: number }) {
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(15 * 60);
  const pixKey = useMemo(
    () =>
      `00020126580014BR.GOV.BCB.PIX0136ateliê@asconcept.com.br5204000053039865802BR5915AeS%20CONCEPT6009CURITIBA62070503***6304${Math.floor(
        Math.random() * 9000 + 1000,
      )}`,
    [],
  );
  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const expired = remaining === 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pixKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="grid gap-6 border border-border bg-card p-6 md:grid-cols-[220px_1fr]">
      <div>
        <div
          className="relative aspect-square w-full bg-charcoal p-3"
          aria-label="QR Code PIX (simulado)"
        >
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                "repeating-conic-gradient(#fdfbf7 0% 25%, #0f0f13 0% 50%)",
              backgroundSize: "12px 12px",
            }}
          />
          <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-ivory">
            <span className="font-serif text-lg text-charcoal">A&amp;S</span>
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] tracking-luxe uppercase text-muted-foreground">
          QR Code Black · simulação
        </p>
      </div>

      <div className="flex flex-col">
        <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
          Pague com PIX
        </p>
        <h3 className="mt-1 font-serif text-2xl">{formatBRL(total)}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Escaneie o QR Code no app do seu banco ou copie a chave abaixo.
        </p>

        <div className="mt-4 flex items-center justify-between border border-border bg-secondary/40 px-3 py-2">
          <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">
            {expired ? "Expirado" : "Expira em"}
          </span>
          <span
            className={`font-mono text-lg tabular-nums ${
              expired ? "text-destructive" : "text-charcoal"
            }`}
          >
            {mm}:{ss}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          <div className="flex-1 truncate border border-border bg-background px-3 py-2 font-mono text-xs">
            {pixKey}
          </div>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-2 bg-charcoal px-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiada" : "Copiar"}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Após o pagamento, seu pedido entra em análise automaticamente.
        </p>
      </div>
    </div>
  );
}

/* ---------- Boleto ---------- */

function BoletoPanel({ total }: { total: number }) {
  const barcode = useMemo(() => {
    let s = "";
    for (let i = 0; i < 47; i++) s += Math.floor(Math.random() * 10);
    return `${s.slice(0, 5)}.${s.slice(5, 10)} ${s.slice(10, 15)}.${s.slice(15, 21)} ${s.slice(21, 26)}.${s.slice(26, 32)} ${s.slice(32, 33)} ${s.slice(33)}`;
  }, []);
  const due = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toLocaleDateString("pt-BR");
  }, []);
  const printRef = useRef<HTMLDivElement>(null);

  const download = () => {
    if (!printRef.current) return;
    const html = printRef.current.innerHTML;
    const blob = new Blob(
      [
        `<!doctype html><html><head><meta charset="utf-8" /><title>Boleto ${barcode.slice(0, 8)}</title><style>body{font-family:Georgia,serif;padding:32px;color:#141B2E}h1{font-weight:400}</style></head><body>${html}</body></html>`,
      ],
      { type: "text/html" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `boleto-as-concept.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border border-border bg-card">
      <div ref={printRef} className="border-b border-border p-6">
        <div className="flex items-start justify-between border-b border-dashed border-border pb-4">
          <div>
            <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
              A&S Concept
            </p>
            <p className="mt-1 font-serif text-xl">Boleto Heritage</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              Vencimento
            </p>
            <p className="mt-1 font-serif text-lg">{due}</p>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              Beneficiário
            </dt>
            <dd className="mt-1 text-charcoal">A&S Concept Ltda.</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              CNPJ
            </dt>
            <dd className="mt-1 text-charcoal">00.000.000/0001-00</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              Valor
            </dt>
            <dd className="mt-1 font-serif text-lg text-charcoal">
              {formatBRL(total)}
            </dd>
          </div>
        </dl>
        <div className="mt-6">
          <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
            Linha digitável
          </p>
          <p className="mt-1 font-mono text-sm tracking-tight text-charcoal">
            {barcode}
          </p>
        </div>
        <div className="mt-4 flex h-14 items-end gap-[2px]">
          {Array.from({ length: 60 }).map((_, i) => (
            <span
              key={i}
              className="block bg-charcoal"
              style={{ width: i % 3 === 0 ? 3 : 1, height: `${40 + ((i * 37) % 60)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between p-4">
        <p className="text-[11px] text-muted-foreground">
          Pague em qualquer banco, lotérica ou internet banking.
        </p>
        <button
          type="button"
          onClick={download}
          className="flex items-center gap-2 border border-charcoal px-4 py-2 text-[11px] tracking-luxe uppercase text-charcoal transition-colors hover:bg-charcoal hover:text-ivory"
        >
          <Download className="h-4 w-4" /> Baixar Boleto
        </button>
      </div>
    </div>
  );
}

/* ---------- Shell + primitives ---------- */

const inputCls =
  "w-full border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-charcoal";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Continuar comprando
          </Link>
          <Link to="/" className="font-serif text-xl tracking-widest">
            A&S Concept
          </Link>
          <Link
            to="/pedidos"
            className="text-[11px] tracking-luxe uppercase text-muted-foreground transition-colors hover:text-foreground"
          >
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
        {label} {required && <span className="text-[color:var(--gold)]">*</span>}
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
        <p
          className={`text-[11px] ${
            active ? "text-ivory/70" : "text-muted-foreground"
          }`}
        >
          {hint}
        </p>
      </div>
    </button>
  );
}
