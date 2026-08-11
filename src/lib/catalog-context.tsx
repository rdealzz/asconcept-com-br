import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/cart-context";
import { coerceCategory } from "@/lib/categories";
import { SIZE_GRIDS } from "@/lib/sizes";

/**
 * Catálogo (Supabase) — extraído de routes/index.tsx para que outras rotas
 * além da home possam ler produtos e estoque. O provider é montado no
 * __root, dentro do CartProvider.
 */

/**
 * Grade padrão — a das roupas. Cada peça tem a sua (ver `@/lib/sizes`): calça
 * vai em número, sneaker em número de pé, acessório é tamanho único. Esta
 * continua sendo o valor de partida de quem não sabe de que peça se trata.
 */
export const SIZES = SIZE_GRIDS.letras;
/**
 * O tamanho é texto livre: "M", "42", "Único". Quem manda no que aparece é a
 * grade da peça, não o tipo.
 */
export type Size = string;
export type SizeStock = Record<string, number>;

export const emptyStock = (sizes: readonly string[] = SIZES): SizeStock =>
  Object.fromEntries(sizes.map((s) => [s, 0]));
export const totalStock = (s: SizeStock | undefined) =>
  s ? Object.values(s).reduce((acc, q) => acc + (Number(q) || 0), 0) : 0;
export const hasLastSize = (s: SizeStock | undefined) =>
  !!s && Object.values(s).some((q) => Number(q) === 1);

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
export const LIST_COLUMNS =
  "id,name,description,price,category,image,sizes,force_last_item,is_featured,sort_order,created_at";

/**
 * As mesmas colunas sem `is_featured`.
 *
 * O código sobe antes de a migração rodar no banco (é o admin quem executa o
 * SQL). No intervalo, pedir uma coluna inexistente derruba o SELECT inteiro e
 * a loja fica sem catálogo — bem pior do que ficar sem destaques. Então a
 * primeira falha por coluna ausente cai para esta lista e segue a vida.
 */
export const LIST_COLUMNS_LEGACY =
  "id,name,description,price,category,image,sizes,force_last_item,sort_order,created_at";

/** Erro do Postgres para coluna que não existe (`undefined_column`). */
export function isMissingFeaturedColumn(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  return error.code === "42703" || /is_featured/i.test(error.message ?? "");
}

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
  /**
   * `true` quando a leitura do catálogo teve de cair para as colunas antigas
   * porque `products.is_featured` ainda não existe. O painel usa isto para
   * pedir a migração em vez de deixar o admin clicar num botão que só vai
   * devolver 400.
   */
  featuredColumnMissing: boolean;
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>;
  /**
   * Liga/desliga a curadoria de vitrine de uma peça (só admin — quem manda é a
   * RLS). Devolve `null` em caso de sucesso ou a mensagem de erro pronta para
   * a tela, porque este é o primeiro botão que encosta na coluna nova: se a
   * migração ainda não rodou, o admin precisa saber disso, não um console.
   */
  setFeatured: (id: string, featured: boolean) => Promise<string | null>;
  addProduct: (p: ProductInput, stock: SizeStock) => Promise<string | null>;
  deleteProduct: (id: string) => Promise<void>;
  setStock: (id: string, stock: SizeStock) => Promise<void>;
  refresh: () => Promise<void>;
};
const CatalogContext = createContext<CatalogCtx | null>(null);

/**
 * Normaliza o `sizes` do banco: quantidades inteiras e não negativas, uma por
 * tamanho gravado. As chaves são as que a peça tiver — "P" ou "42" ou "Único" —
 * porque a coluna é JSONB e a grade varia com a espécie da peça.
 *
 * `sizes` força a presença de uma grade: o formulário do admin passa a grade da
 * peça para que um tamanho zerado continue aparecendo como campo.
 */
export function coerceSizeStock(v: unknown, sizes?: readonly string[]): SizeStock {
  const out: SizeStock = sizes ? emptyStock(sizes) : {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [tamanho, qtd] of Object.entries(v as Record<string, unknown>)) {
      if (!tamanho) continue;
      out[tamanho] = Math.max(0, Math.floor(Number(qtd) || 0));
    }
  }
  return out;
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
  /** Ausente enquanto a migração de destaques não rodou. */
  is_featured?: boolean | null;
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
    category: coerceCategory(r.category),
    forceLastItem: r.force_last_item || undefined,
    isFeatured: r.is_featured === true,
    createdAt: r.created_at ?? undefined,
  };
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStockMap] = useState<Record<string, SizeStock>>({});
  const [loading, setLoading] = useState(true);
  const [featuredColumnMissing, setFeaturedColumnMissing] = useState(false);

  // Quais peças já tiveram a galeria buscada. Fica em ref, e não em estado,
  // para que duas chamadas seguidas (passar o mouse e clicar) não disparem
  // duas requisições por causa de closure desatualizada.
  const galleryRequested = useRef<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    // A lista de colunas passou a ser variável, e com isso o supabase-js perde
    // a inferência do formato da linha. O retorno é normalizado aqui — o
    // `rowToProduct` abaixo já era quem validava o conteúdo.
    const buscar = async (colunas: string) => {
      const res = await supabase
        .from("products")
        .select(colunas)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      return res as unknown as {
        data: unknown[] | null;
        error: { code?: string; message?: string } | null;
      };
    };

    let { data, error } = await buscar(LIST_COLUMNS);
    const semColunaDestaque = isMissingFeaturedColumn(error);
    setFeaturedColumnMissing(semColunaDestaque);
    if (semColunaDestaque) {
      console.warn("[catalog] coluna is_featured ausente — rode a migração de destaques");
      ({ data, error } = await buscar(LIST_COLUMNS_LEGACY));
    }
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
    if (patch.isFeatured !== undefined) dbPatch.is_featured = patch.isFeatured === true;

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

  const setFeatured: CatalogCtx["setFeatured"] = async (id, featured) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isFeatured: featured } : p)));
    const { error } = await supabase
      .from("products")
      .update({ is_featured: featured } as never)
      .eq("id", id);
    if (!error) return null;

    console.error("[catalog] setFeatured failed", error);
    // Desfaz o otimismo: o botão volta ao estado que o banco ainda tem.
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isFeatured: !featured } : p)));
    return isMissingFeaturedColumn(error)
      ? "A coluna is_featured ainda não existe no banco. Rode a migração de destaques."
      : "Não foi possível salvar o destaque. Tente novamente.";
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
        featuredColumnMissing,
        updateProduct,
        setFeatured,
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
