import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useCart, formatBRL, PIX_DISCOUNT_RATE, PIX_ENABLED } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { createStripeHostedSession } from "@/lib/checkout.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { quoteShipping, formatCep, normalizeCep } from "@/lib/shipping";

export const Route = createFileRoute("/checkout")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Finalizar Compra — A&S Conccept" },
      {
        name: "description",
        content:
          "Complete seu pedido A&S Conccept com envio nacional e pagamento seguro pelo Stripe.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

const EMPTY: CustomerForm = {
  name: "",
  email: "",
  phone: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};

function formatPhoneBR(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function CheckoutPage() {
  const { items, coupon, couponDiscount, subtotal, count } = useCart();
  const { user, loading, openAuth } = useAuth();
  const navigate = useNavigate();
  const startSession = useServerFn(createStripeHostedSession);

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<CustomerForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerForm, string>>>({});
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefilledRef = useRef(false);

  // Auth guard: precisa estar logado para finalizar.
  // IMPORTANTE: nunca chamamos openAuth() e navigate() no mesmo tick — abrir
  // um portal (modal) enquanto a rota atual está sendo desmontada faz o React
  // tentar inserir nós num pai que já saiu do DOM ("NotFoundError: Failed to
  // execute 'insertBefore'"). Navegamos primeiro; o modal é aberto no próximo
  // tick, já dentro da árvore da home.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/" });
      const t = window.setTimeout(() => {
        try {
          openAuth();
        } catch (err) {
          console.error("[checkout] openAuth after navigate failed", err, {
            loading,
            user,
          });
        }
      }, 0);
      return () => window.clearTimeout(t);
    }
    if (items.length === 0) {
      navigate({ to: "/" });
    }
  }, [loading, user, items, navigate, openAuth]);

  // Pré-preenche com dados do perfil.
  useEffect(() => {
    if (prefilledRef.current || !user) return;
    prefilledRef.current = true;
    setForm((f) => ({
      ...f,
      name: f.name || user.name || "",
      email: f.email || user.email || "",
      phone: f.phone,
    }));
  }, [user]);

  const shippingQuote = useMemo(() => {
    const cepDigits = normalizeCep(form.cep);
    if (cepDigits.length !== 8) return null;
    return quoteShipping(cepDigits, subtotal);
  }, [form.cep, subtotal]);

  const shippingCost = shippingQuote?.displayCost ?? 0;
  const totalCard = Math.max(0, subtotal - couponDiscount) + shippingCost;
  const totalPix = Math.max(0, totalCard * (1 - PIX_DISCOUNT_RATE));

  const setField = <K extends keyof CustomerForm>(k: K, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  // Busca ViaCEP quando CEP completo.
  const onCepChange = async (raw: string) => {
    const formatted = formatCep(raw);
    setField("cep", formatted);
    const digits = normalizeCep(formatted);
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (d && !d.erro) {
        setForm((f) => ({
          ...f,
          logradouro: d.logradouro || f.logradouro,
          bairro: d.bairro || f.bairro,
          cidade: d.localidade || f.cidade,
          uf: (d.uf || f.uf || "").toUpperCase(),
        }));
      }
    } catch {
      /* silencioso — cliente pode preencher manualmente */
    } finally {
      setCepLoading(false);
    }
  };

  const validateStep1 = (): boolean => {
    const e: Partial<Record<keyof CustomerForm, string>> = {};
    if (form.name.trim().length < 3) e.name = "Informe seu nome completo.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = "E-mail inválido.";
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11)
      e.phone = "Telefone inválido.";
    if (normalizeCep(form.cep).length !== 8) e.cep = "CEP inválido.";
    if (!form.logradouro.trim()) e.logradouro = "Informe o endereço.";
    if (!form.numero.trim()) e.numero = "Informe o número.";
    if (!form.bairro.trim()) e.bairro = "Informe o bairro.";
    if (!form.cidade.trim()) e.cidade = "Informe a cidade.";
    if (!/^[A-Z]{2}$/.test(form.uf.trim().toUpperCase())) e.uf = "UF inválida.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goToPayment = () => {
    setError(null);
    if (!validateStep1()) return;
    if (!shippingQuote) {
      setError("Não conseguimos calcular o frete para esse CEP.");
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startPayment = async () => {
    if (!isPaymentsConfigured()) {
      setError(
        "Pagamentos ainda não configurados para esta build. Conclua a etapa de go-live para aceitar pagamentos reais.",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const origin = window.location.origin;
      const result = await startSession({
        data: {
          items: items.map((i) => ({ id: i.id, quantity: i.qty, size: i.size as "P"|"M"|"G"|"GG" })),
          couponCode: coupon?.code ?? null,
          environment: getStripeEnvironment(),
          successUrl: `${origin}/sucesso`,
          cancelUrl: `${origin}/checkout`,
          origin,
          customer: {
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            phone: form.phone.replace(/\D/g, ""),
            cep: normalizeCep(form.cep),
            logradouro: form.logradouro.trim(),
            numero: form.numero.trim(),
            complemento: form.complemento.trim(),
            bairro: form.bairro.trim(),
            cidade: form.cidade.trim(),
            uf: form.uf.trim().toUpperCase(),
          },
        },
      });
      if ("error" in result) {
        setError(result.error);
        setSubmitting(false);
        return;
      }
      window.location.href = result.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar pagamento.");
      setSubmitting(false);
    }
  };

  if (loading || !user || items.length === 0) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" strokeWidth={1.5} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[11px] uppercase tracking-luxe text-muted-foreground hover:text-charcoal"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Continuar comprando
          </Link>
          <p className="font-serif text-lg tracking-widest text-charcoal">A&S Conccept</p>
          <span className="w-40" />
        </header>

        <Stepper step={step} />

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <section>
            {step === 1 ? (
              <StepOne
                form={form}
                errors={errors}
                setField={setField}
                onCepChange={onCepChange}
                cepLoading={cepLoading}
                onSubmit={goToPayment}
              />
            ) : (
              <StepTwo
                form={form}
                onEdit={() => setStep(1)}
                onPay={startPayment}
                submitting={submitting}
                totalCard={totalCard}
                totalPix={totalPix}
              />
            )}
            {error && (
              <p className="mt-6 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            )}
          </section>

          <aside className="h-fit border border-border bg-card/40 p-6">
            <h2 className="text-[11px] uppercase tracking-luxe text-muted-foreground">
              Resumo · {count} {count === 1 ? "peça" : "peças"}
            </h2>
            <ul className="mt-4 divide-y divide-border">
              {items.map((i) => (
                <li key={`${i.id}-${i.size}`} className="flex gap-3 py-3">
                  <img src={i.image} alt={i.name} className="h-16 w-12 object-cover" />
                  <div className="flex-1 text-sm">
                    <p className="font-serif">{i.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Tam. {i.size} · {i.qty}×
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">
                    {formatBRL(i.price * i.qty)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatBRL(subtotal)}</dd>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-accent">
                  <dt>Cupom {coupon?.code}</dt>
                  <dd className="tabular-nums">− {formatBRL(couponDiscount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Frete</dt>
                <dd className="tabular-nums">
                  {shippingQuote
                    ? shippingQuote.free
                      ? "Grátis"
                      : formatBRL(shippingCost)
                    : "—"}
                </dd>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
                <dt className="text-[11px] uppercase tracking-luxe">Total</dt>
                <dd className="font-serif text-2xl tabular-nums">
                  {formatBRL(totalCard)}
                </dd>
              </div>
              {PIX_ENABLED && (
                <p className="pt-1 text-[11px] text-accent">
                  ou <span className="font-medium">{formatBRL(totalPix)}</span> no Pix (5% de desconto)
                </p>
              )}
            </dl>
            <p className="mt-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
              Pagamento processado com segurança pelo Stripe
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <ol className="flex items-center justify-center gap-6 text-[11px] uppercase tracking-luxe">
      <li className={step === 1 ? "text-charcoal" : "text-accent"}>
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center border border-current tabular-nums">1</span>
        Dados & Entrega
      </li>
      <span className="h-px w-10 bg-border" />
      <li className={step === 2 ? "text-charcoal" : "text-muted-foreground"}>
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center border border-current tabular-nums">2</span>
        Pagamento
      </li>
    </ol>
  );
}

function Field({
  label,
  error,
  children,
  className = "",
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
    </label>
  );
}

const inputCls =
  "w-full border-b border-foreground/25 bg-transparent px-1 py-2 text-sm outline-none transition-colors focus:border-accent";

function StepOne({
  form,
  errors,
  setField,
  onCepChange,
  cepLoading,
  onSubmit,
}: {
  form: CustomerForm;
  errors: Partial<Record<keyof CustomerForm, string>>;
  setField: <K extends keyof CustomerForm>(k: K, v: string) => void;
  onCepChange: (v: string) => void;
  cepLoading: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-8"
    >
      <div>
        <h1 className="font-serif text-2xl text-charcoal">Seus dados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Precisamos dessas informações para preparar sua peça com o cuidado de sempre.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome completo" error={errors.name} className="sm:col-span-2">
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            autoComplete="name"
          />
        </Field>
        <Field label="E-mail" error={errors.email}>
          <input
            className={inputCls}
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field label="Celular / WhatsApp" error={errors.phone}>
          <input
            className={inputCls}
            value={form.phone}
            onChange={(e) => setField("phone", formatPhoneBR(e.target.value))}
            placeholder="(00) 00000-0000"
            inputMode="numeric"
            autoComplete="tel"
          />
        </Field>
      </div>

      <div>
        <h2 className="font-serif text-xl text-charcoal">Endereço de entrega</h2>
      </div>

      <div className="grid gap-5 sm:grid-cols-6">
        <Field label={cepLoading ? "CEP · buscando…" : "CEP"} error={errors.cep} className="sm:col-span-2">
          <input
            className={inputCls}
            value={form.cep}
            onChange={(e) => onCepChange(e.target.value)}
            placeholder="00000-000"
            inputMode="numeric"
            maxLength={9}
            autoComplete="postal-code"
          />
        </Field>
        <Field label="Endereço" error={errors.logradouro} className="sm:col-span-4">
          <input
            className={inputCls}
            value={form.logradouro}
            onChange={(e) => setField("logradouro", e.target.value)}
            autoComplete="address-line1"
          />
        </Field>
        <Field label="Número" error={errors.numero} className="sm:col-span-2">
          <input
            className={inputCls}
            value={form.numero}
            onChange={(e) => setField("numero", e.target.value)}
          />
        </Field>
        <Field label="Complemento (opcional)" className="sm:col-span-4">
          <input
            className={inputCls}
            value={form.complemento}
            onChange={(e) => setField("complemento", e.target.value)}
          />
        </Field>
        <Field label="Bairro" error={errors.bairro} className="sm:col-span-2">
          <input
            className={inputCls}
            value={form.bairro}
            onChange={(e) => setField("bairro", e.target.value)}
          />
        </Field>
        <Field label="Cidade" error={errors.cidade} className="sm:col-span-3">
          <input
            className={inputCls}
            value={form.cidade}
            onChange={(e) => setField("cidade", e.target.value)}
          />
        </Field>
        <Field label="UF" error={errors.uf} className="sm:col-span-1">
          <input
            className={`${inputCls} uppercase`}
            value={form.uf}
            onChange={(e) => setField("uf", e.target.value.toUpperCase().slice(0, 2))}
            maxLength={2}
          />
        </Field>
      </div>

      <button
        type="submit"
        className="w-full bg-charcoal px-8 py-4 text-[11px] uppercase tracking-luxe text-ivory transition-colors hover:bg-navy sm:w-auto"
      >
        Ir para o pagamento →
      </button>
    </form>
  );
}

function StepTwo({
  form,
  onEdit,
  onPay,
  submitting,
  totalCard,
  totalPix,
}: {
  form: CustomerForm;
  onEdit: () => void;
  onPay: () => void;
  submitting: boolean;
  totalCard: number;
  totalPix: number;
}) {
  const addressLine = `${form.logradouro}, ${form.numero}${form.complemento ? " — " + form.complemento : ""}`;
  const cityLine = `${form.bairro} · ${form.cidade}/${form.uf} · CEP ${formatCep(form.cep)}`;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl text-charcoal">Pagamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Você será conduzido ao ambiente seguro do Stripe para concluir a compra.
        </p>
      </div>

      <section className="border border-border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Entregar para
            </p>
            <p className="mt-2 font-serif text-base">{form.name}</p>
            <p className="text-muted-foreground">
              {form.email} · {form.phone}
            </p>
            <p className="mt-3">{addressLine}</p>
            <p className="text-muted-foreground">{cityLine}</p>
          </div>
          <button
            onClick={onEdit}
            className="text-[11px] uppercase tracking-luxe text-accent underline-offset-4 hover:underline"
          >
            Editar
          </button>
        </div>
      </section>

      <section className="border border-border p-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Formas de pagamento
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex justify-between">
            <span>Cartão de crédito · até 12×</span>
            <span className="tabular-nums font-medium">{formatBRL(totalCard)}</span>
          </li>
          <li className="flex justify-between text-accent">
            <span>Pix · 5% de desconto</span>
            <span className="tabular-nums font-medium">{formatBRL(totalPix)}</span>
          </li>
        </ul>
        <p className="mt-4 text-[11px] text-muted-foreground">
          A forma de pagamento é escolhida na próxima tela, dentro do ambiente do Stripe.
        </p>
      </section>

      <button
        onClick={onPay}
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 bg-charcoal px-8 py-4 text-[11px] uppercase tracking-luxe text-ivory transition-colors hover:bg-navy disabled:opacity-60 sm:w-auto"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Lock className="h-4 w-4" strokeWidth={1.5} />
        )}
        {submitting ? "Preparando ambiente seguro…" : "Pagar com segurança"}
      </button>
    </div>
  );
}
