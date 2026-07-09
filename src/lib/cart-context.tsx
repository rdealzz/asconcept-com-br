import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { calcDiscount, type Coupon } from "./coupons";

export type ProductCategory = "clothes" | "sneakers";

export type Product = {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  price: number;
  image: string;
  gallery?: string[];
  category?: ProductCategory;
  forceLastItem?: boolean;
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
  clear: () => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  count: number;
  subtotal: number;
  coupon: Coupon | null;
  couponCode: string | null;
  couponDiscount: number;
  setCoupon: (coupon: Coupon | null) => void;
};

const Ctx = createContext<CartCtx | null>(null);

const CART_KEY = "as_cart_v1";
const COUPON_KEY = "as_coupon_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [coupon, setCouponState] = useState<Coupon | null>(null);
  const hydrated = useRef(false);

  // Hydrate from localStorage on client mount to avoid SSR mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
      const c = localStorage.getItem(COUPON_KEY);
      if (c) {
        const parsed = JSON.parse(c);
        if (parsed && typeof parsed === "object" && parsed.code) setCouponState(parsed);
      }
    } catch {
      /* ignore */
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch { /* ignore */ }
  }, [items]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      if (coupon) localStorage.setItem(COUPON_KEY, JSON.stringify(coupon));
      else localStorage.removeItem(COUPON_KEY);
    } catch { /* ignore */ }
  }, [coupon]);

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
  // Recompute the discount dynamically from the current subtotal so cart edits
  // never leave a stale (and potentially over-generous) discount attached.
  const couponDiscount = coupon ? Math.min(subtotal, calcDiscount(coupon, subtotal)) : 0;

  return (
    <Ctx.Provider
      value={{
        items,
        isOpen,
        add,
        remove,
        updateQty,
        clear: () => {
          setItems([]);
          setCouponState(null);
        },
        count,
        subtotal,
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => setOpen((o) => !o),
        coupon,
        couponCode: coupon?.code ?? null,
        couponDiscount,
        setCoupon: (c) => setCouponState(c),
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
