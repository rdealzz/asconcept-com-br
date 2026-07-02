import { createContext, useContext, useState, type ReactNode } from "react";

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
};

export type CartItem = Product & { qty: number };

type CartCtx = {
  items: CartItem[];
  isOpen: boolean;
  add: (p: Product) => void;
  remove: (id: string) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  count: number;
  subtotal: number;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setOpen] = useState(false);

  const add = (p: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      if (existing) return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { ...p, qty: 1 }];
    });
    setOpen(true);
  };
  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);

  return (
    <Ctx.Provider
      value={{
        items,
        isOpen,
        add,
        remove,
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

export const formatUSD = (n: number) =>
  `$${n.toLocaleString("en-US")} USD`;
