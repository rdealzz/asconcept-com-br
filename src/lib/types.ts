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

/** Fluxo do ateliê, na ordem. O avanço é sempre manual, uma etapa por vez. */
export const FLOW_STATUSES = [
  "Aguardando Aprovação",
  "Preparando pedido",
  "Em trânsito",
  "Entregue",
] as const;

/**
 * Venda fechada fora da loja — balcão, feira, WhatsApp.
 *
 * Fica de fora de `FLOW_STATUSES` de propósito: não é uma quinta etapa do
 * ateliê, é a ausência de etapas. O pedido manual nasce aqui porque a peça já
 * trocou de mãos e o dinheiro já entrou; passá-lo por "Aguardando Aprovação →
 * Preparando pedido → Em trânsito → Entregue" seria pedir ao admin que
 * encenasse quatro cliques para uma venda que acabou antes de ser cadastrada.
 *
 * Como está fora do fluxo, o painel não oferece próximo passo e o servidor
 * recusa qualquer mudança de status: pedido finalizado é ponto final.
 */
export const MANUAL_SALE_STATUS = "Finalizado" as const;

export type PrePaymentStatus = (typeof PRE_PAYMENT_STATUSES)[number];
export type FlowStatus = (typeof FLOW_STATUSES)[number];
export type ManualSaleStatus = typeof MANUAL_SALE_STATUS;
export type OrderStatus = PrePaymentStatus | FlowStatus | ManualSaleStatus;

export function isPrePaymentStatus(s: string): s is PrePaymentStatus {
  return (PRE_PAYMENT_STATUSES as readonly string[]).includes(s);
}

export function isFlowStatus(s: string): s is FlowStatus {
  return (FLOW_STATUSES as readonly string[]).includes(s);
}

/** Venda de balcão já concluída — não avança, não retrocede. */
export function isManualSaleStatus(s: string): s is ManualSaleStatus {
  return s === MANUAL_SALE_STATUS;
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
  trackingCode?: string;
  createdAt: string;
}
