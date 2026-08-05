import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Product, ProductCategory } from "@/lib/cart-context";

/**
 * Catálogo (Supabase) — extraído de routes/index.tsx para que outras rotas
 * além da home possam ler produtos e estoque. O provider é montado no
 * __root, dentro do CartProvider.
 */

export const SIZES = ["P", "M", "G", "GG"] as const;
export type Size = (typeof SIZES)[number];
export type SizeStock = Record<Size, number>;

export const emptyStock = (): SizeStock => ({ P: 0, M: 0, G: 0, GG: 0 });
export const totalStock = (s: SizeStock | undefined) => (s ? s.P + s.M + s.G + s.GG : 0);
export const hasLastSize = (s: SizeStock | undefined) =>
  !!s && (s.P === 1 || s.M === 1 || s.G === 1 || s.GG === 1);

type ProductInput = Omit<Product, "id">;

type CatalogCtx = {
  products: Product[];
  stock: Record<string, SizeStock>;
  loading: boolean;
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>;
  addProduct: (p: ProductInput, stock: SizeStock) => Promise<string | null>;
  deleteProduct: (id: string) => Promise<void>;
  setStock: (id: string, stock: SizeStock) => Promise<void>;
  decrementStock: (id: string, size: Size, by?: number) => void;
  refresh: () => Promise<void>;
};
const CatalogContext = createContext<CatalogCtx | null>(null);

export function coerceSizeStock(v: unknown): SizeStock {
  if (v && typeof v === "object") {
    const src = v as Partial<Record<Size, unknown>>;
    return {
      P: Math.max(0, Math.floor(Number(src.P) || 0)),
      M: Math.max(0, Math.floor(Number(src.M) || 0)),
      G: Math.max(0, Math.floor(Number(src.G) || 0)),
      GG: Math.max(0, Math.floor(Number(src.GG) || 0)),
    };
  }
  return emptyStock();
}

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  long_description: string | null;
  price: string | number;
  category: string;
  image: string | null;
  gallery: unknown;
  sizes: unknown;
  force_last_item: boolean;
  sort_order: number;
  created_at?: string | null;
};

export function rowToProduct(r: ProductRow): Product {
  const image = r.image ?? "";
  const galleryArr = Array.isArray(r.gallery)
    ? (r.gallery as unknown[]).filter((g): g is string => typeof g === "string")
    : [];
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    longDescription: r.long_description ?? undefined,
    price: Number(r.price),
    image,
    gallery: galleryArr.length ? galleryArr : image ? [image] : [],
    category: (r.category === "sneakers" ? "sneakers" : "clothes") as ProductCategory,
    forceLastItem: r.force_last_item || undefined,
    createdAt: r.created_at ?? undefined,
  };
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStockMap] = useState<Record<string, SizeStock>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      console.error("[catalog] fetch failed", error);
      return;
    }
    const rows = (data ?? []) as ProductRow[];
    setProducts(rows.map(rowToProduct));
    const nextStock: Record<string, SizeStock> = {};
    for (const r of rows) nextStock[r.id] = coerceSizeStock(r.sizes);
    setStockMap(nextStock);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateProduct: CatalogCtx["updateProduct"] = async (id, patch) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.longDescription !== undefined)
      dbPatch.long_description = patch.longDescription ?? null;
    if (patch.price !== undefined) dbPatch.price = patch.price;
    if (patch.image !== undefined) dbPatch.image = patch.image;
    if (patch.gallery !== undefined) dbPatch.gallery = patch.gallery;
    if (patch.category !== undefined) dbPatch.category = patch.category;
    if (patch.forceLastItem !== undefined) dbPatch.force_last_item = patch.forceLastItem === true;

    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await supabase
      .from("products")
      .update(dbPatch as never)
      .eq("id", id);
    if (error) {
      console.error("[catalog] update failed", error);
      await refresh();
    }
  };

  const addProduct: CatalogCtx["addProduct"] = async (p, s) => {
    const payload = {
      name: p.name,
      description: p.description,
      long_description: p.longDescription ?? null,
      price: p.price,
      image: p.image,
      gallery: p.gallery ?? [p.image],
      category: p.category ?? "clothes",
      force_last_item: p.forceLastItem === true,
      sizes: coerceSizeStock(s),
    };
    const { data, error } = await supabase
      .from("products")
      .insert(payload as never)
      .select("*")
      .single();
    if (error || !data) {
      console.error("[catalog] insert failed", error);
      return null;
    }
    const row = data as ProductRow;
    const product = rowToProduct(row);
    setProducts((prev) => [...prev, product]);
    setStockMap((prev) => ({ ...prev, [product.id]: coerceSizeStock(row.sizes) }));
    return product.id;
  };

  const deleteProduct: CatalogCtx["deleteProduct"] = async (id) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setStockMap((prev) => {
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      console.error("[catalog] delete failed", error);
      await refresh();
    }
  };

  const setStock: CatalogCtx["setStock"] = async (id, s) => {
    const next = coerceSizeStock(s);
    setStockMap((prev) => ({ ...prev, [id]: next }));
    const { error } = await supabase
      .from("products")
      .update({ sizes: next } as never)
      .eq("id", id);
    if (error) {
      console.error("[catalog] setStock failed", error);
      await refresh();
    }
  };

  // Optimistic local decrement — DB decrement runs server-side on checkout via RPC.
  const decrementStock: CatalogCtx["decrementStock"] = (id, size, by = 1) =>
    setStockMap((prev) => {
      const cur = prev[id] ?? emptyStock();
      return {
        ...prev,
        [id]: { ...cur, [size]: Math.max(0, (cur[size] ?? 0) - by) },
      };
    });

  return (
    <CatalogContext.Provider
      value={{
        products,
        stock,
        loading,
        updateProduct,
        addProduct,
        deleteProduct,
        setStock,
        decrementStock,
        refresh,
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const c = useContext(CatalogContext);
  if (!c) throw new Error("CatalogProvider missing");
  return c;
}
