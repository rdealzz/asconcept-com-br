import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth-context";
import { adminCreateManualOrder, adminUpdateOrderStatus } from "./admin.functions";
import {
  isFlowStatus,
  isPrePaymentStatus,
  orderOrigin,
  type CheckoutAddress,
  type FlowStatus,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PaymentMethod,
} from "./types";

/** Uma peça da venda de balcão, com o valor já negociado. */
export type ItemManual = {
  id: string;
  size: string;
  quantity: number;
  /** Valor da linha inteira — com a quantidade dentro, não o unitário. */
  valor: number;
};

type OrdersCtx = {
  orders: Order[];
  loading: boolean;
  /**
   * Registra uma venda feita fora da loja.
   *
   * O status inicial é escolha de quem cadastra — "Finalizado" no caso comum,
   * em que a peça já saiu com o cliente. Quem grava é o servidor: a baixa de
   * estoque exige a chave de serviço, e ela e a gravação precisam acontecer
   * juntas ou nenhuma.
   */
  createManualOrder: (input: {
    customerEmail: string;
    customerName?: string;
    items: ItemManual[];
    status?: FlowStatus;
  }) => Promise<{ orderNumber: string; status: FlowStatus; stockConsumed: boolean }>;
  updateStatus: (id: string, status: OrderStatus, trackingCode?: string) => Promise<void>;
  setTrackingCode: (id: string, trackingCode: string) => Promise<void>;
  byUser: (email: string) => Order[];
  getById: (id: string) => Order | undefined;
  refresh: () => Promise<void>;
};

const Ctx = createContext<OrdersCtx | null>(null);

type Row = {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_email: string;
  customer_name: string | null;
  items: unknown;
  address: unknown;
  shipping_cost: string | number;
  subtotal: string | number;
  total: string | number;
  payment_method: string;
  status: string;
  tracking_code: string | null;
  created_at: string;
  /** Colunas do Mercado Pago e a origem: ausentes em banco mais antigo. */
  mp_payment_id?: string | null;
  mp_status?: string | null;
  origin?: string | null;
};

function rowToOrder(r: Row): Order {
  return {
    id: r.order_number,
    customerEmail: r.customer_email,
    customerName: r.customer_name ?? undefined,
    items: (r.items as OrderItem[]) ?? [],
    address: (r.address as CheckoutAddress) ?? ({} as CheckoutAddress),
    shippingCost: Number(r.shipping_cost),
    subtotal: Number(r.subtotal),
    total: Number(r.total),
    paymentMethod: r.payment_method as PaymentMethod,
    status: normalizeStatus(r.status),
    // A leitura é `select("*")`, então a coluna nova entra sozinha assim que a
    // migração roda; até lá, `orderOrigin` deduz pelo pagamento e pelo endereço.
    origin: orderOrigin(r),
    trackingCode: r.tracking_code ?? undefined,
    createdAt: r.created_at,
  };
}

function normalizeStatus(s: string): OrderStatus {
  if (isFlowStatus(s) || isPrePaymentStatus(s)) return s;
  // Status desconhecido vindo do banco: trata como anterior ao pagamento, que é
  // o lado seguro — nunca como "pronto para aprovar".
  return "Aguardando Pagamento";
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setOrders([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      console.error("[orders] fetch failed", error);
      return;
    }
    setOrders((data as Row[]).map(rowToOrder));
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createManualOrder: OrdersCtx["createManualOrder"] = async (o) => {
    if (!user) throw new Error("Não autenticado.");
    const { orderNumber, status, stockConsumed } = await adminCreateManualOrder({ data: o });
    // A lista vem do banco em vez de ser remendada aqui: a venda de balcão
    // mexe em estoque e em pedido na mesma ida, e o que o servidor gravou é a
    // única versão que interessa.
    await refresh();
    return { orderNumber, status, stockConsumed };
  };

  const updateStatus: OrdersCtx["updateStatus"] = async (id, status, trackingCode) => {
    const target = orders.find((o) => o.id === id);
    if (!target) return;
    const result = await adminUpdateOrderStatus({
      data: { orderNumber: id, status, trackingCode },
    });
    if (!result.ok) throw new Error("Não foi possível atualizar o pedido.");
    const updated: Order = {
      ...target,
      status,
      trackingCode: result.trackingCode ?? target.trackingCode,
    };
    setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
  };

  const setTrackingCode: OrdersCtx["setTrackingCode"] = async (id, trackingCode) => {
    const { error } = await supabase
      .from("orders")
      .update({ tracking_code: trackingCode || null })
      .eq("order_number", id);
    if (error) return;
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, trackingCode } : o)));
  };

  const byUser = (email: string) =>
    orders.filter((o) => o.customerEmail.toLowerCase() === email.toLowerCase());
  const getById = (id: string) => orders.find((o) => o.id === id);

  return (
    <Ctx.Provider
      value={{
        orders,
        loading,
        createManualOrder,
        updateStatus,
        setTrackingCode,
        byUser,
        getById,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useOrders() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrders must be used within OrdersProvider");
  return c;
}
