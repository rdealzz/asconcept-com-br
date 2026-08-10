import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Lock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { getMpPublicKey } from "@/lib/payments.functions";
import { MAX_INSTALLMENTS, formatCpf, isValidCpf } from "@/lib/mercadopago";
import { formatBRL } from "@/lib/cart-context";
import { CampoFlutuante, CampoSeguro, SeloCompraSegura } from "@/components/checkout-ui";

export type CardFormData = {
  token: string;
  paymentMethodId: string;
  issuerId: string | null;
  installments: number;
  payerEmail: string;
};

export type CardBrandInfo = { id: string; nome: string };

type SdkModule = typeof import("@mercadopago/sdk-react");

type Bandeira = {
  id: string;
  nome: string;
  issuerId: string | null;
  cvvMode: string;
  cvvLength: number;
  numeroLength: number;
};

type Parcela = {
  numero: number;
  valorParcela: number;
  valorTotal: number;
  semJuros: boolean;
};

type NomeCampo = "cardNumber" | "expirationDate" | "securityCode";

/** Instâncias que o SDK do Mercado Pago pendura no `window` ao montar cada campo. */
type CampoSeguroInstancia = {
  update?: (props: { settings?: Record<string, unknown> }) => void;
};
type JanelaMp = Window & {
  cardNumberInstance?: CampoSeguroInstancia;
  securityCodeInstance?: CampoSeguroInstancia;
};

/**
 * Estilo aplicado DENTRO do iframe do Mercado Pago.
 *
 * Precisa ser uma constante de módulo: o SDK usa a identidade do objeto como
 * dependência do efeito que monta o campo, então um literal novo a cada render
 * desmontaria e remontaria o input a cada tecla digitada.
 */
const ESTILO_CAMPO = {
  color: "#e8dcc4",
  "font-size": "14px",
  "font-family": "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  "font-weight": "400",
  "placeholder-color": "rgba(232,220,196,0.32)",
  height: "100%",
  width: "100%",
  padding: "0px",
};

/** Mensagens do Mercado Pago traduzidas para a linguagem da loja. */
const ERROS_MP: Record<string, string> = {
  "205": "Digite o número do cartão.",
  "208": "Informe o mês de validade.",
  "209": "Informe o ano de validade.",
  "212": "Informe o CPF do titular.",
  "213": "Informe o CPF do titular.",
  "214": "Informe o CPF do titular.",
  "220": "Não identificamos o banco emissor deste cartão.",
  "221": "Informe o nome impresso no cartão.",
  "224": "Digite o código de segurança (CVV).",
  E301: "Número de cartão inválido. Confira os dígitos.",
  E302: "Código de segurança inválido.",
  "316": "Nome do titular inválido.",
  "322": "CPF inválido.",
  "324": "CPF inválido.",
  "325": "Mês de validade inválido.",
  "326": "Ano de validade inválido.",
};

function mensagemDeErro(e: unknown): string {
  const lista = Array.isArray(e) ? e : ((e as { cause?: unknown })?.cause ?? null);
  const causas = Array.isArray(lista) ? lista : [];
  for (const c of causas) {
    const codigo = String((c as { code?: string | number })?.code ?? "");
    if (ERROS_MP[codigo]) return ERROS_MP[codigo];
  }
  if (e instanceof Error && e.message) return e.message;
  return "Não foi possível validar os dados do cartão. Confira as informações e tente de novo.";
}

/**
 * Formulário de cartão de crédito.
 *
 * Número, validade e CVV são campos seguros (iframes) hospedados pelo Mercado
 * Pago: eles nunca tocam o nosso JavaScript nem os nossos servidores — o que
 * recebemos de volta é apenas um token de uso único. Nome do titular e número
 * de parcelas são nossos, para que o visual e as condições fiquem sob controle
 * da loja.
 */
