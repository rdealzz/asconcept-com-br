import { createContext, useContext, useState, type ReactNode } from "react";
import type { Order, OrderStatus } from "./types";
import { triggerStatusUpdateMail } from "./mail";

const ORDERS_KEY = "as_orders_v2";
const LEGACY_KEY = "as_orders";

type OrdersCtx = {
  orders: Order[];
  createOrder: (
    o: Omit<Order, "id" | "createdAt" | "status"> & { status?: OrderStatus },
  ) => Order;
  updateStatus: (id: string, status: OrderStatus, trackingCode?: string) => void;
  setTrackingCode: (id: string, trackingCode: string) => void;
  byUser: (email: string) => Order[];
  getById: (id: string) => Order | undefined;
};

const Ctx = createContext<OrdersCtx | null>(null);

function migrateStatus(s: unknown): Order["status"] {
  if (s === "Pendente" || s === "Aguardando Aprovação") return "Aguardando Aprovação";
  if (s === "Aprovado" || s === "Preparando pedido") return "Preparando pedido";
  if (s === "Em trânsito") return "Em trânsito";
  if (s === "Entregue") return "Entregue";
  return "Aguardando Aprovação";
}

function normalize(orders: Order[]): Order[] {
  return orders.map((o) => ({ ...o, status: migrateStatus(o.status) }));
}

function loadInitial(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (raw) {
      const parsed = normalize(JSON.parse(raw) as Order[]);
      localStorage.setItem(ORDERS_KEY, JSON.stringify(parsed));
      return parsed;
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = normalize(JSON.parse(legacy) as Order[]);
      localStorage.setItem(ORDERS_KEY, JSON.stringify(parsed));
      return parsed;
    }
    localStorage.setItem(ORDERS_KEY, "[]");
    return [];
  } catch {
    return [];
  }
}

function persist(orders: Order[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  } catch {}
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  // Lazy init — carrega direto do localStorage sem reset em F5.
  const [orders, setOrders] = useState<Order[]>(loadInitial);

  const commit = (updater: (prev: Order[]) => Order[]) => {
    setOrders((prev) => {
      const next = updater(prev);
      persist(next);
      return next;
    });
  };

  const createOrder: OrdersCtx["createOrder"] = (o) => {
    const rand = Math.floor(100000 + Math.random() * 900000);
    const id = `AS-${rand}`;
    const order: Order = {
      ...o,
      id,
      status: o.status ?? "Aguardando Aprovação",
      createdAt: new Date().toISOString(),
    };
    commit((prev) => [order, ...prev]);
    return order;
  };

  const updateStatus: OrdersCtx["updateStatus"] = (id, status, trackingCode) => {
    let updated: Order | undefined;
    commit((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        updated = {
          ...o,
          status,
          trackingCode: trackingCode ?? o.trackingCode,
        };
        return updated;
      }),
    );
    if (updated) {
      // Dispara e-mail transacional de atualização de status
      void triggerStatusUpdateMail(
        updated.customerEmail,
        updated.id,
        status,
        updated.trackingCode,
      );
    }
  };

  const setTrackingCode: OrdersCtx["setTrackingCode"] = (id, trackingCode) => {
    commit((prev) =>
      prev.map((o) => (o.id === id ? { ...o, trackingCode } : o)),
    );
  };

  const byUser = (email: string) =>
    orders.filter(
      (o) => o.customerEmail.toLowerCase() === email.toLowerCase(),
    );

  const getById = (id: string) => orders.find((o) => o.id === id);

  return (
    <Ctx.Provider
      value={{ orders, createOrder, updateStatus, setTrackingCode, byUser, getById }}
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
