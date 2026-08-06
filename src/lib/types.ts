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
 * `mp_pix` e `mp_card` são o que o checkout do site realmente grava hoje
 * (createPendingOrderCore); estavam fora deste tipo, e por isso todo pedido
 * pago por Pix ou cartão aparecia no painel rotulado como "Boleto".
 */
export type PaymentMethod = "mp_pix" | "mp_card" | "stripe" | "pix" | "credit_card" | "boleto";

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

export type PrePaymentStatus = (typeof PRE_PAYMENT_STATUSES)[number];
export type FlowStatus = (typeof FLOW_STATUSES)[number];
export type OrderStatus = PrePaymentStatus | FlowStatus;

export function isPrePaymentStatus(s: string): s is PrePaymentStatus {
  return (PRE_PAYMENT_STATUSES as readonly string[]).includes(s);
}

export function isFlowStatus(s: string): s is FlowStatus {
  return (FLOW_STATUSES as readonly string[]).includes(s);
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