export function CardForm({
  amount,
  email,
  cpf,
  onCpfChange,
  titular,
  onTitularChange,
  onBandeiraChange,
  submitting,
  onSubmitCard,
}: {
  amount: number;
  email: string;
  /** CPF do comprador (só dígitos) — o emissor exige para autorizar. */
  cpf: string;
  /** Quando informado, o CPF vira editável aqui (titular diferente do comprador). */
  onCpfChange?: (v: string) => void;
  titular: string;
  onTitularChange: (v: string) => void;
  onBandeiraChange?: (b: CardBrandInfo | null) => void;
  submitting: boolean;
  onSubmitCard: (data: CardFormData) => Promise<void>;
}) {
  const buscarChave = useServerFn(getMpPublicKey);

  const [sdk, setSdk] = useState<SdkModule | null>(null);
  const [erroInit, setErroInit] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const [bin, setBin] = useState<string | null>(null);
  const [bandeira, setBandeira] = useState<Bandeira | null>(null);
  const [buscandoBandeira, setBuscandoBandeira] = useState(false);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [parcelaEscolhida, setParcelaEscolhida] = useState(1);

  const [prontos, setProntos] = useState<Record<NomeCampo, boolean>>({
    cardNumber: false,
    expirationDate: false,
    securityCode: false,
  });
  const [validos, setValidos] = useState<Record<NomeCampo, boolean>>({
    cardNumber: false,
    expirationDate: false,
    securityCode: false,
  });
  const [focado, setFocado] = useState<NomeCampo | null>(null);
  const [erros, setErros] = useState<Partial<Record<NomeCampo | "titular", string>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [tokenizando, setTokenizando] = useState(false);
  const [camposTravados, setCamposTravados] = useState(false);

  /* ── carrega o SDK ───────────────────────────────────────────────── */

  useEffect(() => {
    let cancelado = false;
    setErroInit(null);
    setSdk(null);
    setProntos({ cardNumber: false, expirationDate: false, securityCode: false });
    setValidos({ cardNumber: false, expirationDate: false, securityCode: false });
    setBin(null);
    (async () => {
      try {
        const { publicKey } = await buscarChave();
        if (cancelado) return;
        if (!publicKey) {
          setErroInit(
            "Pagamento por cartão indisponível: chave pública do Mercado Pago não configurada.",
          );
          return;
        }
        const mod = await import("@mercadopago/sdk-react");
        if (cancelado) return;
        mod.initMercadoPago(publicKey, { locale: "pt-BR" });
        setSdk(mod);
      } catch (e) {
        console.error("[mp] falha ao carregar o SDK", e);
        if (!cancelado) setErroInit("Não foi possível carregar o formulário de cartão.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [buscarChave, tentativa]);

  // Se um dos iframes não avisar que montou, o cliente fica olhando para uma
  // moldura vazia sem entender por quê — foi exatamente assim que o formulário
  // anterior falhava. Aqui a espera tem prazo e saída.
  const todosProntos = prontos.cardNumber && prontos.expirationDate && prontos.securityCode;
  useEffect(() => {
    if (!sdk || todosProntos) {
      setCamposTravados(false);
      return;
    }
    const id = window.setTimeout(() => setCamposTravados(true), 12000);
    return () => window.clearTimeout(id);
  }, [sdk, todosProntos]);

  /* ── eventos dos campos seguros ──────────────────────────────────── */
  // Todos os callbacks entregues ao SDK precisam de identidade estável: o
  // efeito interno que monta cada iframe os usa como dependência.

  const aoMudarBin = useCallback((arg: { bin?: string }) => {
    setBin(arg.bin && arg.bin.length >= 6 ? arg.bin : null);
  }, []);

  const marcarValidade = useCallback((campo: NomeCampo, mensagens: { message: string }[]) => {
    const ok = mensagens.length === 0;
    setValidos((v) => (v[campo] === ok ? v : { ...v, [campo]: ok }));
    if (ok) setErros((e) => (e[campo] ? { ...e, [campo]: undefined } : e));
  }, []);

  const validadeNumero = useCallback(
    (arg: { errorMessages: { message: string }[] }) =>
      marcarValidade("cardNumber", arg.errorMessages),
    [marcarValidade],
  );
  const validadeData = useCallback(
    (arg: { errorMessages: { message: string }[] }) =>
      marcarValidade("expirationDate", arg.errorMessages),
    [marcarValidade],
  );
  const validadeCvv = useCallback(
    (arg: { errorMessages: { message: string }[] }) =>
      marcarValidade("securityCode", arg.errorMessages),
    [marcarValidade],
  );

  const marcarPronto = useCallback((campo: NomeCampo) => {
    setProntos((p) => (p[campo] ? p : { ...p, [campo]: true }));
  }, []);
  const prontoNumero = useCallback(() => marcarPronto("cardNumber"), [marcarPronto]);
  const prontoData = useCallback(() => marcarPronto("expirationDate"), [marcarPronto]);
  const prontoCvv = useCallback(() => marcarPronto("securityCode"), [marcarPronto]);

  const focoNumero = useCallback(() => setFocado("cardNumber"), []);
  const focoData = useCallback(() => setFocado("expirationDate"), []);
  const focoCvv = useCallback(() => setFocado("securityCode"), []);
  const desfocar = useCallback(() => setFocado(null), []);

  const aoErrarCampo = useCallback((arg: { error: string; field?: string }) => {
    console.error("[mp] erro no campo seguro", arg);
  }, []);

  /* ── bandeira + parcelas a partir do BIN ─────────────────────────── */

  useEffect(() => {
    if (!sdk || !bin) {
      setBandeira(null);
      setParcelas([]);
      return;
    }
    let cancelado = false;
    setBuscandoBandeira(true);
    (async () => {
      try {
        const metodos = await sdk.getPaymentMethods({ bin });
        if (cancelado) return;
        const resultados = metodos?.results ?? [];
        const credito =
          resultados.find((r) => r.payment_type_id === "credit_card") ?? resultados[0];
        if (!credito) {
          setBandeira(null);
          setParcelas([]);
          setErros((e) => ({
            ...e,
            cardNumber: "Não reconhecemos essa bandeira. Confira o número.",
          }));
          return;
        }
        const ajustes = credito.settings?.[0];
        setBandeira({
          id: credito.id,
          nome: credito.name,
          issuerId: credito.issuer?.id != null ? String(credito.issuer.id) : null,
          cvvMode: ajustes?.security_code?.mode ?? "mandatory",
          cvvLength: ajustes?.security_code?.length ?? 3,
          numeroLength: ajustes?.card_number?.length ?? 16,
        });
        setErros((e) => (e.cardNumber ? { ...e, cardNumber: undefined } : e));

        const tabela = await sdk.getInstallments({
          amount: amount.toFixed(2),
          bin,
          locale: "pt-BR",
          paymentTypeId: "credit_card",
        });
        if (cancelado) return;
        const custos =
          tabela?.find((t) => t.payment_method_id === credito.id)?.payer_costs ??
          tabela?.[0]?.payer_costs ??
          [];
        const opcoes: Parcela[] = custos
          .filter((c) => c.installments >= 1 && c.installments <= MAX_INSTALLMENTS)
          .map((c) => ({
            numero: c.installments,
            valorParcela: Number(c.installment_amount),
            valorTotal: Number(c.total_amount),
            semJuros: Number(c.installment_rate) === 0,
          }))
          .sort((a, b) => a.numero - b.numero);
        setParcelas(opcoes);
        setParcelaEscolhida((atual) =>
          opcoes.some((o) => o.numero === atual) ? atual : (opcoes[0]?.numero ?? 1),
        );
      } catch (e) {
        console.error("[mp] falha ao consultar bandeira/parcelas", e);
        if (!cancelado) setParcelas([]);
      } finally {
        if (!cancelado) setBuscandoBandeira(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [sdk, bin, amount]);

  // Cada bandeira tem seu próprio comprimento de número e de CVV (Amex: 15 e 4).
  // Sem isso o campo aceitaria dígitos demais — ou de menos — silenciosamente.
  useEffect(() => {
    if (!bandeira) return;
    const janela = window as JanelaMp;
    janela.cardNumberInstance?.update?.({
      settings: { length: bandeira.numeroLength, validation: "standard" },
    });
    janela.securityCodeInstance?.update?.({
      settings: { mode: bandeira.cvvMode, length: bandeira.cvvLength },
    });
  }, [bandeira]);

  // O aviso à página (para o mockup do cartão) usa ref para não exigir que o
  // pai memoize o callback só por causa deste efeito.
  const avisarBandeira = useRef(onBandeiraChange);
  useEffect(() => {
    avisarBandeira.current = onBandeiraChange;
  }, [onBandeiraChange]);
  useEffect(() => {
    avisarBandeira.current?.(bandeira ? { id: bandeira.id, nome: bandeira.nome } : null);
  }, [bandeira]);

  /* ── envio ───────────────────────────────────────────────────────── */

  const parcelaAtual = useMemo(
    () => parcelas.find((p) => p.numero === parcelaEscolhida) ?? null,
    [parcelas, parcelaEscolhida],
  );

  const enviar = async () => {
    if (!sdk || tokenizando || submitting) return;
    setErro(null);

    const faltando: Partial<Record<NomeCampo | "titular", string>> = {};
    if (titular.trim().length < 3) faltando.titular = "Informe o nome impresso no cartão.";
    if (!validos.cardNumber) faltando.cardNumber = "Confira o número do cartão.";
    if (!validos.expirationDate) faltando.expirationDate = "Confira a validade.";
    if (!validos.securityCode) faltando.securityCode = "Confira o CVV.";
    if (Object.values(faltando).some(Boolean)) {
      setErros((e) => ({ ...e, ...faltando }));
      return;
    }
    if (!bandeira) {
      setErros((e) => ({ ...e, cardNumber: "Não reconhecemos essa bandeira. Confira o número." }));
      return;
    }

    setTokenizando(true);
    try {
      const token = await sdk.createCardToken({
        cardholderName: titular.trim(),
        identificationType: "CPF",
        identificationNumber: cpf.replace(/\D/g, ""),
      });
      if (!token?.id) throw new Error("Não foi possível validar os dados do cartão.");
      await onSubmitCard({
        token: token.id,
        paymentMethodId: bandeira.id,
        issuerId: bandeira.issuerId,
        installments: parcelaEscolhida,
        payerEmail: email,
      });
    } catch (e) {
      console.error("[mp] falha ao tokenizar", e);
      setErro(mensagemDeErro(e));
    } finally {
      setTokenizando(false);
    }
  };

  /* ── estados de carregamento e falha ─────────────────────────────── */

  if (erroInit) {
    return (
      <div className="rounded-xl border border-asc-error/40 bg-asc-error/10 px-4 py-4 text-sm text-asc-error">
        <p>{erroInit}</p>
        <button
          type="button"
          onClick={() => setTentativa((t) => t + 1)}
          className="mt-3 rounded-full border border-asc-error/50 px-5 py-2 text-[10px] tracking-luxe uppercase transition-colors duration-ascfast ease-asc hover:bg-asc-error/10"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const ocupado = tokenizando || submitting;

  return (
    <div className="space-y-4">
      {!sdk ? (
        <div className="flex items-center gap-3 px-1 py-8 text-sm text-asc-ink-inverse-muted">
          <Loader2 className="h-4 w-4 animate-spin text-asc-gold" strokeWidth={1.5} />
          Preparando ambiente seguro…
        </div>
      ) : (
        <>
          {camposTravados && (
            <p className="flex flex-wrap items-center gap-3 rounded-xl border border-asc-gold/40 bg-asc-gold/[0.07] px-4 py-3 text-[11px] font-light leading-relaxed text-asc-ink-inverse-muted">
              <span className="flex-1">
                Os campos protegidos do Mercado Pago estão demorando a abrir — costuma ser bloqueio
                de rede ou de extensão do navegador.
              </span>
              <button
                type="button"
                onClick={() => setTentativa((t) => t + 1)}
                className="rounded-full border border-asc-gold/50 px-4 py-1.5 text-[10px] tracking-luxe uppercase text-asc-gold transition-colors duration-ascfast ease-asc hover:bg-asc-gold/10"
              >
                Recarregar
              </button>
            </p>
          )}

          <CampoSeguro
            label="Número do cartão"
            erro={erros.cardNumber}
            valido={validos.cardNumber}
            focado={focado === "cardNumber"}
            carregando={!prontos.cardNumber}
            selo={
              bandeira ? (
                <span className="text-[9px] tracking-luxe uppercase text-asc-gold">
                  {bandeira.nome}
                </span>
              ) : buscandoBandeira ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-asc-gold" strokeWidth={1.5} />
              ) : null
            }
          >
            <sdk.CardNumber
              placeholder="0000 0000 0000 0000"
              style={ESTILO_CAMPO}
              onBinChange={aoMudarBin}
              onValidityChange={validadeNumero}
              onReady={prontoNumero}
              onFocus={focoNumero}
              onBlur={desfocar}
              onError={aoErrarCampo}
            />
          </CampoSeguro>

          {/* Validade e CVV pedem 5 e 4 caracteres — esticá-los pela largura da
              coluna, como estava, fazia dois campos enormes para um punhado de
              dígitos. Larguras fixas e proporcionais ao dado, alinhadas à
              esquerda: é o desenho dos gateways de referência. */}
          <div className="flex flex-wrap gap-3">
            <CampoSeguro
              className="w-[8.5rem] shrink-0"
              label="Validade"
              erro={erros.expirationDate}
              valido={validos.expirationDate}
              focado={focado === "expirationDate"}
              carregando={!prontos.expirationDate}
            >
              <sdk.ExpirationDate
                placeholder="MM/AA"
                mode="short"
                style={ESTILO_CAMPO}
                onValidityChange={validadeData}
                onReady={prontoData}
                onFocus={focoData}
                onBlur={desfocar}
                onError={aoErrarCampo}
              />
            </CampoSeguro>

            <CampoSeguro
              className="w-[7.5rem] shrink-0"
              label={`CVV${bandeira ? ` · ${bandeira.cvvLength}` : ""}`}
              erro={erros.securityCode}
              valido={validos.securityCode}
              focado={focado === "securityCode"}
              carregando={!prontos.securityCode}
            >
              <sdk.SecurityCode
                placeholder="CVV"
                style={ESTILO_CAMPO}
                onValidityChange={validadeCvv}
                onReady={prontoCvv}
                onFocus={focoCvv}
                onBlur={desfocar}
                onError={aoErrarCampo}
              />
            </CampoSeguro>
          </div>

          {/* Nome e CPF na mesma linha: o nome ocupa o espaço que sobra e o CPF
              fica na largura do dado. O CPF é o mesmo da identificação — o
              emissor exige o do titular, então ele aparece aqui para conferência
              em vez de ficar escondido dois passos acima. */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11.5rem]">
            <CampoFlutuante
              label="Nome impresso no cartão"
              value={titular}
              onChange={(e) => {
                onTitularChange(e.target.value.replace(/[^\p{L} .'-]/gu, "").toUpperCase());
                if (erros.titular) setErros((x) => ({ ...x, titular: undefined }));
              }}
              erro={erros.titular}
              valido={titular.trim().length >= 3}
              autoComplete="cc-name"
              maxLength={60}
              dica="Exatamente como está gravado no cartão."
            />
            <CampoFlutuante
              label="CPF do titular"
              value={cpf}
              readOnly={!onCpfChange}
              onChange={(e) => onCpfChange?.(formatCpf(e.target.value))}
              valido={isValidCpf(cpf)}
              erro={cpf.length > 0 && !isValidCpf(cpf) ? "Confira o CPF." : undefined}
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              dica={onCpfChange ? "Titular do cartão." : "Informado na identificação."}
              className={onCpfChange ? "" : "cursor-default opacity-80"}
            />
          </div>

          {/* ── parcelas ─────────────────────────────────────────── */}
          <div>
            <label
              htmlFor="asc-parcelas"
              className="mb-2 block text-[10px] tracking-luxe uppercase text-asc-ink-inverse-muted"
            >
              Parcelamento
            </label>
            <div className="relative">
              <select
                id="asc-parcelas"
                value={parcelaEscolhida}
                disabled={parcelas.length === 0}
                onChange={(e) => setParcelaEscolhida(Number(e.target.value))}
                className="w-full appearance-none rounded-xl border border-asc-line bg-asc-ink/[0.04] px-4 py-4 pr-11 text-sm text-asc-ink outline-none transition-all duration-asc ease-asc focus:border-asc-gold focus:bg-asc-ink/[0.07] focus:shadow-[0_0_0_3px_rgba(197,160,89,0.13)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {parcelas.length === 0 ? (
                  <option value={1}>
                    {buscandoBandeira
                      ? "Consultando condições…"
                      : "Digite o número do cartão para ver as parcelas"}
                  </option>
                ) : (
                  parcelas.map((p) => (
                    <option key={p.numero} value={p.numero}>
                      {p.numero}× de {formatBRL(p.valorParcela)}
                      {p.semJuros ? " sem juros" : ` · total ${formatBRL(p.valorTotal)}`}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-asc-gold"
                strokeWidth={1.5}
              />
            </div>
            {parcelaAtual && (
              <p className="mt-2 pl-1 text-[11px] font-light text-asc-ink-inverse-muted">
                {parcelaAtual.semJuros
                  ? `Sem juros — total de ${formatBRL(parcelaAtual.valorTotal)}.`
                  : `Com juros do emissor — total de ${formatBRL(parcelaAtual.valorTotal)}.`}
              </p>
            )}
          </div>

          {erro && (
            <p
              role="alert"
              className="rounded-xl border border-asc-error/40 bg-asc-error/10 px-4 py-3 text-sm text-asc-error animate-in fade-in slide-in-from-top-1 duration-200"
            >
              {erro}
            </p>
          )}

          <button
            type="button"
            onClick={enviar}
            disabled={ocupado}
            className="asc-btn-gold w-full py-4 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
            {ocupado
              ? "Processando…"
              : `Pagar ${formatBRL(parcelaAtual?.valorTotal ?? amount)} com segurança`}
          </button>

          <SeloCompraSegura />

          <p className="flex items-start gap-2 text-[10px] font-light leading-relaxed text-asc-ink-inverse-muted">
            <Lock className="mt-px h-3 w-3 shrink-0" strokeWidth={1.5} />
            Número, validade e CVV são digitados dentro do ambiente criptografado do Mercado Pago.
            Nenhum dado do cartão passa pelos nossos servidores.
          </p>
        </>
      )}
    </div>
  );
}
