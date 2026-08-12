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
export const LIST_COLUMNS_BASE =
  "id,name,description,price,category,image,sizes,force_last_item,sort_order,created_at";

/**
 * Colunas que só existem depois da migração correspondente.
 *
 * O código sobe antes de a migração rodar no banco (é o admin quem executa o
 * SQL). No intervalo, pedir uma coluna inexistente derruba o SELECT inteiro e
 * a loja fica sem catálogo — bem pior do que ficar sem curadoria. Então a
 * leitura desce um degrau por coluna ausente e segue a vida.
 */
export const OPTIONAL_COLUMNS = ["is_featured", "force_new"] as const;
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

export const LIST_COLUMNS = [LIST_COLUMNS_BASE, ...OPTIONAL_COLUMNS].join(",");

/** Erro do Postgres para coluna que não existe (`undefined_column`). */
export function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /does not exist/i.test(error.message ?? "");
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
   * Colunas de curadoria que o banco ainda não tem — a leitura teve de descer
   * um degrau para não derrubar o catálogo inteiro. O painel usa isto para
   * pedir a migração em vez de deixar o admin clicar num botão que só vai
   * devolver 400.
   */
  missingColumns: OptionalColumn[];
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
 * Quantas galerias cabem numa requisição. O limite existe porque o `in (...)`
 * viaja na URL: uma vitrine grande rolada de ponta a ponta estouraria o
 * tamanho de URL que o servidor aceita.
 */
const MAX_LOTE_GALERIA = 30;

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
  /** Ausentes enquanto a migração de curadoria correspondente não rodou. */
  is_featured?: boolean | null;
  force_new?: boolean | null;
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
    forceNew: r.force_new === true,
    isFeatured: r.is_featured === true,
    createdAt: r.created_at ?? undefined,
  };
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStockMap] = useState<Record<string, SizeStock>>({});
  const [loading, setLoading] = useState(true);
  const [missingColumns, setMissingColumns] = useState<OptionalColumn[]>([]);

  // Quais peças já tiveram a galeria buscada. Fica em ref, e não em estado,
  // para que duas chamadas seguidas (passar o mouse e clicar) não disparem
  // duas requisições por causa de closure desatualizada.
  const galleryRequested = useRef<Record<string, boolean>>({});

  // Fila do lote de galerias (ver `loadGallery`).
  const fila = useRef<Set<string>>(new Set());
  const loteAgendado = useRef<number | null>(null);
  const loteEmEspera = useRef<Promise<void> | null>(null);
  const resolverLote = useRef<(() => void) | null>(null);

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

    // Escada: pede tudo e, a cada "coluna não existe", derruba a culpada e
    // tenta de novo. O Postgres nomeia a coluna na mensagem; quando não der
    // para identificar, cai a primeira da lista — o laço termina do mesmo
    // jeito, no pior caso sem nenhuma coluna opcional.
    let opcionais: OptionalColumn[] = [...OPTIONAL_COLUMNS];
    const ausentes: OptionalColumn[] = [];
    let { data, error } = await buscar([LIST_COLUMNS_BASE, ...opcionais].join(","));

    while (error && isMissingColumn(error) && opcionais.length) {
      const culpada = opcionais.find((c) => (error?.message ?? "").includes(c)) ?? opcionais[0];
      console.warn(`[catalog] coluna ${culpada} ausente — rode a migração de curadoria`);
      ausentes.push(culpada);
      opcionais = opcionais.filter((c) => c !== culpada);
      ({ data, error } = await buscar([LIST_COLUMNS_BASE, ...opcionais].join(",")));
    }

    setMissingColumns(ausentes);
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

  /**
   * Busca as galerias em lote.
   *
   * A grade pede a galeria de cada card que se aproxima da tela, e antes cada
   * pedido virava uma requisição própria: rolar a vitrine disparava dezenas
   * delas, em fila, e a foto de hover só chegava depois da sua vez. Os pedidos
   * feitos no mesmo instante viram um `in (...)` só.
   */
  const executarLote = useCallback(async () => {
    loteAgendado.current = null;
    const ids = [...fila.current];
    fila.current.clear();
    const concluir = resolverLote.current;
    resolverLote.current = null;
    loteEmEspera.current = null;
    if (!ids.length) {
      concluir?.();
      return;
    }

    const { data, error } = await supabase
      .from("products")
      .select("id,gallery,long_description")
      .in("id", ids);

    if (error || !data) {
      // Libera para tentar de novo — pode ter sido só uma falha de rede.
      for (const id of ids) galleryRequested.current[id] = false;
      if (error) console.error("[catalog] loadGallery failed", error);
      concluir?.();
      return;
    }

    const linhas = data as unknown as Array<{
      id: string;
      gallery?: unknown;
      long_description?: string | null;
    }>;
    const porId = new Map(linhas.map((r) => [r.id, r]));

    setProducts((prev) =>
      prev.map((p) => {
        const row = porId.get(p.id);
        if (!row) return p;
        const gal = Array.isArray(row.gallery)
          ? (row.gallery as unknown[]).filter((g): g is string => typeof g === "string")
          : [];
        return {
          ...p,
          gallery: gal.length ? gal : p.gallery,
          longDescription: row.long_description ?? p.longDescription,
        };
      }),
    );
    concluir?.();
  }, []);

  const loadGallery: CatalogCtx["loadGallery"] = useCallback(
    (id) => {
      if (!id || galleryRequested.current[id]) return Promise.resolve();
      galleryRequested.current[id] = true;
      fila.current.add(id);

      if (!loteEmEspera.current) {
        loteEmEspera.current = new Promise<void>((r) => {
          resolverLote.current = r;
        });
      }
      // Lote cheio parte na hora; o resto espera um quadro para juntar o que
      // vier junto (a grade inteira entrando na tela de uma vez).
      if (fila.current.size >= MAX_LOTE_GALERIA) {
        if (loteAgendado.current) window.clearTimeout(loteAgendado.current);
        void executarLote();
      } else if (loteAgendado.current === null) {
        loteAgendado.current = window.setTimeout(() => void executarLote(), 16);
      }
      return loteEmEspera.current;
    },
    [executarLote],
  );

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
    // Coluna que o banco ainda não tem fica de fora: mandá-la faria o UPDATE
    // inteiro voltar 400, e o admin perderia também o nome e o preço que
    // acabou de digitar.
    if (patch.forceNew !== undefined && !missingColumns.includes("force_new")) {
      dbPatch.force_new = patch.forceNew === true;
    }
    if (patch.isFeatured !== undefined && !missingColumns.includes("is_featured")) {
      dbPatch.is_featured = patch.isFeatured === true;
    }

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
    return isMissingColumn(error)
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
      ...(missingColumns.includes("force_new") ? {} : { force_new: p.forceNew === true }),
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
        missingColumns,
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
