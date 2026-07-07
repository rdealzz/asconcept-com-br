import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth-context";
import { triggerStatusUpdateMail } from "./mail";
import type { CheckoutAddress, Order, OrderItem, OrderStatus, PaymentMethod } from "./types";

type OrdersCtx = {
  orders: Order[];
  loading: boolean;
  createOrder: (input: {
    customerEmail: string;
    customerName?: string;
    items: OrderItem[];
    address: CheckoutAddress;
    shippingCost: number;
    subtotal: number;
    total: number;
    paymentMethod: PaymentMethod;
    status?: OrderStatus;
    couponCode?: string | null;
    discount?: number;
  }) => Promise<Order>;
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
    trackingCode: r.tracking_code ?? undefined,
    createdAt: r.created_at,
  };
}

function normalizeStatus(s: string): OrderStatus {
  if (s === "Preparando pedido" || s === "Em trânsito" || s === "Entregue" || s === "Aguardando Aprovação")
    return s;
  return "Aguardando Aprovação";
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

  const createOrder: OrdersCtx["createOrder"] = async (o) => {
    if (!user) throw new Error("Não autenticado.");
    const rand = Math.floor(100000 + Math.random() * 900000);
    const orderNumber = `AS-${rand}`;
    const payload = {
      order_number: orderNumber,
      user_id: user.id,
      customer_email: o.customerEmail,
      customer_name: o.customerName ?? null,
      items: o.items as unknown,
      address: o.address as unknown,
      shipping_cost: o.shippingCost,
      subtotal: o.subtotal,
      total: o.total,
      payment_method: o.paymentMethod,
      status: o.status ?? "Aguardando Aprovação",
      coupon_code: o.couponCode ?? null,
      discount: o.discount ?? 0,
    };
    const { data, error } = await supabase
      .from("orders")
      .insert(payload as never)
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("Falha ao criar pedido.");
    const order = rowToOrder(data as Row);
    setOrders((prev) => [order, ...prev]);
    return order;
  };

  const updateStatus: OrdersCtx["updateStatus"] = async (id, status, trackingCode) => {
    const target = orders.find((o) => o.id === id);
    if (!target) return;
    const patch: Record<string, unknown> = { status };
    if (trackingCode !== undefined) patch.tracking_code = trackingCode || null;
    const { error } = await supabase
      .from("orders")
      .update(patch as never)
      .eq("order_number", id);
    if (error) {
      console.error("[orders] updateStatus failed", error);
      return;
    }
    const updated: Order = {
      ...target,
      status,
      trackingCode: trackingCode ?? target.trackingCode,
    };
    setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    void triggerStatusUpdateMail(updated.customerEmail, updated.id, status, updated.trackingCode);
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
      value={{ orders, loading, createOrder, updateStatus, setTrackingCode, byUser, getById, refresh }}
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
