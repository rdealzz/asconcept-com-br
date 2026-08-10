import { useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, ChevronDown, Lock, ShieldCheck } from "lucide-react";

/**
 * Peças visuais do checkout.
 *
 * Só aparência: nenhuma delas conhece carrinho, pedido, estoque ou gateway de
 * pagamento. Ficam num arquivo à parte para a rota do checkout tratar apenas do
 * fluxo — que é onde mora o risco.
 */

/* ─────────────────── painel de vidro ─────────────────── */

/** Superfície da marca: obsidiana, fio dourado de 1px e vidro fosco. */
export function PainelVidro({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-2xl border border-asc-line bg-asc-ink/[0.035] backdrop-blur-[12px] ${className}`}
    >
      {children}
    </div>
  );
}

/* ─────────────────── campo com rótulo flutuante ─────────────────── */

type CampoProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Mensagem de erro — discreta, em tom de marca, nunca em vermelho gritante. */
  erro?: string;
  /** Marca o campo como preenchido corretamente (checkzinho sutil). */
  valido?: boolean;
  dica?: string;
  containerClassName?: string;
};

/**
 * Rótulo que sobe quando o campo recebe conteúdo ou foco.
 *
 * O truque é o `placeholder=" "`: sem ele `:placeholder-shown` nunca é falso e
 * o rótulo não flutuaria. Por isso o placeholder real vira `dica`, exibida
 * abaixo do campo.
 */
export function CampoFlutuante({
  label,
  erro,
  valido,
  dica,
  className = "",
  containerClassName = "",
  id,
  ...props
}: CampoProps) {
  const gerado = useRef(`campo-${Math.random().toString(36).slice(2, 9)}`);
  const idFinal = id ?? gerado.current;

  return (
    <div className={containerClassName}>
      <div className="relative">
        <input
          {...props}
          id={idFinal}
          placeholder=" "
          aria-invalid={!!erro}
          aria-describedby={erro ? `${idFinal}-erro` : undefined}
          className={`peer w-full rounded-xl border bg-asc-ink/[0.04] px-4 pb-2.5 pt-6 text-sm text-asc-ink outline-none transition-all duration-asc ease-asc ${
            erro
              ? "border-asc-error/60 focus:border-asc-error"
              : "border-asc-line focus:border-asc-gold focus:bg-asc-ink/[0.07] focus:shadow-[0_0_0_3px_rgba(197,160,89,0.13)]"
          } ${className}`}
        />
        <label
          htmlFor={idFinal}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-asc-ink-muted transition-all duration-asc ease-asc peer-focus:top-2.5 peer-focus:translate-y-0 peer-focus:text-[9px] peer-focus:uppercase peer-focus:tracking-luxe peer-focus:text-asc-gold peer-[:not(:placeholder-shown)]:top-2.5 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[9px] peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-luxe"
        >
          {label}
        </label>
        {valido && !erro && (
          <Check
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-asc-gold opacity-70"
            strokeWidth={2}
          />
        )}
      </div>
      {erro ? (
        <p
          id={`${idFinal}-erro`}
          className="mt-1.5 pl-1 text-[11px] font-light text-asc-error/90 animate-in fade-in slide-in-from-top-1 duration-200"
        >
          {erro}
        </p>
      ) : dica ? (
        <p className="mt-1.5 pl-1 text-[11px] font-light text-asc-ink-inverse-muted/70">{dica}</p>
      ) : null}
    </div>
  );
}

/* ─────────────────── moldura dos campos seguros ─────────────────── */

/**
 * Moldura para os campos do Mercado Pago (número, validade, CVV).
 *
 * O input em si é um iframe hospedado por eles — não conseguimos estilizá-lo
 * por CSS daqui, nem detectar foco por `:focus-within`. Então a moldura é
 * nossa (borda, rótulo, checkzinho) e o estado de foco chega por evento do
 * SDK, via a prop `focado`. O rótulo fica sempre no alto, sem flutuar: o
 * iframe não expõe `:placeholder-shown`.
 */
export function CampoSeguro({
  label,
  erro,
  valido,
  focado,
  carregando,
  selo,
  children,
  className = "",
}: {
  label: string;
  erro?: string;
  valido?: boolean;
  focado?: boolean;
  /** Enquanto o iframe não avisa que montou, mostramos um esqueleto. */
  carregando?: boolean;
  /** Conteúdo à direita do rótulo — a bandeira detectada, por exemplo. */
  selo?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={`relative rounded-xl border bg-asc-ink/[0.04] px-4 pb-2.5 pt-6 transition-all duration-asc ease-asc ${
          erro
            ? "border-asc-error/60"
            : focado
              ? "border-asc-gold bg-asc-ink/[0.07] shadow-[0_0_0_3px_rgba(197,160,89,0.13)]"
              : "border-asc-line"
        }`}
      >
        <span className="pointer-events-none absolute left-4 right-4 top-2.5 flex items-center justify-between gap-2 text-[9px] tracking-luxe uppercase text-asc-gold">
          <span className="truncate">{label}</span>
          {selo}
        </span>
        {/* A altura vem da regra .asc-secure-field no styles.css — utilitário
            de altura aqui não vence aquela regra (ela mora fora das camadas). */}
        <div className="asc-secure-field pr-6">{children}</div>
        {carregando && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-2.5 left-4 right-10 h-6 animate-pulse rounded bg-asc-ink/10"
          />
        )}
        {valido && !erro && (
          <Check
            aria-hidden
            className="pointer-events-none absolute right-4 bottom-3 h-4 w-4 text-asc-gold opacity-70"
            strokeWidth={2}
          />
        )}
      </div>
      {erro && (
        <p className="mt-1.5 pl-1 text-[11px] font-light text-asc-error/90 animate-in fade-in slide-in-from-top-1 duration-200">
          {erro}
        </p>
      )}
    </div>
  );
}

/* ─────────────────── passo do checkout ─────────────────── */

/**
 * Um passo do checkout. Aberto, mostra o formulário; concluído, encolhe para
 * uma linha de resumo com "Editar". É o que mantém a coluna curta no celular.
 */
export function PassoCheckout({
  numero,
  titulo,
  resumo,
  aberto,
  concluido,
  onEditar,
  children,
}: {
  numero: number;
  titulo: string;
  resumo?: ReactNode;
  aberto: boolean;
  concluido: boolean;
  onEditar?: () => void;
  children: ReactNode;
}) {
  return (
    <PainelVidro className={aberto ? "border-asc-gold/40" : ""}>
      <div className="flex items-center gap-4 px-5 py-4 sm:px-7">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums transition-colors duration-asc ease-asc ${
            concluido
              ? "border-transparent bg-asc-gold text-asc-bg"
              : aberto
                ? "border-asc-gold text-asc-gold"
                : "border-asc-line text-asc-ink-muted"
          }`}
        >
          {concluido ? <Check className="h-4 w-4" strokeWidth={2.5} /> : numero}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className={`font-serif text-lg tracking-[0.06em] transition-colors duration-asc ease-asc ${
              aberto || concluido ? "text-asc-ink" : "text-asc-ink-muted"
            }`}
          >
            {titulo}
          </h2>
          {!aberto && resumo && (
            <div className="mt-0.5 truncate text-xs font-light text-asc-ink-inverse-muted">
              {resumo}
            </div>
          )}
        </div>
        {!aberto && concluido && onEditar && (
          <button
            type="button"
            onClick={onEditar}
            className="shrink-0 text-[10px] tracking-luxe uppercase text-asc-gold underline-offset-4 transition-colors duration-ascfast ease-asc hover:underline"
          >
            Editar
          </button>
        )}
        {!aberto && !concluido && (
          <ChevronDown className="h-4 w-4 shrink-0 text-asc-ink-muted/50" strokeWidth={1.5} />
        )}
      </div>

      {aberto && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <span aria-hidden className="mx-5 block h-px bg-asc-line sm:mx-7" />
          <div className="px-5 py-6 sm:px-7">{children}</div>
        </div>
      )}
    </PainelVidro>
  );
}

