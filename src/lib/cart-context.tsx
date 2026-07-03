import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Product = {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  price: number;
  image: string;
  gallery?: string[];
};

export type CartItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  size: string;
  qty: number;
};

type CartCtx = {
  items: CartItem[];
  isOpen: boolean;
  add: (p: Product, size?: string) => void;
  remove: (id: string, size: string) => void;
  updateQty: (id: string, size: string, delta: number) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  count: number;
  subtotal: number;
};

const Ctx = createContext<CartCtx | null>(null);
const CART_KEY = "as_cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {}
  }, [items, hydrated]);

  const add = (p: Product, size: string = "M") => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === p.id && i.size === size);
      if (existing)
        return prev.map((i) =>
          i.id === p.id && i.size === size ? { ...i, qty: i.qty + 1 } : i,
        );
      return [
        ...prev,
        { id: p.id, name: p.name, price: p.price, image: p.image, size, qty: 1 },
      ];
    });
    setOpen(true);
  };

  const remove = (id: string, size: string) =>
    setItems((prev) => prev.filter((i) => !(i.id === id && i.size === size)));

  const updateQty = (id: string, size: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.id === id && i.size === size ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    );
  };

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);

  return (
    <Ctx.Provider
      value={{
        items,
        isOpen,
        add,
        remove,
        updateQty,
        count,
        subtotal,
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => setOpen((o) => !o),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used within CartProvider");
  return c;
}

export const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
