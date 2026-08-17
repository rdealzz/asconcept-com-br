export interface CheckoutAddress {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  size: string;
  image: string;
}

/**
 * Formas de pagamento gravadas em `orders.payment_method`.
 *
 * `mp_pix` e `mp_card` são o que o checkout grava — Pix e cartão pelo Mercado
 * Pago. Os três últimos aparecem só em pedidos antigos e nos cadastros
 * manuais; ficam aqui para que o histórico continue exibindo o rótulo certo.
 */
export type PaymentMethod = "mp_pix" | "mp_card" | "pix" | "credit_card" | "boleto";

/**
 * Estados de um pedido.
 *
 * Os três primeiros são anteriores ao pagamento e não fazem parte do fluxo do
 * ateliê: um pedido só entra na fila de aprovação depois que o dinheiro entrou
 * (ou depois que o admin confirma o pagamento na mão). Antes eles eram
 * normalizados para "Aguardando Aprovação" no cliente, o que fazia um checkout
 * abandonado aparecer no painel como se estivesse pago e pronto para aprovar.
 */
export const PRE_PAYMENT_STATUSES = [
  "Aguardando Pagamento",
  "Pagamento recusado",
  "Falha no pagamento",
] as const;

/**
 * Fluxo do ateliê, na ordem. O avanço é sempre manual, uma etapa por vez.
 *
 * "Finalizado" é o último degrau, e serve aos dois tipos de venda: o pedido do
 * site chega nele depois de entregue, e o pedido de balcão pode nascer nele —
 * a peça já trocou de mãos antes de alguém abrir o formulário.
 */
export const FLOW_STATUSES = [
  "Aguardando Aprovação",
  "Preparando pedido",
  "Em trânsito",
  "Entregue",
  "Finalizado",
] as const;

/** Ponto final: daqui não se avança nem se volta. */
export const FINAL_STATUS = "Finalizado" as const;

/**
 * A etapa em que a peça sai do estoque.
 *
 * No site, quem baixa é a aprovação do pagamento. No cadastro manual, o mesmo
 * ponto vale: nascendo daqui para a frente, a venda já aconteceu e o estoque
 * cai junto com a gravação; nascendo em "Aguardando Aprovação", o pedido entra
 * no fluxo normal e espera a aprovação como qualquer outro.
 */
export const STOCK_STATUS = "Preparando pedido" as const;

export type PrePaymentStatus = (typeof PRE_PAYMENT_STATUSES)[number];
export type FlowStatus = (typeof FLOW_STATUSES)[number];
export type OrderStatus = PrePaymentStatus | FlowStatus;

export function isPrePaymentStatus(s: string): s is PrePaymentStatus {
  return (PRE_PAYMENT_STATUSES as readonly string[]).includes(s);
}

export function isFlowStatus(s: string): s is FlowStatus {
  return (FLOW_STATUSES as readonly string[]).includes(s);
}

export function isFinalStatus(s: string): s is typeof FINAL_STATUS {
  return s === FINAL_STATUS;
}

/** O status já passou do ponto em que a peça sai do estoque? */
export function consumesStockOnCreate(s: string): boolean {
  const i = (FLOW_STATUSES as readonly string[]).indexOf(s);
  return i >= (FLOW_STATUSES as readonly string[]).indexOf(STOCK_STATUS);
}

/**
 * De onde veio a venda.
 *
 * Dois fluxos que não se parecem: o pedido do site percorre preparação, envio e
 * entrega; o de balcão costuma nascer pronto. Separá-los no rótulo é o que
 * permite ao painel parar de tratar os dois como a mesma fila.
 */
export const ORDER_ORIGINS = ["online", "manual"] as const;
export type OrderOrigin = (typeof ORDER_ORIGINS)[number];

export const ORDER_ORIGIN_LABELS: Record<OrderOrigin, string> = {
  online: "Pedido Online",
  manual: "Pedido Manual",
};

/**
 * A origem de um pedido gravado.
 *
 * A coluna `orders.origin` é a resposta quando existe. Ela é nova, então todo
 * pedido anterior a ela precisa ser deduzido — e dá para deduzir com certeza,
 * porque as duas marcas do site nunca aparecem num cadastro manual:
 *
 *   1. **passou pelo Mercado Pago** (`mp_pix`/`mp_card`, ou id/status de
 *      pagamento gravado) — é o checkout da loja, sem exceção;
 *   2. **tem endereço de entrega** — o formulário do painel nunca pediu um, e
 *      grava o endereço vazio. É o que separa a venda de balcão do pedido
 *      antigo do site, de antes do Mercado Pago, que ainda usa `pix`/`boleto`.
 */
export function orderOrigin(row: {
  origin?: string | null;
  payment_method?: string | null;
  mp_payment_id?: string | null;
  mp_status?: string | null;
  address?: unknown;
}): OrderOrigin {
  if (row.origin === "manual" || row.origin === "online") return row.origin;
  if (row.payment_method?.startsWith("mp_")) return "online";
  if (row.mp_payment_id || row.mp_status) return "online";
  const cep = (row.address as { cep?: unknown } | null)?.cep;
  if (typeof cep === "string" && cep.trim().length > 0) return "online";
  return "manual";
}

export interface Order {
  id: string;
  customerEmail: string;
  customerName?: string;
  items: OrderItem[];
  address: CheckoutAddress;
  shippingCost: number;
  subtotal: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  origin: OrderOrigin;
  trackingCode?: string;
  createdAt: string;
}
