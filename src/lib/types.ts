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

export type PaymentMethod = "credit_card" | "pix" | "boleto" | "stripe";

export type OrderStatus =
  | "Aguardando Aprovação"
  | "Preparando pedido"
  | "Em trânsito"
  | "Entregue";

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
