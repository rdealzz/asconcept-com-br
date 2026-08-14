import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  ChevronLeft,
  CreditCard,
  Loader2,
  Lock,
  MessageCircle,
  Package,
  QrCode,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useCart, formatBRL, PIX_DISCOUNT_RATE, PIX_ENABLED } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import {
  createPendingOrder,
  createPixPayment,
  getPaymentStatus,
  payWithCardToken,
} from "@/lib/payments.functions";
import { formatCpf, isValidCpf, PIX_EXPIRATION_MINUTES } from "@/lib/mercadopago";
import { CardForm, type CardBrandInfo, type CardFormData } from "@/components/CardForm";
import { InstallmentsBadge, InstallmentsTable } from "@/components/InstallmentsNote";
import { PixPanel, type PixCharge } from "@/components/PixPanel";
import { quoteShipping, formatCep, normalizeCep } from "@/lib/shipping";
import { ContactStrip } from "@/components/ContactStrip";
import { Wordmark } from "@/components/Wordmark";
import {
  AbasPagamento,
  CampoFlutuante,
  CartaoEscolha,
  CartaoMockup,
  PainelPagamento,
  PainelVidro,
  PassoCheckout,
  SeloCompraSegura,
  SelosConfianca,
} from "@/components/checkout-ui";

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
/** 1 Identificação · 2 Entrega · 3 Frete · 4 Pagamento */
type Passo = 1 | 2 | 3 | 4;

function formatPhoneBR(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const telefoneValido = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 11;
};

