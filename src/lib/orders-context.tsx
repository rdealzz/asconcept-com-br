import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Order, OrderStatus } from "./types";

const ORDERS_KEY = "as_orders";

type OrdersCtx = {
  orders: Order[];
  createOrder: (o: Omit<Order, "id" | "createdAt" | "status"> & { status?: OrderStatus }) => Order;
  updateStatus: (id: string, status: OrderStatus) => void;
  byUser: (email: string) => Order[];
  getById: (id: string) => Order | undefined;
};

const Ctx = createContext<OrdersCtx | null>(null);

function readAll(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? (JSON.parse(raw) as Order[]) : [];
  } catch {
    return [];
  }
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOrders(readAll());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    } catch {}
  }, [orders, hydrated]);

  const createOrder: OrdersCtx["createOrder"] = (o) => {
    const id = `AS-${Date.now().toString(36).toUpperCase()}`;
    const order: Order = {
      ...o,
      id,
      status: o.status ?? "Pendente",
      createdAt: new Date().toISOString(),
    };
    setOrders((prev) => [order, ...prev]);
    return order;
  };

  const updateStatus: OrdersCtx["updateStatus"] = (id, status) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));

  const byUser = (email: string) =>
    orders.filter((o) => o.customerEmail.toLowerCase() === email.toLowerCase());

  const getById = (id: string) => orders.find((o) => o.id === id);

  return (
    <Ctx.Provider value={{ orders, createOrder, updateStatus, byUser, getById }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOrders() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrders must be used within OrdersProvider");
  return c;
}
