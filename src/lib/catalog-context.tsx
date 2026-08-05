import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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

/**
 * Colunas da listagem da vitrine.
 *
 * De propósito sem `gallery` e `long_description`: as fotos são gravadas como
 * base64 dentro da própria linha do produto, então um `select("*")` baixava
 * todas as fotos de todas as peças (até 5 por peça) só para a grade mostrar
 * uma. Era isso que fazia os produtos demorarem a aparecer. As demais fotos
 * chegam depois, sob demanda, por `loadGallery`.
 */
const LIST_COLUMNS =
  "id,name,description,price,category,image,sizes,force_last_item,sort_order,created_at";

type CatalogCtx = {
  products: Product[];
  stock: Record<string, SizeStock>;
  loading: boolean;
  /**
   * Busca as fotos restantes (e a descrição longa) de uma peça e as funde ao
   * catálogo. Chamada ao passar o mouse num card e ao abrir a página do
   * produto. Repetir a chamada é barato: só a primeira vai à rede.
   */
  loadGallery: (id: string) => Promise<void>;
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>;
  addProduct: (p: ProductInput, stock: SizeStock) => Promise<string | null>;
  deleteProduct: (id: string) => Promise<void>;
  setStock: (id: string, stock: SizeStock) => Promise<void>;
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
  /** Ausentes na consulta leve da vitrine; chegam em `loadGallery`. */
  long_description?: string | null;
  price: string | number;
  category: string;
  image: string | null;
  gallery?: unknown;
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

  // Quais peças já tiveram a galeria buscada. Fica em ref, e não em estado,
  // para que duas chamadas seguidas (passar o mouse e clicar) não disparem
  // duas requisições por causa de closure desatualizada.
  const galleryRequested = useRef<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select(LIST_COLUMNS)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      console.error("[catalog] fetch failed", error);
      return;
    }
    const rows = (data ?? []) as unknown as ProductRow[];
    galleryRequested.current = {};
    setProducts(rows.map(rowToProduct));
    const nextStock: Record<string, SizeStock> = {};
    for (const r of rows) nextStock[r.id] = coerceSizeStock(r.sizes);
    setStockMap(nextStock);
  }, []);

  const loadGallery: CatalogCtx["loadGallery"] = useCallback(async (id) => {
    if (!id || galleryRequested.current[id]) return;
    galleryRequested.current[id] = true;

    const { data, error } = await supabase
      .from("products")
      .select("id,gallery,long_description")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      // Libera para tentar de novo — a peça pode ter sido só uma falha de rede.
      galleryRequested.current[id] = false;
      if (error) console.error("[catalog] loadGallery failed", error);
      return;
    }

    const row = data as { gallery?: unknown; long_description?: string | null };
    const gal = Array.isArray(row.gallery)
      ? (row.gallery as unknown[]).filter((g): g is string => typeof g === "string")
      : [];

    setProducts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              gallery: gal.length ? gal : p.gallery,
              longDescription: row.long_description ?? p.longDescription,
            }
          : p,
      ),
    );
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

  return (
    <CatalogContext.Provider
      value={{
        products,
        stock,
        loading,
        loadGallery,
        updateProduct,
        addProduct,
        deleteProduct,
        setStock,
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
