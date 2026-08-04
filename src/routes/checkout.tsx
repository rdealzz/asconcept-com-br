import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, CreditCard, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useCart, formatBRL, PIX_DISCOUNT_RATE, PIX_ENABLED } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import {
  createPendingOrder,
  createPixPayment,
  getPaymentStatus,
  payWithCardToken,
} from "@/lib/payments.functions";
import { formatCpf, isValidCpf } from "@/lib/mercadopago";
import { CardBrick, type CardFormData } from "@/components/CardBrick";
import { PixPanel, type PixCharge } from "@/components/PixPanel";
import { quoteShipping, formatCep, normalizeCep } from "@/lib/shipping";
import { ContactStrip } from "@/components/ContactStrip";

export const Route = createFileRoute("/checkout")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Finalizar Compra — A&S Conccept" },
      {
        name: "description",
        content:
          "Complete seu pedido A&S Conccept com envio nacional e pagamento seguro no próprio site.",
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
  cpf: string;
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
  cpf: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};

type PayMethod = "card" | "pix";

function formatPhoneBR(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function CheckoutPage() {
  const { items, coupon, couponDiscount, subtotal, count, clear, hydrated } = useCart();
  const { user, loading, openAuth } = useAuth();
  const navigate = useNavigate();
  const startOrder = useServerFn(createPendingOrder);
  const payCard = useServerFn(payWithCardToken);
  const startPix = useServerFn(createPixPayment);
  const checkStatus = useServerFn(getPaymentStatus);

  const [step, setStep] = useState<1 | 2>(1);
  const [method, setMethod] = useState<PayMethod>("card");
  const [form, setForm] = useState<CustomerForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerForm, string>>>({});
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixCharge | null>(null);
  const prefilledRef = useRef(false);
  const pendingRef = useRef<{ signature: string; orderNumber: string } | null>(null);


  // Sem redirecionar: a página mostra o estado certo (entrar / sacola vazia).
  // Redirecionar dentro de efeito quebrava o checkout em acesso direto ou F5,
  // porque o carrinho ainda não tinha sido restaurado do navegador.

  useEffect(() => {
    if (prefilledRef.current || !user) return;
    prefilledRef.current = true;
    setForm((f) => ({
      ...f,
      name: f.name || user.name || "",
      email: f.email || user.email || "",
    }));
  }, [user]);

  const shippingQuote = useMemo(() => {
    const cepDigits = normalizeCep(form.cep);
    if (cepDigits.length !== 8) return null;
    return quoteShipping(cepDigits, subtotal);
  }, [form.cep, subtotal]);

  const shippingCost = shippingQuote?.displayCost ?? 0;
  const totalCard = Math.max(0, subtotal - couponDiscount) + shippingCost;
  // O desconto Pix incide apenas sobre os produtos (nunca sobre o frete),
  // exatamente como o servidor calcula em createPendingOrderCore.
  const totalPix =
    Math.round(
      (Math.max(0, subtotal - couponDiscount) * (1 - PIX_DISCOUNT_RATE) + shippingCost) * 100,
    ) / 100;
  const totalDue = method === "pix" && PIX_ENABLED ? totalPix : totalCard;

  const setField = <K extends keyof CustomerForm>(k: K, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "E-mail inválido.";
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) e.phone = "Telefone inválido.";
    if (!isValidCpf(form.cpf)) e.cpf = "CPF inválido.";
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

  const customerPayload = useCallback(
    () => ({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.replace(/\D/g, ""),
      cpf: form.cpf.replace(/\D/g, ""),
      cep: normalizeCep(form.cep),
      logradouro: form.logradouro.trim(),
      numero: form.numero.trim(),
      complemento: form.complemento.trim(),
      bairro: form.bairro.trim(),
      cidade: form.cidade.trim(),
      uf: form.uf.trim().toUpperCase(),
    }),
    [form],
  );

  const itemsPayload = useCallback(
    () => items.map((i) => ({ id: i.id, quantity: i.qty, size: i.size as "P" | "M" | "G" | "GG" })),
    [items],
  );

  // Reaproveita o mesmo pedido pendente em novas tentativas com o mesmo carrinho,
  // evitando pedidos duplicados (e recobrança do cupom) a cada cartão recusado.
  const ensurePendingOrder = useCallback(
    async (payMethod: PayMethod) => {
      const itemsData = itemsPayload();
      const customer = customerPayload();
      const signature = JSON.stringify([payMethod, itemsData, customer, coupon?.code ?? null]);
      const cached = pendingRef.current;
      if (cached && cached.signature === signature) return { orderNumber: cached.orderNumber };
      const created = await startOrder({
        data: {
          items: itemsData,
          couponCode: coupon?.code ?? null,
          method: payMethod,
          customer,
        },
      });
      if ("error" in created) return created;
      pendingRef.current = { signature, orderNumber: created.orderNumber };
      return created;
    },
    [itemsPayload, customerPayload, coupon, startOrder],
  );

  // Cartão: cria pedido pendente e envia o token gerado pelo Brick.
  const onCardSubmit = async (card: CardFormData) => {
    setError(null);
    setSubmitting(true);
    try {
      const pending = await ensurePendingOrder("card");
      if ("error" in pending) {
        setError(pending.error);
        return;
      }

      const res = await payCard({
        data: {
          orderNumber: pending.orderNumber,
          token: card.token,
          paymentMethodId: card.paymentMethodId,
          issuerId: card.issuerId,
          installments: card.installments,
          payerEmail: card.payerEmail,
          cpf: form.cpf.replace(/\D/g, ""),
        },
      });
      if (res.approved) {
        clear();
        navigate({ to: "/sucesso", search: { order: res.orderNumber } });
        return;
      }
      if (res.status === "Aguardando Pagamento" && res.message?.includes("análise")) {
        clear();
        navigate({ to: "/sucesso", search: { order: res.orderNumber } });
        return;
      }
      setError(res.message ?? "Pagamento não aprovado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao processar o pagamento.");
    } finally {
      setSubmitting(false);
    }
  };

  // Pix: cria pedido pendente e gera o QR Code.
  const onPixSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const pending = await ensurePendingOrder("pix");

      if ("error" in pending) {
        setError(pending.error);
        return;
      }
      const charge = await startPix({
        data: { orderNumber: pending.orderNumber, cpf: form.cpf.replace(/\D/g, "") },
      });
      if ("error" in charge) {
        setError(charge.error);
        return;
      }
      setPix(charge);
      clear();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar cobrança Pix.");
    } finally {
      setSubmitting(false);
    }
  };

  // Polling enquanto o cliente paga o Pix (webhook é a fonte oficial).
  useEffect(() => {
    if (!pix) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const res = await checkStatus({ data: { orderNumber: pix.orderNumber } });
        if (cancelled) return;
        if (res.paid) {
          navigate({ to: "/sucesso", search: { order: pix.orderNumber } });
          return;
        }
      } catch {
        /* silencioso */
      }
      if (!cancelled && attempts < 120) window.setTimeout(tick, 5000);
    };
    const id = window.setTimeout(tick, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [pix, checkStatus, navigate]);

  if (loading || !hydrated) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" strokeWidth={1.5} />
      </main>
    );
  }

  if (!user) {
    return (
      <CheckoutNotice
        title="Entre para finalizar"
        text="Faça login ou crie sua conta para concluir o pedido com segurança."
        action={
          <button
            onClick={() => openAuth()}
            className="border border-charcoal bg-charcoal px-8 py-3 text-[11px] uppercase tracking-luxe text-background"
          >
            Entrar
          </button>
        }
      />
    );
  }

  if (items.length === 0 && !pix) {
    return (
      <CheckoutNotice
        title="Sua sacola está vazia"
        text="Explore a coleção e adicione peças para finalizar a compra."
        action={
          <Link
            to="/"
            className="border border-charcoal bg-charcoal px-8 py-3 text-[11px] uppercase tracking-luxe text-background"
          >
            Ver coleção
          </Link>
        }
      />
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

        {pix ? (
          <div className="mx-auto max-w-xl">
            <PixPanel charge={pix} awaiting />
            <Link
              to="/pedidos/$id"
              params={{ id: pix.orderNumber }}
              className="mt-6 inline-block border border-border px-6 py-3 text-[11px] uppercase tracking-luxe text-charcoal"
            >
              Acompanhar pedido
            </Link>
          </div>
        ) : (
          <>
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
                    method={method}
                    setMethod={setMethod}
                    onEdit={() => setStep(1)}
                    submitting={submitting}
                    totalCard={totalCard}
                    totalPix={totalPix}
                    onCardSubmit={onCardSubmit}
                    onPixSubmit={onPixSubmit}
                  />
                )}
                {error && (
                  <p className="mt-6 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                  </p>
                )}
              </section>

              <aside className="h-fit border border-border bg-card/40 p-8 md:sticky md:top-28">
                <h2 className="border-b border-border pb-4 text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
                  Resumo · {count} {count === 1 ? "peça" : "peças"}
                </h2>
                <ul className="mt-2 divide-y divide-border">
                  {items.map((i) => (
                    <li key={`${i.id}-${i.size}`} className="flex gap-4 py-5">
                      <img src={i.image} alt={i.name} className="h-20 w-14 flex-none object-cover" />
                      <div className="flex-1 text-sm">
                        <p className="font-serif text-base leading-snug">{i.name}</p>
                        <p className="mt-1 text-[11px] font-light tracking-wide text-muted-foreground">
                          Tam. {i.size} · {i.qty}×
                        </p>
                      </div>
                      <span className="text-sm font-light tabular-nums">
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
                    <dd className="font-serif text-2xl tabular-nums">{formatBRL(totalDue)}</dd>
                  </div>
                  {PIX_ENABLED && method === "card" && (
                    <p className="pt-1 text-[11px] text-accent">
                      ou <span className="font-medium">{formatBRL(totalPix)}</span> no Pix (5% de
                      desconto)
                    </p>
                  )}
                </dl>
                <p className="mt-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Pagamento processado com segurança pelo Mercado Pago
                </p>
              </aside>
            </div>
            <ContactStrip />
          </>
        )}
      </div>
    </main>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <ol className="flex items-center justify-center gap-6 text-[11px] uppercase tracking-luxe">
      <li className={step === 1 ? "text-charcoal" : "text-accent"}>
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center border border-current tabular-nums">
          1
        </span>
        Dados & Entrega
      </li>
      <span className="h-px w-10 bg-border" />
      <li className={step === 2 ? "text-charcoal" : "text-muted-foreground"}>
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center border border-current tabular-nums">
          2
        </span>
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
        <Field label="CPF" error={errors.cpf}>
          <input
            className={inputCls}
            value={form.cpf}
            onChange={(e) => setField("cpf", formatCpf(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength={14}
          />
        </Field>
      </div>

      <div>
        <h2 className="font-serif text-xl text-charcoal">Endereço de entrega</h2>
      </div>

      <div className="grid gap-5 sm:grid-cols-6">
        <Field
          label={cepLoading ? "CEP · buscando…" : "CEP"}
          error={errors.cep}
          className="sm:col-span-2"
        >
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
  method,
  setMethod,
  onEdit,
  submitting,
  totalCard,
  totalPix,
  onCardSubmit,
  onPixSubmit,
}: {
  form: CustomerForm;
  method: PayMethod;
  setMethod: (m: PayMethod) => void;
  onEdit: () => void;
  submitting: boolean;
  totalCard: number;
  totalPix: number;
  onCardSubmit: (card: CardFormData) => Promise<void>;
  onPixSubmit: () => void;
}) {
  const addressLine = `${form.logradouro}, ${form.numero}${form.complemento ? " — " + form.complemento : ""}`;
  const cityLine = `${form.bairro} · ${form.cidade}/${form.uf} · CEP ${formatCep(form.cep)}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl text-charcoal">Pagamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todo o pagamento acontece aqui mesmo, sem sair do site.
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

      {PIX_ENABLED && (
        <div className="grid gap-3 sm:grid-cols-2">
          <MethodTile
            active={method === "card"}
            onClick={() => setMethod("card")}
            icon={<CreditCard className="h-4 w-4" strokeWidth={1.5} />}
            title="Cartão de crédito"
            subtitle={`até 12× · ${formatBRL(totalCard)}`}
          />
          <MethodTile
            active={method === "pix"}
            onClick={() => setMethod("pix")}
            icon={<QrCode className="h-4 w-4" strokeWidth={1.5} />}
            title="Pix"
            subtitle={`5% de desconto · ${formatBRL(totalPix)}`}
          />
        </div>
      )}

      {method === "card" ? (
        <section className="border border-border p-6">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Dados do cartão
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Os dados do seu cartão são enviados criptografados diretamente ao Mercado Pago.
          </p>
          <div className="mt-6">
            <CardBrick amount={totalCard} email={form.email} onSubmitCard={onCardSubmit} />
          </div>
          {submitting && (
            <p className="mt-4 inline-flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={1.5} />
              Processando pagamento…
            </p>
          )}
        </section>
      ) : (
        <section className="border border-border p-6">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Pix · 5% de desconto
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Geramos o QR Code na próxima tela, aqui mesmo no site. A confirmação é automática.
          </p>
          <p className="mt-4 font-serif text-2xl tabular-nums text-charcoal">
            {formatBRL(totalPix)}
          </p>
          <button
            onClick={onPixSubmit}
            disabled={submitting}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-charcoal px-8 py-4 text-[11px] uppercase tracking-luxe text-ivory transition-colors hover:bg-navy disabled:opacity-60 sm:w-auto"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Gerando QR Code…" : "Gerar QR Code Pix"}
          </button>
        </section>
      )}
    </div>
  );
}

function MethodTile({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 border px-4 py-4 text-left transition-colors ${
        active
          ? "border-[color:var(--gold)] bg-[color:var(--gold)]/5"
          : "border-border hover:border-foreground/40"
      }`}
    >
      <span className={active ? "text-accent" : "text-muted-foreground"}>{icon}</span>
      <span>
        <span className="block text-[11px] uppercase tracking-luxe text-charcoal">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}


function CheckoutNotice({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="text-[11px] uppercase tracking-luxe text-muted-foreground">A&S Conccept</p>
        <h1 className="mt-4 font-serif text-3xl text-charcoal">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{text}</p>
        <div className="mt-8 flex justify-center">{action}</div>
      </div>
    </main>
  );
}