/* ─────────────────── cartão de escolha (frete / pagamento) ─────────────────── */

export function CartaoEscolha({
  ativo,
  onClick,
  icone,
  titulo,
  subtitulo,
  destaque,
  valor,
}: {
  ativo: boolean;
  onClick: () => void;
  icone?: ReactNode;
  titulo: string;
  subtitulo?: string;
  /** Selo discreto no canto — "Entrega VIP", "5% de desconto". */
  destaque?: string;
  valor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`group relative flex w-full items-center gap-4 rounded-xl border px-4 py-4 text-left transition-all duration-asc ease-asc ${
        ativo
          ? "border-asc-gold bg-asc-gold/[0.07] shadow-[0_0_0_1px_var(--asc-gold)]"
          : "border-asc-line bg-asc-ink/[0.03] hover:border-asc-gold/50 hover:bg-asc-ink/[0.06]"
      }`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors duration-asc ease-asc ${
          ativo ? "border-asc-gold text-asc-gold" : "border-asc-line text-asc-ink-muted"
        }`}
      >
        {icone ?? (
          <span
            className={`h-2 w-2 rounded-full transition-colors ${ativo ? "bg-asc-gold" : "bg-transparent"}`}
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-asc-ink">{titulo}</span>
          {destaque && (
            <span className="rounded-full border border-asc-gold/50 px-2 py-0.5 text-[9px] tracking-luxe uppercase text-asc-gold">
              {destaque}
            </span>
          )}
        </span>
        {subtitulo && (
          <span className="mt-0.5 block text-[11px] font-light text-asc-ink-inverse-muted">
            {subtitulo}
          </span>
        )}
      </span>
      {valor && (
        <span className="shrink-0 font-serif text-base tabular-nums text-asc-ink">{valor}</span>
      )}
    </button>
  );
}

/* ─────────────────── abas de pagamento ─────────────────── */

export type AbaPagamento = {
  id: string;
  icone: ReactNode;
  titulo: string;
  subtitulo: string;
  /** Selo curto ao lado do título — "5% OFF". */
  destaque?: string;
  valor: string;
};

/**
 * Escolha da forma de pagamento em abas lado a lado.
 *
 * Substitui os dois cartões soltos: aqui as opções dividem uma trilha só, e um
 * indicador dourado desliza entre elas — a mesma gramática das abas do modal de
 * conta. O indicador é uma camada absoluta que translada; animar `left` de dois
 * fundos separados daria o salto que o desenho anterior tinha.
 *
 * O papel de `radiogroup` (e não `tablist`) é proposital: o cliente está
 * escolhendo como pagar, não navegando entre painéis de conteúdo equivalentes.
 */
export function AbasPagamento({
  abas,
  ativa,
  onChange,
}: {
  abas: AbaPagamento[];
  ativa: string;
  onChange: (id: string) => void;
}) {
  const indice = Math.max(
    0,
    abas.findIndex((a) => a.id === ativa),
  );

  return (
    <div
      role="radiogroup"
      aria-label="Forma de pagamento"
      className="relative grid gap-2 rounded-2xl border border-asc-line bg-asc-ink/[0.03] p-1.5 sm:grid-cols-2 sm:gap-0"
    >
      {/* Indicador: só existe no desktop, onde as abas dividem uma linha. No
          celular elas empilham e cada uma acende a própria borda. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1.5 left-1.5 hidden rounded-xl border border-asc-gold bg-asc-gold/[0.09] shadow-[0_0_0_1px_var(--asc-gold)] transition-transform duration-asc ease-asc sm:block"
        style={{
          width: `calc((100% - 0.75rem) / ${abas.length})`,
          transform: `translateX(calc(${indice} * 100%))`,
        }}
      />

      {abas.map((a) => {
        const selecionada = a.id === ativa;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={selecionada}
            onClick={() => onChange(a.id)}
            // No desktop o fundo e a borda vêm do indicador que desliza; no
            // celular, onde ele não existe, cada aba acende a própria moldura.
            className={`relative z-10 flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors duration-asc ease-asc sm:border-transparent sm:bg-transparent ${
              selecionada
                ? "border-asc-gold bg-asc-gold/[0.09]"
                : "border-transparent hover:bg-asc-ink/[0.05] sm:hover:bg-asc-ink/[0.04]"
            }`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors duration-asc ease-asc ${
                selecionada ? "border-asc-gold text-asc-gold" : "border-asc-line text-asc-ink-muted"
              }`}
            >
              {a.icone}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-sm transition-colors duration-asc ease-asc ${
                    selecionada ? "text-asc-ink" : "text-asc-ink-inverse-muted"
                  }`}
                >
                  {a.titulo}
                </span>
                {a.destaque && (
                  <span className="rounded-full border border-asc-gold/50 px-2 py-0.5 text-[9px] tracking-luxe uppercase text-asc-gold">
                    {a.destaque}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-light text-asc-ink-inverse-muted">
                {a.subtitulo}
              </span>
            </span>
            <span
              className={`shrink-0 font-serif text-base tabular-nums transition-colors duration-asc ease-asc ${
                selecionada ? "text-asc-ink" : "text-asc-ink-inverse-muted"
              }`}
            >
              {a.valor}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Troca de painel com respiro: o conteúdo antigo sai e o novo entra com um
 * fade curto. A `key` é o que faz o React remontar — sem ela a animação só
 * rodaria na primeira montagem, e alternar as abas seria um corte seco.
 */
export function PainelPagamento({ chave, children }: { chave: string; children: ReactNode }) {
  return (
    <div key={chave} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
      {children}
    </div>
  );
}

/* ─────────────────── selo de compra segura ─────────────────── */

/**
 * Bandeiras em traço monocromático.
 *
 * Desenhadas aqui, e não baixadas: os logos oficiais são marcas registradas com
 * regras próprias de uso e cor, e o pedido era justamente o contrário disso —
 * uma citação discreta, em cinza, que não puxe o olho do botão de pagar. São
 * silhuetas reconhecíveis (o duplo círculo do Mastercard, a caixa da Amex), não
 * reproduções.
 */
function MarcasAceitas({ className = "" }: { className?: string }) {
  const caixa =
    "flex h-6 items-center justify-center rounded-[3px] border border-current px-1.5 text-[8px] font-semibold tracking-[0.12em] uppercase";
  return (
    <div
      aria-label="Bandeiras aceitas: Visa, Mastercard, American Express — processadas pelo Mercado Pago"
      className={`flex flex-wrap items-center gap-2 text-asc-ink-inverse-muted/45 ${className}`}
    >
      <span className={caixa}>Visa</span>
      <span className="flex h-6 items-center gap-1 rounded-[3px] border border-current px-1.5">
        <svg viewBox="0 0 26 16" aria-hidden className="h-3 w-[1.3rem]">
          <circle cx="10" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="16" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </span>
      <span className={caixa}>Amex</span>
      <span className="ml-1 flex h-6 items-center gap-1.5 rounded-[3px] border border-current px-2 text-[8px] tracking-[0.12em] uppercase">
        <ShieldCheck className="h-3 w-3" strokeWidth={1.5} aria-hidden />
        Mercado Pago
      </span>
    </div>
  );
}

/**
 * Bloco de compra segura, logo abaixo do botão de pagar.
 *
 * Discreto de propósito: cadeado fino, texto em corpo pequeno e as bandeiras em
 * cinza. Um selo de segurança gritante tem o efeito contrário do pretendido —
 * lembra o cliente do risco em vez de encerrar o assunto.
 */
export function SeloCompraSegura({ className = "" }: { className?: string }) {
  return (
    <section
      aria-label="Compra segura"
      className={`rounded-xl border border-asc-line bg-asc-ink/[0.03] px-4 py-4 ${className}`}
    >
      <p className="flex items-start gap-2.5 text-[11px] font-light leading-relaxed text-asc-ink-inverse-muted">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-asc-gold" strokeWidth={1.5} />
        <span>
          <span className="mb-0.5 block text-[10px] tracking-luxe uppercase text-asc-gold">
            Compra segura
          </span>
          Pagamento processado e 100% protegido pelo Mercado Pago. Seus dados são criptografados e a
          sua compra possui garantia total.
        </span>
      </p>
      <MarcasAceitas className="mt-3.5 pl-6" />
    </section>
  );
}

/* ─────────────────── mockup do cartão ─────────────────── */

/**
 * Cartão em 3D ao lado do formulário.
 *
 * Ele NÃO espelha o número digitado, e isso é de propósito: os campos do cartão
 * vivem dentro do iframe do Mercado Pago (é o que mantém o site fora do escopo
 * de PCI, já que o número nunca passa pelo nosso JavaScript). Ler dali seria
 * impossível e, se fosse possível, seria justamente o que não se deve fazer.
 * O que ele mostra é o que já sabemos com legitimidade: o nome do titular
 * informado na identificação.
 */
export function CartaoMockup({ nome, bandeira }: { nome: string; bandeira?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  return (
    <div
      className="[perspective:1200px]"
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setTilt({
          x: -((e.clientY - r.top) / r.height - 0.5) * 12,
          y: ((e.clientX - r.left) / r.width - 0.5) * 16,
        });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <div
        ref={ref}
        className="relative aspect-[1.586] w-full max-w-[22rem] overflow-hidden rounded-2xl border border-asc-gold/30 p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] transition-transform duration-asc ease-asc"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          background: "linear-gradient(135deg, #14100a 0%, #0b0c0e 45%, #1a1509 100%)",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/2 rotate-12 bg-gradient-to-r from-transparent via-asc-gold/10 to-transparent"
        />
        <div className="flex items-start justify-between">
          <span className="asc-heading-tracked text-[11px] text-asc-gold">A&amp;S</span>
          <span className="text-[9px] tracking-luxe uppercase text-asc-ink-inverse-muted">
            {bandeira?.trim() || "Crédito"}
          </span>
        </div>
        {/* Chip */}
        <div className="mt-5 h-7 w-10 rounded-md bg-gradient-to-br from-[#e5c687] to-[#a4813c] opacity-90" />
        <p className="mt-4 font-mono text-base tracking-[0.18em] text-asc-ink/80">
          •••• •••• •••• ••••
        </p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[8px] tracking-luxe uppercase text-asc-ink-inverse-muted">
              Titular
            </span>
            <span className="block truncate text-xs uppercase tracking-wide text-asc-ink">
              {nome.trim() || "Seu nome"}
            </span>
          </span>
          <span className="text-right">
            <span className="block text-[8px] tracking-luxe uppercase text-asc-ink-inverse-muted">
              Validade
            </span>
            <span className="block font-mono text-xs text-asc-ink/80">••/••</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── selos de confiança ─────────────────── */

export function SelosConfianca({ itens }: { itens: { icone: ReactNode; texto: string }[] }) {
  return (
    <ul className="grid gap-3">
      {itens.map((s) => (
        <li key={s.texto} className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-asc-line text-asc-gold">
            {s.icone}
          </span>
          <span className="text-[11px] font-light leading-snug text-asc-ink-inverse-muted">
            {s.texto}
          </span>
        </li>
      ))}
    </ul>
  );
}