function CheckoutPage() {
  const { items, coupon, couponDiscount, subtotal, count, clear, hydrated } = useCart();
  const { user, loading, openAuth, entrarComoConvidado } = useAuth();
  const navigate = useNavigate();
  const startOrder = useServerFn(createPendingOrder);
  const payCard = useServerFn(payWithCardToken);
  const startPix = useServerFn(createPixPayment);
  const checkStatus = useServerFn(getPaymentStatus);

  const [step, setStep] = useState<Passo>(1);
  const [maxStep, setMaxStep] = useState<Passo>(1);
  const [method, setMethod] = useState<PayMethod>("card");
  const [form, setForm] = useState<CustomerForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerForm, string>>>({});
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixCharge | null>(null);
  // Nome impresso no cartão e bandeira ficam aqui em cima só para o mockup
  // ao lado do formulário poder espelhá-los.
  const [cardHolder, setCardHolder] = useState("");
  const [cardBrand, setCardBrand] = useState<CardBrandInfo | null>(null);
  const [entrandoConvidado, setEntrandoConvidado] = useState(false);
  const [erroConvidado, setErroConvidado] = useState<string | null>(null);
  const prefilledRef = useRef(false);
  const pendingRef = useRef<{ signature: string; orderNumber: string } | null>(null);

  const seguirComoConvidado = async () => {
    setErroConvidado(null);
    setEntrandoConvidado(true);
    const { error } = await entrarComoConvidado();
    setEntrandoConvidado(false);
    if (error) setErroConvidado(error);
  };

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

  // Chegando ao pagamento, o nome do titular já vem sugerido pela identificação
  // — quase sempre é o mesmo, e ainda dá para corrigir.
  useEffect(() => {
    if (step !== 4) return;
    setCardHolder((atual) => atual || form.name.trim().toUpperCase());
  }, [step, form.name]);

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

  /* ── validação por passo ────────────────────────────────────────── */

  const validarIdentificacao = (): boolean => {
    const e: Partial<Record<keyof CustomerForm, string>> = {};
    if (form.name.trim().length < 3) e.name = "Informe seu nome completo.";
    if (!emailValido(form.email)) e.email = "Confira o e-mail informado.";
    if (!telefoneValido(form.phone)) e.phone = "Confira o telefone com DDD.";
    if (!isValidCpf(form.cpf)) e.cpf = "Confira o CPF informado.";
    setErrors((prev) => ({
      ...prev,
      ...e,
      name: e.name,
      email: e.email,
      phone: e.phone,
      cpf: e.cpf,
    }));
    return Object.values(e).every((v) => !v);
  };

  const validarEndereco = (): boolean => {
    const e: Partial<Record<keyof CustomerForm, string>> = {};
    if (normalizeCep(form.cep).length !== 8) e.cep = "CEP incompleto.";
    if (!form.logradouro.trim()) e.logradouro = "Informe o endereço.";
    if (!form.numero.trim()) e.numero = "Informe o número.";
    if (!form.bairro.trim()) e.bairro = "Informe o bairro.";
    if (!form.cidade.trim()) e.cidade = "Informe a cidade.";
    if (!/^[A-Z]{2}$/.test(form.uf.trim().toUpperCase())) e.uf = "UF.";
    setErrors((prev) => ({
      ...prev,
      cep: e.cep,
      logradouro: e.logradouro,
      numero: e.numero,
      bairro: e.bairro,
      cidade: e.cidade,
      uf: e.uf,
    }));
    return Object.values(e).every((v) => !v);
  };

  const irPara = (p: Passo) => {
    setStep(p);
    setMaxStep((m) => (p > m ? p : m));
  };

  const avancar = () => {
    setError(null);
    if (step === 1) {
      if (!validarIdentificacao()) return;
      irPara(2);
      return;
    }
    if (step === 2) {
      if (!validarEndereco()) return;
      if (!shippingQuote) {
        setError("Não conseguimos calcular o frete para esse CEP.");
        return;
      }
      irPara(3);
      return;
    }
    if (step === 3) {
      irPara(4);
    }
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
    () => items.map((i) => ({ id: i.id, quantity: i.qty, size: i.size })),
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
      <main className="flex min-h-[70vh] items-center justify-center bg-asc-bg-dark">
        <Loader2 className="h-6 w-6 animate-spin text-asc-gold" strokeWidth={1.5} />
      </main>
    );
  }

  // Sem sessão nenhuma: a compra segue sem cadastro, e entrar vira a opção
  // secundária — para quem já é cliente e quer o endereço preenchido.
  if (!user) {
    return (
      <CheckoutNotice
        title="Finalize sua compra"
        text="Siga sem cadastro: pedimos apenas o e-mail e o endereço de entrega. Sua conta é criada no fim, para você acompanhar o pedido."
        action={
          <div className="flex w-full flex-col items-center gap-4">
            <button
              onClick={() => void seguirComoConvidado()}
              disabled={entrandoConvidado}
              className="asc-btn-gold w-full max-w-xs px-8 py-3.5 disabled:opacity-60"
            >
              {entrandoConvidado ? "Um instante..." : "Continuar sem cadastro"}
            </button>
            <button
              onClick={() => openAuth()}
              className="text-[11px] tracking-luxe uppercase text-asc-ink-inverse-muted underline underline-offset-4 transition-colors hover:text-asc-gold"
            >
              Já tenho conta — entrar
            </button>
            {erroConvidado && (
              <p role="alert" className="max-w-xs text-xs text-asc-error">
                {erroConvidado}
              </p>
            )}
          </div>
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
          <Link to="/" className="asc-btn-gold px-8 py-3.5">
            Ver coleção
          </Link>
        }
      />
    );
  }

  const resumoIdentificacao = form.name ? `${form.name} · ${form.email}` : "Quem receberá a peça";
  const resumoEndereco = form.logradouro
    ? `${form.logradouro}, ${form.numero} — ${form.cidade}/${form.uf}`
    : "Para onde enviamos";
  const resumoFrete = shippingQuote
    ? shippingQuote.free
      ? "Frete cortesia · envio assegurado"
      : `${formatBRL(shippingCost)} · ${shippingQuote.etaDays[0]}–${shippingQuote.etaDays[1]} dias úteis`
    : "Calculado pelo CEP";

  return (
    <main className="asc-on-dark relative min-h-screen bg-asc-bg-dark px-4 py-8 text-asc-ink sm:px-6 sm:py-12">
      {/* Halo dourado ao fundo: dá profundidade sem competir com o conteúdo. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(90rem 60rem at 50% -20%, rgba(197,160,89,0.08) 0%, transparent 60%)",
        }}
      />

      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[10px] tracking-luxe uppercase text-asc-ink-inverse-muted transition-colors duration-ascfast ease-asc hover:text-asc-gold"
          >
            <ChevronLeft className="h-3.5 w-3.5" />{" "}
            <span className="hidden sm:inline">Continuar comprando</span>
          </Link>
          <Wordmark className="asc-heading-tracked text-center text-sm text-asc-gold hover:text-asc-gold-soft sm:text-base" />
          <span className="inline-flex items-center gap-1.5 text-[10px] tracking-luxe uppercase text-asc-ink-inverse-muted">
            <Lock className="h-3 w-3" strokeWidth={1.5} />
            <span className="hidden sm:inline">Compra segura</span>
          </span>
        </header>

        {pix ? (
          <div className="mx-auto max-w-xl animate-in fade-in slide-in-from-bottom-3 duration-500">
            <PixPanel charge={pix} awaiting />
            <Link
              to="/pedidos/$id"
              params={{ id: pix.orderNumber }}
              className="mt-6 inline-block rounded-full border border-asc-line px-6 py-3 text-[10px] tracking-luxe uppercase text-asc-ink transition-colors duration-asc ease-asc hover:border-asc-gold hover:text-asc-gold"
            >
              Acompanhar pedido
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
              {/* ── Coluna esquerda: os passos ─────────────────────── */}
              <section className="space-y-4">
                <PassoCheckout
                  numero={1}
                  titulo="Identificação"
                  resumo={resumoIdentificacao}
                  aberto={step === 1}
                  concluido={maxStep > 1}
                  onEditar={() => setStep(1)}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoFlutuante
                      label="Nome completo"
                      value={form.name}
                      onChange={(e) => setField("name", e.target.value)}
                      erro={errors.name}
                      valido={form.name.trim().length >= 3}
                      autoComplete="name"
                      containerClassName="sm:col-span-2"
                    />
                    <CampoFlutuante
                      label="E-mail"
                      type="email"
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                      erro={errors.email}
                      valido={emailValido(form.email)}
                      autoComplete="email"
                    />
                    <CampoFlutuante
                      label="Celular / WhatsApp"
                      value={form.phone}
                      onChange={(e) => setField("phone", formatPhoneBR(e.target.value))}
                      erro={errors.phone}
                      valido={telefoneValido(form.phone)}
                      inputMode="numeric"
                      autoComplete="tel"
                    />
                    <CampoFlutuante
                      label="CPF"
                      value={form.cpf}
                      onChange={(e) => setField("cpf", formatCpf(e.target.value))}
                      erro={errors.cpf}
                      valido={isValidCpf(form.cpf)}
                      inputMode="numeric"
                      maxLength={14}
                      dica="Exigido pelo emissor para autorizar o pagamento."
                      containerClassName="sm:col-span-2"
                    />
                  </div>
                  <button
                    onClick={avancar}
                    className="asc-btn-gold mt-6 w-full py-4 sm:w-auto sm:px-10"
                  >
                    Continuar
                  </button>
                </PassoCheckout>

                <PassoCheckout
                  numero={2}
                  titulo="Endereço de entrega"
                  resumo={resumoEndereco}
                  aberto={step === 2}
                  concluido={maxStep > 2}
                  onEditar={() => setStep(2)}
                >
                  <div className="grid gap-4 sm:grid-cols-6">
                    <div className="relative sm:col-span-2">
                      <CampoFlutuante
                        label="CEP"
                        value={form.cep}
                        onChange={(e) => void onCepChange(e.target.value)}
                        erro={errors.cep}
                        valido={normalizeCep(form.cep).length === 8}
                        inputMode="numeric"
                        maxLength={9}
                        autoComplete="postal-code"
                      />
                      {cepLoading && (
                        <Loader2
                          className="absolute right-4 top-5 h-4 w-4 animate-spin text-asc-gold"
                          strokeWidth={1.5}
                        />
                      )}
                    </div>
                    <CampoFlutuante
                      label="Endereço"
                      value={form.logradouro}
                      onChange={(e) => setField("logradouro", e.target.value)}
                      erro={errors.logradouro}
                      valido={!!form.logradouro.trim()}
                      autoComplete="address-line1"
                      containerClassName="sm:col-span-4"
                    />
                    <CampoFlutuante
                      label="Número"
                      value={form.numero}
                      onChange={(e) => setField("numero", e.target.value)}
                      erro={errors.numero}
                      valido={!!form.numero.trim()}
                      containerClassName="sm:col-span-2"
                    />
                    <CampoFlutuante
                      label="Complemento (opcional)"
                      value={form.complemento}
                      onChange={(e) => setField("complemento", e.target.value)}
                      containerClassName="sm:col-span-4"
                    />
                    <CampoFlutuante
                      label="Bairro"
                      value={form.bairro}
                      onChange={(e) => setField("bairro", e.target.value)}
                      erro={errors.bairro}
                      valido={!!form.bairro.trim()}
                      containerClassName="sm:col-span-3"
                    />
                    <CampoFlutuante
                      label="Cidade"
                      value={form.cidade}
                      onChange={(e) => setField("cidade", e.target.value)}
                      erro={errors.cidade}
                      valido={!!form.cidade.trim()}
                      containerClassName="sm:col-span-2"
                    />
                    <CampoFlutuante
                      label="UF"
                      value={form.uf}
                      onChange={(e) => setField("uf", e.target.value.toUpperCase().slice(0, 2))}
                      erro={errors.uf}
                      valido={/^[A-Z]{2}$/.test(form.uf)}
                      maxLength={2}
                      className="uppercase"
                      containerClassName="sm:col-span-1"
                    />
                  </div>
                  <button
                    onClick={avancar}
                    className="asc-btn-gold mt-6 w-full py-4 sm:w-auto sm:px-10"
                  >
                    Continuar
                  </button>
                </PassoCheckout>

                <PassoCheckout
                  numero={3}
                  titulo="Envio"
                  resumo={resumoFrete}
                  aberto={step === 3}
                  concluido={maxStep > 3}
                  onEditar={() => setStep(3)}
                >
                  {shippingQuote ? (
                    <>
                      <CartaoEscolha
                        ativo
                        onClick={() => {}}
                        icone={<Truck className="h-4 w-4" strokeWidth={1.5} />}
                        titulo="Envio assegurado A&S"
                        destaque={shippingQuote.free ? "Cortesia" : undefined}
                        subtitulo={`Entrega em ${shippingQuote.etaDays[0]} a ${shippingQuote.etaDays[1]} dias úteis · ${shippingQuote.stateName}`}
                        valor={shippingQuote.free ? "Grátis" : formatBRL(shippingCost)}
                      />
                      <p className="mt-3 text-[11px] font-light leading-relaxed text-asc-ink-inverse-muted">
                        Peça embalada à mão, com rastreio informado por e-mail assim que sair do
                        ateliê.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-asc-ink-inverse-muted">
                      Volte ao passo anterior e informe um CEP válido para calcularmos o envio.
                    </p>
                  )}
                  <button
                    onClick={avancar}
                    className="asc-btn-gold mt-6 w-full py-4 sm:w-auto sm:px-10"
                  >
                    Ir para o pagamento
                  </button>
                </PassoCheckout>

                <PassoCheckout numero={4} titulo="Pagamento" aberto={step === 4} concluido={false}>
                  {PIX_ENABLED && (
                    <AbasPagamento
                      ativa={method}
                      onChange={(id) => setMethod(id as PayMethod)}
                      abas={[
                        {
                          id: "pix",
                          icone: <QrCode className="h-4 w-4" strokeWidth={1.5} />,
                          titulo: "Pix",
                          destaque: "5% off",
                          subtitulo: "Aprovação imediata",
                          valor: formatBRL(totalPix),
                        },
                        {
                          id: "card",
                          icone: <CreditCard className="h-4 w-4" strokeWidth={1.5} />,
                          titulo: "Cartão de crédito",
                          subtitulo: "Até 3× sem juros",
                          valor: formatBRL(totalCard),
                        },
                      ]}
                    />
                  )}

                  {method === "card" ? (
                    <PainelPagamento chave="card">
                      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
                        <div className="order-2 lg:order-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[10px] tracking-luxe uppercase text-asc-ink-inverse-muted">
                              Dados do cartão
                            </p>
                            <InstallmentsBadge amount={totalCard} />
                          </div>
                          <div className="mt-5">
                            <CardForm
                              amount={totalCard}
                              email={form.email}
                              cpf={form.cpf}
                              titular={cardHolder}
                              onTitularChange={setCardHolder}
                              onBandeiraChange={setCardBrand}
                              submitting={submitting}
                              onSubmitCard={onCardSubmit}
                            />
                          </div>
                        </div>
                        <div className="order-1 lg:order-2 lg:w-[19rem]">
                          <CartaoMockup nome={cardHolder || form.name} bandeira={cardBrand?.nome} />
                        </div>
                      </div>

                      <details className="mt-6 border-t border-asc-line pt-4">
                        <summary className="cursor-pointer list-none text-[10px] tracking-luxe uppercase text-asc-ink-inverse-muted transition-colors duration-ascfast ease-asc hover:text-asc-gold">
                          Condições de parcelamento
                        </summary>
                        <InstallmentsTable amount={totalCard} className="mt-3" />
                      </details>

                      {submitting && (
                        <p className="mt-4 inline-flex items-center gap-2 text-[11px] text-asc-ink-inverse-muted">
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin text-asc-gold"
                            strokeWidth={1.5}
                          />
                          Processando pagamento…
                        </p>
                      )}
                    </PainelPagamento>
                  ) : (
                    <PainelPagamento chave="pix">
                      <div className="rounded-xl border border-asc-gold/30 bg-asc-gold/[0.06] p-5">
                        <p className="flex items-center gap-2 text-[10px] tracking-luxe uppercase text-asc-gold">
                          <QrCode className="h-3.5 w-3.5" strokeWidth={1.5} /> Pix · 5% de desconto
                        </p>
                        <p className="mt-3 text-sm font-light leading-relaxed text-asc-ink-inverse-muted">
                          Geramos o QR Code aqui mesmo, sem sair do site. A confirmação é automática
                          assim que o banco liquida.
                        </p>
                        <p className="mt-4 font-serif text-3xl tabular-nums text-asc-ink">
                          {formatBRL(totalPix)}
                        </p>
                        <p className="mt-2 text-[11px] font-light text-asc-ink-inverse-muted">
                          O QR Code gerado vale por {PIX_EXPIRATION_MINUTES} minutos.
                        </p>
                      </div>
                      <button
                        onClick={onPixSubmit}
                        disabled={submitting}
                        className="asc-btn-gold mt-6 w-full py-4 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {submitting ? "Gerando QR Code…" : "Gerar QR Code Pix"}
                      </button>

                      <SeloCompraSegura className="mt-6" />
                    </PainelPagamento>
                  )}
                </PassoCheckout>

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-asc-error/40 bg-asc-error/10 px-4 py-3 text-sm text-asc-error animate-in fade-in slide-in-from-top-1 duration-300"
                  >
                    {error}
                  </p>
                )}
              </section>

              {/* ── Coluna direita: resumo fixo ────────────────────── */}
              <aside className="lg:sticky lg:top-8">
                <PainelVidro className="overflow-hidden">
                  <div className="flex items-baseline justify-between border-b border-asc-line px-6 py-5">
                    <h2 className="font-serif text-lg tracking-[0.06em] text-asc-ink">
                      Seu pedido
                    </h2>
                    <span className="text-[10px] tracking-luxe uppercase text-asc-ink-inverse-muted">
                      {count} {count === 1 ? "peça" : "peças"}
                    </span>
                  </div>

                  <ul className="max-h-[19rem] divide-y divide-asc-line overflow-y-auto px-6">
                    {items.map((i) => (
                      <li key={`${i.id}-${i.size}`} className="flex gap-4 py-5">
                        <img
                          src={i.image}
                          alt={i.name}
                          loading="lazy"
                          decoding="async"
                          className="h-20 w-14 flex-none rounded-md border border-asc-line object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-serif text-[15px] leading-snug text-asc-ink">
                            {i.name}
                          </p>
                          <p className="mt-1 text-[11px] font-light tracking-wide text-asc-ink-inverse-muted">
                            Tam. {i.size} · {i.qty}×{i.colorLabel ? ` · ${i.colorLabel}` : ""}
                          </p>
                        </div>
                        <span className="text-sm font-light tabular-nums text-asc-ink">
                          {formatBRL(i.price * i.qty)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <dl className="space-y-2 border-t border-asc-line px-6 py-5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-asc-ink-inverse-muted">Subtotal</dt>
                      <dd className="tabular-nums text-asc-ink">{formatBRL(subtotal)}</dd>
                    </div>
                    {couponDiscount > 0 && (
                      <div className="flex justify-between text-asc-gold">
                        <dt>Cupom {coupon?.code}</dt>
                        <dd className="tabular-nums">− {formatBRL(couponDiscount)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-asc-ink-inverse-muted">Frete</dt>
                      <dd className="tabular-nums text-asc-ink">
                        {shippingQuote
                          ? shippingQuote.free
                            ? "Grátis"
                            : formatBRL(shippingCost)
                          : "—"}
                      </dd>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between border-t border-asc-line pt-4">
                      <dt className="text-[10px] tracking-luxe uppercase text-asc-ink-inverse-muted">
                        Total
                      </dt>
                      <dd className="font-serif text-3xl tabular-nums text-asc-ink">
                        {formatBRL(totalDue)}
                      </dd>
                    </div>
                    {PIX_ENABLED && method === "card" && (
                      <p className="pt-1 text-right text-[11px] text-asc-gold">
                        ou <span className="font-medium">{formatBRL(totalPix)}</span> no Pix
                      </p>
                    )}
                  </dl>

                  <div className="border-t border-asc-line px-6 py-5">
                    <SelosConfianca
                      itens={[
                        {
                          icone: <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />,
                          texto: "Pagamento criptografado pelo Mercado Pago",
                        },
                        {
                          icone: <BadgeCheck className="h-4 w-4" strokeWidth={1.5} />,
                          texto: "Autenticidade garantida — peça numerada do ateliê",
                        },
                        {
                          icone: <Package className="h-4 w-4" strokeWidth={1.5} />,
                          texto: "Envio assegurado com rastreio",
                        },
                        {
                          icone: <MessageCircle className="h-4 w-4" strokeWidth={1.5} />,
                          texto: "Atendimento exclusivo por WhatsApp",
                        },
                      ]}
                    />
                  </div>
                </PainelVidro>
              </aside>
            </div>

            <ContactStrip />
          </>
        )}
      </div>
    </main>
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
    <main className="asc-on-dark flex min-h-[70vh] items-center justify-center bg-asc-bg-dark px-6 text-asc-ink">
      <div className="max-w-md text-center">
        <Wordmark className="asc-heading-tracked text-[11px] text-asc-gold hover:text-asc-gold-soft" />
        <h1 className="mt-4 font-serif text-3xl text-asc-ink">{title}</h1>
        <p className="mt-3 text-sm font-light text-asc-ink-inverse-muted">{text}</p>
        <div className="mt-8 flex justify-center">{action}</div>
      </div>
    </main>
  );
}
