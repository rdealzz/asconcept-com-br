import { createFileRoute } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  User as UserIcon,
  ShoppingBag,
  X,
  Plus,
  Minus,
  LogOut,
  Shield,
  Pencil,
  Save,
  RotateCcw,
} from "lucide-react";
import { CartProvider, useCart, formatBRL, type Product } from "@/lib/cart-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ShippingCalculator, FreeShippingHint } from "@/components/ShippingCalculator";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";

import hero from "@/assets/hero.jpg";
import editorial from "@/assets/editorial.jpg";
import p1 from "@/assets/product-1.jpg";
import p2 from "@/assets/product-2.jpg";
import p3 from "@/assets/product-3.jpg";
import p4 from "@/assets/product-4.jpg";
import p5 from "@/assets/product-5.jpg";
import p6 from "@/assets/product-6.jpg";
import p7 from "@/assets/product-7.jpg";
import p8 from "@/assets/product-8.jpg";

export const Route = createFileRoute("/")({
  component: Index,
});

const SIZES = ["P", "M", "G", "GG"] as const;

const DEFAULT_PRODUCTS: Product[] = [
  { id: "1", name: "Camisa de Linho Cornwall", description: "Linho italiano acabado à mão. Modelagem relaxada.", longDescription: "Confeccionada em linho italiano de fio longo, a camisa Cornwall combina caimento fluido com detalhes artesanais. Botões de madrepérola natural, pespontos internos e barra levemente arredondada.", price: 1590, image: p1, gallery: [p1] },
  { id: "2", name: "Suéter de Cashmere Kensington", description: "Cashmere puro da Mongólia em azul meia-noite.", longDescription: "Tricô fino em cashmere mongol grade A, com toque sedoso e caimento estruturado. Gola careca ribana, punhos e barra em canelado clássico.", price: 3290, image: p2, gallery: [p2] },
  { id: "3", name: "Blazer Trespassado Mayfair", description: "Lã com lapela pico, alfaiataria napolitana.", longDescription: "Alfaiataria napolitana em lã super 120, com lapela pico, ombro natural e forro em cupro. Bolsos flap com lenço interno, três botões forrados.", price: 7890, image: p3, gallery: [p3] },
  { id: "4", name: "Calça de Prega Windsor", description: "Cintura alta em crepe de lã marfim.", longDescription: "Cintura alta com pregas duplas, corte reto e caimento fluido. Confeccionada em crepe de lã fresca, com bolsos italianos e fivela lateral discreta.", price: 2590, image: p4, gallery: [p4] },
  { id: "5", name: "Lenço de Seda Saint-Tropez", description: "Twill de seda com bainha rolada à mão, estampado em Como.", longDescription: "Sarja de seda 100% italiana, estampada digitalmente em Como e finalizada com bainha rolada à mão.", price: 1850, image: p5, gallery: [p5] },
  { id: "6", name: "Mocassim Belgrave", description: "Couro de bezerro costurado Blake, conhaque.", longDescription: "Mocassim penny loafer em couro de bezerro full-grain, montagem Blake e solado em couro. Forro interno em pelica.", price: 4290, image: p6, gallery: [p6] },
  { id: "7", name: "Polo Trançado Hampton", description: "Algodão egípcio com costuras finalizadas à mão.", longDescription: "Malha piquê em algodão egípcio de fibra longa, com padronagem trançada exclusiva.", price: 2190, image: p7, gallery: [p7] },
  { id: "8", name: "Lenço de Bolso Belgravia", description: "Seda doze dobras, ourela marfim.", longDescription: "Lenço de bolso em seda dobrada doze vezes à mão, com bainha em contraste marfim.", price: 790, image: p8, gallery: [p8] },
];

const DEFAULT_STOCK: Record<string, number> = {
  "1": 5, "2": 3, "3": 1, "4": 0, "5": 8, "6": 2, "7": 1, "8": 4,
};

const PRODUCTS_KEY = "as_products";
const STOCK_KEY = "as_stock";

function useIsAdmin() {
  const { user } = useAuth();
  return !!user?.isAdmin;
}

/* ---------- Catalog Context (products + stock, persisted) ---------- */
type CatalogCtx = {
  products: Product[];
  stock: Record<string, number>;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  setStock: (id: string, qty: number) => void;
  decrementStock: (id: string, by?: number) => void;
  resetCatalog: () => void;
};
const CatalogContext = createContext<CatalogCtx | null>(null);

function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [stock, setStockMap] = useState<Record<string, number>>(DEFAULT_STOCK);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawP = localStorage.getItem(PRODUCTS_KEY);
      if (rawP) {
        const stored: Product[] = JSON.parse(rawP);
        // merge with defaults so new default products still appear
        const map = new Map(DEFAULT_PRODUCTS.map((p) => [p.id, p]));
        stored.forEach((p) => map.set(p.id, { ...map.get(p.id), ...p } as Product));
        setProducts(Array.from(map.values()));
      }
      const rawS = localStorage.getItem(STOCK_KEY);
      if (rawS) setStockMap({ ...DEFAULT_STOCK, ...JSON.parse(rawS) });
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
      localStorage.setItem(STOCK_KEY, JSON.stringify(stock));
    } catch {}
  }, [products, stock, hydrated]);

  const updateProduct = (id: string, patch: Partial<Product>) =>
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const setStock = (id: string, qty: number) =>
    setStockMap((prev) => ({ ...prev, [id]: Math.max(0, Math.floor(qty)) }));

  const decrementStock = (id: string, by = 1) =>
    setStockMap((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) - by) }));

  const resetCatalog = () => {
    setProducts(DEFAULT_PRODUCTS);
    setStockMap(DEFAULT_STOCK);
  };

  return (
    <CatalogContext.Provider
      value={{ products, stock, updateProduct, setStock, decrementStock, resetCatalog }}
    >
      {children}
    </CatalogContext.Provider>
  );
}
function useCatalog() {
  const c = useContext(CatalogContext);
  if (!c) throw new Error("CatalogProvider missing");
  return c;
}

/* ---------- Search Context ---------- */
type SearchCtx = {
  query: string;
  setQuery: (q: string) => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
};
const SearchContext = createContext<SearchCtx | null>(null);
function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [isOpen, setOpen] = useState(false);
  return (
    <SearchContext.Provider
      value={{ query, setQuery, isOpen, open: () => setOpen(true), close: () => setOpen(false) }}
    >
      {children}
    </SearchContext.Provider>
  );
}
function useSearch() {
  const c = useContext(SearchContext);
  if (!c) throw new Error("SearchProvider missing");
  return c;
}

function Index() {
  return (
    <AuthProvider>
      <CartProvider>
        <CatalogProvider>
          <SearchProvider>
            <ProductProvider>
              <div className="min-h-screen bg-background text-foreground">
                <Nav />
                <Hero />
                <Products />
                <Concept />
                <Newsletter />
                <Footer />
                <CartDrawer />
                <ProductModal />
                <AuthModal />
                <SearchOverlay />
                <AdminEditModal />
              </div>
            </ProductProvider>
          </SearchProvider>
        </CatalogProvider>
      </CartProvider>
    </AuthProvider>
  );
}

/* ---------- Product Modal Context ---------- */
const ProductCtx = createContext<{
  activeId: string | null;
  open: (id: string) => void;
  close: () => void;
  editingId: string | null;
  openEdit: (id: string) => void;
  closeEdit: () => void;
} | null>(null);

function ProductProvider({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <ProductCtx.Provider
      value={{
        activeId,
        open: (id) => setActiveId(id),
        close: () => setActiveId(null),
        editingId,
        openEdit: (id) => setEditingId(id),
        closeEdit: () => setEditingId(null),
      }}
    >
      {children}
    </ProductCtx.Provider>
  );
}
function useProduct() {
  const c = useContext(ProductCtx);
  if (!c) throw new Error("ProductProvider missing");
  return c;
}

/* ---------- Nav ---------- */
function Nav() {
  const { open, count } = useCart();
  const { user, openAuth, signOut } = useAuth();
  const { open: openSearch } = useSearch();
  const isAdmin = useIsAdmin();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-500 ${
        scrolled ? "bg-background/90 backdrop-blur border-b border-border" : "bg-transparent"
      }`}
    >
      <div className="mx-auto grid max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center px-6 py-5 md:px-12">
        <nav
          className={`hidden items-center gap-8 text-[11px] tracking-luxe uppercase md:flex ${
            scrolled ? "text-foreground" : "text-ivory"
          }`}
        >
          <a href="#collections" className="hover:text-accent transition-colors">Coleção</a>
          <a href="#edit" className="hover:text-accent transition-colors">O Editorial</a>
          <a href="#about" className="hover:text-accent transition-colors">Sobre</a>
        </nav>
        <a
          href="#"
          className={`font-serif text-xl md:text-2xl tracking-wider text-center whitespace-nowrap ${
            scrolled ? "text-foreground" : "text-ivory"
          }`}
        >
          A<span className="text-accent">&amp;</span>S Concept
        </a>
        <div
          className={`flex items-center justify-end gap-5 ${
            scrolled ? "text-foreground" : "text-ivory"
          }`}
        >
          <button
            aria-label="Buscar"
            onClick={openSearch}
            className="hover:text-accent transition-colors"
          >
            <Search className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {user ? (
            <button
              onClick={() => signOut()}
              aria-label="Sair"
              title={`${user.email}${isAdmin ? " · Admin" : ""}`}
              className="hidden hover:text-accent transition-colors sm:block"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
            </button>
          ) : (
            <button
              onClick={openAuth}
              aria-label="Conta"
              className="hidden hover:text-accent transition-colors sm:block"
            >
              <UserIcon className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
          <button
            aria-label="Sacola"
            onClick={open}
            className="relative hover:text-accent transition-colors"
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={1.5} />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-charcoal">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */
function Hero() {
  return (
    <section className="relative h-[100svh] w-full overflow-hidden">
      <img
        src={hero}
        alt="Editorial A&S Concept"
        width={1920}
        height={1280}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-charcoal/40 via-charcoal/20 to-charcoal/70" />
      <div className="relative z-10 flex h-full items-end pb-20 md:items-center md:pb-0">
        <div className="mx-auto max-w-[1600px] w-full px-6 md:px-12">
          <div className="max-w-2xl animate-fade-up text-ivory">
            <p className="mb-6 text-[11px] tracking-luxe uppercase text-accent">
              — Coleção Outono / Inverno
            </p>
            <h1 className="font-serif text-5xl leading-[1.02] md:text-7xl lg:text-[6rem]">
              A Nova Era<br />da Herança.
            </h1>
            <p className="mt-8 max-w-md text-base md:text-lg font-light text-ivory/85">
              Luxo curado para a próxima geração.
            </p>
            <a
              href="#collections"
              className="group mt-12 inline-flex items-center gap-4 border border-ivory/70 px-10 py-4 text-[11px] tracking-luxe uppercase text-ivory transition-all duration-500 hover:border-accent hover:text-accent"
            >
              Explorar a Coleção
              <span className="inline-block h-px w-8 bg-current transition-all duration-500 group-hover:w-12" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Products ---------- */
function Products() {
  const { query, setQuery } = useSearch();
  const { products, resetCatalog } = useCatalog();
  const isAdmin = useIsAdmin();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.longDescription ?? "").toLowerCase().includes(q),
    );
  }, [query, products]);

  return (
    <section id="collections" className="py-28 md:py-40">
      <div className="mx-auto max-w-[1600px] px-6 md:px-12">
        <div className="mb-16 flex flex-col items-center text-center md:mb-24">
          <p className="mb-4 text-[11px] tracking-luxe uppercase text-accent">A Coleção</p>
          <h2 className="font-serif text-4xl md:text-6xl">Essenciais com Propósito</h2>
          <p className="mt-6 max-w-xl text-sm md:text-base text-muted-foreground font-light">
            Peças atemporais, produzidas em pequenas séries por ateliês tradicionais europeus.
          </p>
          {query && (
            <div className="mt-8 flex items-center gap-3 border border-border px-4 py-2 text-xs">
              <span className="text-muted-foreground">Buscando por</span>
              <span className="font-serif italic">“{query}”</span>
              <button
                onClick={() => setQuery("")}
                className="ml-2 text-muted-foreground hover:text-accent"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {isAdmin && (
            <button
              onClick={() => {
                if (confirm("Restaurar catálogo original? Todas as edições serão perdidas."))
                  resetCatalog();
              }}
              className="mt-6 inline-flex items-center gap-2 border border-accent/50 px-3 py-1.5 text-[10px] tracking-luxe uppercase text-accent hover:bg-accent/10 transition-colors"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.5} /> Restaurar catálogo
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="mx-auto max-w-lg py-16 text-center">
            <p className="font-serif text-2xl">Nenhum produto encontrado para “{query}”.</p>
            <p className="mt-4 text-sm text-muted-foreground font-light">
              Tente outra palavra-chave ou explore a coleção completa.
            </p>
            <button
              onClick={() => setQuery("")}
              className="mt-8 border border-foreground px-8 py-3 text-[11px] tracking-luxe uppercase transition-colors hover:bg-foreground hover:text-ivory"
            >
              Ver toda a coleção
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-16 md:grid-cols-3 md:gap-x-8 lg:grid-cols-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StockBadge({ qty }: { qty: number }) {
  if (qty === 0)
    return (
      <span className="inline-flex items-center border border-destructive/60 bg-destructive/10 px-2 py-1 text-[10px] tracking-luxe uppercase text-destructive">
        Esgotado
      </span>
    );
  if (qty === 1)
    return (
      <span className="inline-flex items-center gap-1 border border-accent/70 bg-accent/10 px-2 py-1 text-[10px] tracking-luxe uppercase text-accent">
        ⚠️ Última unidade
      </span>
    );
  return null;
}

function ProductCard({ product }: { product: Product }) {
  const { open, openEdit } = useProduct();
  const { stock } = useCatalog();
  const isAdmin = useIsAdmin();
  const qty = stock[product.id] ?? 0;
  const soldOut = qty === 0;

  return (
    <article className="group flex flex-col">
      <div
        className={`relative aspect-[3/4] w-full overflow-hidden bg-secondary ${
          soldOut ? "" : "cursor-pointer"
        }`}
        onClick={() => !soldOut && open(product.id)}
      >
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          width={900}
          height={1200}
          className={`h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06] ${
            soldOut ? "opacity-60 grayscale" : ""
          }`}
        />
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          <StockBadge qty={qty} />
        </div>
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEdit(product.id);
            }}
            aria-label="Editar produto"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center border border-accent/70 bg-background/90 text-accent shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-ivory"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
        {soldOut ? (
          <div className="absolute inset-x-4 bottom-4 border border-ivory/40 bg-charcoal/80 py-3 text-center text-[10px] tracking-luxe uppercase text-ivory/80 backdrop-blur-sm">
            Produto Esgotado
          </div>
        ) : (
          <div className="absolute inset-x-4 bottom-4 translate-y-6 border border-ivory/80 bg-charcoal/70 py-3 text-center text-[10px] tracking-luxe uppercase text-ivory opacity-0 backdrop-blur-sm transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
            Ver Produto
          </div>
        )}
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-serif text-base md:text-lg leading-tight">{product.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground font-light line-clamp-1">
            {product.description}
          </p>
        </div>
        <span className="shrink-0 text-xs md:text-sm tabular-nums">{formatBRL(product.price)}</span>
      </div>
      {isAdmin && (
        <p className="mt-2 text-[10px] tracking-luxe uppercase text-muted-foreground">
          Estoque: <span className="text-accent">{qty}</span>
        </p>
      )}
    </article>
  );
}

/* ---------- Product Modal ---------- */
function ProductModal() {
  const { activeId, close } = useProduct();
  const { add } = useCart();
  const { products, stock, decrementStock } = useCatalog();
  const [size, setSize] = useState<string>("M");
  const [activeImg, setActiveImg] = useState(0);
  const active = activeId ? products.find((p) => p.id === activeId) ?? null : null;

  useEffect(() => {
    setSize("M");
    setActiveImg(0);
  }, [activeId]);

  if (!active) return null;
  const gallery = active.gallery && active.gallery.length ? active.gallery : [active.image];
  const qty = stock[active.id] ?? 0;
  const soldOut = qty === 0;

  return (
    <>
      <div
        onClick={close}
        className="fixed inset-0 z-[80] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 md:p-8 pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-500">
          <button
            onClick={close}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-10 rounded-full bg-background/80 p-2 backdrop-blur hover:text-accent"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="bg-secondary">
              <div className="aspect-[3/4] w-full overflow-hidden">
                <img
                  src={gallery[activeImg]}
                  alt={active.name}
                  className="h-full w-full object-cover transition-opacity duration-500"
                />
              </div>
              {gallery.length > 1 && (
                <div className="flex gap-2 p-3">
                  {gallery.map((g, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      className={`h-20 w-16 overflow-hidden border transition-all ${
                        activeImg === i ? "border-accent" : "border-transparent opacity-70"
                      }`}
                    >
                      <img src={g} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col p-8 md:p-12">
              <p className="text-[11px] tracking-luxe uppercase text-accent">A&amp;S Concept</p>
              <h2 className="mt-3 font-serif text-3xl md:text-4xl leading-tight">{active.name}</h2>
              <p className="mt-3 text-lg tabular-nums">{formatBRL(active.price)}</p>
              <div className="mt-3"><StockBadge qty={qty} /></div>
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground font-light">
                {active.longDescription ?? active.description}
              </p>

              <div className="mt-8">
                <p className="mb-3 text-[11px] tracking-luxe uppercase text-muted-foreground">
                  Tamanho
                </p>
                <div className="flex gap-2">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={`h-11 w-14 border text-sm transition-all ${
                        size === s
                          ? "border-foreground bg-foreground text-ivory"
                          : "border-border hover:border-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  if (soldOut) return;
                  add(active, size);
                  decrementStock(active.id, 1);
                  close();
                }}
                disabled={soldOut}
                className="mt-10 bg-charcoal py-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                {soldOut ? "Produto Esgotado" : "Adicionar à Sacola"}
              </button>

              <div className="mt-8">
                <ShippingCalculator subtotal={active.price} />
              </div>

              <div className="mt-8 space-y-2 border-t border-border pt-6 text-xs font-light text-muted-foreground">
                <p>Frete grátis em pedidos acima de {formatBRL(FREE_SHIPPING_THRESHOLD)}.</p>
                <p>Trocas e ajustes cortesia em até 30 dias.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Admin Edit Modal ---------- */
function AdminEditModal() {
  const { editingId, closeEdit } = useProduct();
  const { products, updateProduct, stock, setStock } = useCatalog();
  const isAdmin = useIsAdmin();
  const product = editingId ? products.find((p) => p.id === editingId) ?? null : null;

  const [form, setForm] = useState({
    name: "",
    description: "",
    longDescription: "",
    price: 0,
    image: "",
    gallery: "",
    stock: 0,
  });

  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name,
      description: product.description,
      longDescription: product.longDescription ?? "",
      price: product.price,
      image: product.image,
      gallery: (product.gallery ?? [product.image]).join("\n"),
      stock: stock[product.id] ?? 0,
    });
  }, [product, stock]);

  if (!isAdmin || !product) return null;

  const onSave = () => {
    const gallery = form.gallery
      .split("\n")
      .map((g) => g.trim())
      .filter(Boolean);
    updateProduct(product.id, {
      name: form.name.trim() || product.name,
      description: form.description.trim(),
      longDescription: form.longDescription.trim() || undefined,
      price: Math.max(0, Number(form.price) || 0),
      image: form.image.trim() || product.image,
      gallery: gallery.length ? gallery : [form.image.trim() || product.image],
    });
    setStock(product.id, Math.max(0, Math.floor(Number(form.stock) || 0)));
    closeEdit();
  };

  return (
    <>
      <div
        onClick={closeEdit}
        className="fixed inset-0 z-[100] bg-charcoal/80 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-500">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent" strokeWidth={1.5} />
              <p className="text-[11px] tracking-luxe uppercase text-accent">Editor · Admin</p>
            </div>
            <button onClick={closeEdit} aria-label="Fechar" className="hover:text-accent">
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-[160px_1fr]">
            <div>
              <div className="aspect-[3/4] w-full overflow-hidden border border-border bg-secondary">
                <img src={form.image || product.image} alt="" className="h-full w-full object-cover" />
              </div>
              <p className="mt-2 text-[10px] tracking-luxe uppercase text-muted-foreground">
                Prévia
              </p>
            </div>

            <div className="space-y-4">
              <Field label="Nome do produto">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Descrição curta">
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Descrição longa">
                <textarea
                  value={form.longDescription}
                  onChange={(e) => setForm({ ...form, longDescription: e.target.value })}
                  rows={4}
                  className="w-full border border-border bg-transparent p-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Preço (R$)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm tabular-nums outline-none focus:border-accent"
                  />
                </Field>
                <Field label="Estoque">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                    className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm tabular-nums outline-none focus:border-accent"
                  />
                </Field>
              </div>
              <Field label="Foto principal (URL)">
                <input
                  value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value })}
                  placeholder="https://..."
                  className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Galeria (uma URL por linha)">
                <textarea
                  value={form.gallery}
                  onChange={(e) => setForm({ ...form, gallery: e.target.value })}
                  rows={3}
                  className="w-full border border-border bg-transparent p-2 text-xs font-mono outline-none focus:border-accent"
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            <button
              onClick={closeEdit}
              className="border border-border px-6 py-2.5 text-[11px] tracking-luxe uppercase hover:bg-secondary transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onSave}
              className="inline-flex items-center gap-2 bg-accent px-6 py-2.5 text-[11px] tracking-luxe uppercase text-charcoal transition-colors hover:bg-accent/90"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={1.5} /> Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

/* ---------- Concept ---------- */
function Concept() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="edit" ref={ref} className="bg-navy text-ivory">
      <div className="grid min-h-[80vh] grid-cols-1 md:grid-cols-2">
        <div className="relative overflow-hidden">
          <img
            src={editorial}
            alt="Editorial A&S Concept"
            loading="lazy"
            width={1200}
            height={1500}
            className={`h-full min-h-[60vh] w-full object-cover transition-all duration-[1600ms] ${
              visible ? "scale-100 opacity-100" : "scale-105 opacity-80"
            }`}
          />
        </div>
        <div className="flex items-center px-8 py-24 md:px-16 lg:px-24">
          <div
            className={`max-w-md transition-all duration-[1200ms] ${
              visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
          >
            <p className="mb-6 text-[11px] tracking-luxe uppercase text-accent">O Conceito</p>
            <h2 className="font-serif text-4xl md:text-5xl leading-[1.1]">
              Uma elegância silenciosa, herdada e reinterpretada.
            </h2>
            <p className="mt-8 text-sm md:text-base leading-relaxed text-ivory/75 font-light">
              A&amp;S Concept é um estudo de contenção — um guarda-roupa moderno traçado a partir
              dos códigos do old money, feito para uma geração que valoriza a discrição acima da
              ostentação.
            </p>
            <p className="mt-6 text-sm md:text-base leading-relaxed text-ivory/75 font-light">
              Não perseguimos estações. Construímos uma biblioteca.
            </p>
            <a
              href="#about"
              className="group mt-12 inline-flex items-center gap-4 text-[11px] tracking-luxe uppercase text-ivory hover:text-accent transition-colors"
            >
              A Filosofia
              <span className="inline-block h-px w-8 bg-current transition-all duration-500 group-hover:w-12" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Newsletter ---------- */
function Newsletter() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <section id="about" className="py-32 md:py-44">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <p className="mb-6 text-[11px] tracking-luxe uppercase text-accent">Membership</p>
        <h2 className="font-serif text-4xl md:text-6xl leading-tight">
          Entre para o Clube<br />
          <em className="font-normal not-italic text-accent md:italic">(Somente por Convite)</em>
        </h2>
        <p className="mx-auto mt-8 max-w-md text-sm md:text-base text-muted-foreground font-light">
          Prévias privadas, histórias dos ateliês e acesso antecipado às edições limitadas.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
          className="mx-auto mt-12 flex max-w-md items-center border-b border-foreground/40 pb-2 transition-colors focus-within:border-accent"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <button className="text-[11px] tracking-luxe uppercase hover:text-accent transition-colors">
            {sent ? "Recebido" : "Solicitar Convite"}
          </button>
        </form>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  const cols = [
    { title: "Maison", links: ["Nossa História", "Ateliês", "Craftsmanship", "Sustentabilidade"] },
    { title: "Serviço", links: ["Concierge", "Envio", "Trocas", "Ajustes"] },
    { title: "Descobrir", links: ["O Editorial", "Journal", "Lookbook", "Revendedores"] },
    { title: "Conectar", links: ["Instagram", "Contato", "Carreiras", "Imprensa"] },
  ];
  return (
    <footer className="border-t border-border bg-charcoal text-ivory">
      <div className="mx-auto max-w-[1600px] px-6 py-20 md:px-12">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="font-serif text-2xl">
              A<span className="text-accent">&amp;</span>S
            </div>
            <p className="mt-4 max-w-[220px] text-xs font-light leading-relaxed text-ivory/60">
              Luxo curado para a próxima geração. Estabelecido com propósito.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="mb-5 text-[11px] tracking-luxe uppercase text-accent">{c.title}</h4>
              <ul className="space-y-3">
                {c.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#"
                      className="text-xs font-light text-ivory/70 transition-colors hover:text-ivory"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col justify-between gap-4 border-t border-ivory/10 pt-8 text-[11px] text-ivory/50 md:flex-row">
          <p>© {new Date().getFullYear()} A&amp;S Concept. Todos os direitos reservados.</p>
          <p className="tracking-luxe uppercase">Feito com propósito · Preços em BRL</p>
        </div>
      </div>
    </footer>
  );
}

/* ---------- Cart Drawer ---------- */
function CartDrawer() {
  const { isOpen, close, items, remove, updateQty, subtotal, count } = useCart();
  const { user, openAuth } = useAuth();
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);

  const onCheckout = () => {
    if (!user) {
      setCheckoutMsg("Você precisa entrar ou criar uma conta para finalizar a compra.");
      close();
      openAuth();
      return;
    }
    setCheckoutMsg("Redirecionando para o pagamento...");
  };

  return (
    <>
      <div
        onClick={close}
        className={`fixed inset-0 z-[60] bg-charcoal/60 backdrop-blur-sm transition-opacity duration-500 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col bg-background shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">Sua Sacola</p>
            <h3 className="font-serif text-xl">
              {count} {count === 1 ? "Peça" : "Peças"}
            </h3>
          </div>
          <button onClick={close} aria-label="Fechar" className="hover:text-accent">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border">
                <ShoppingBag className="h-8 w-8 text-muted-foreground" strokeWidth={1} />
              </div>
              <p className="mt-6 font-serif text-xl">Seu carrinho está vazio.</p>
              <p className="mt-3 max-w-[260px] text-sm font-light text-muted-foreground">
                Que tal adicionar alguns produtos? Uma seleção curada aguarda por você.
              </p>
              <button
                onClick={close}
                className="mt-8 bg-charcoal px-8 py-3 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy"
              >
                Continuar Comprando
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6 rounded-sm border border-border/60 bg-secondary/40 p-4">
                <FreeShippingHint subtotal={subtotal} />
              </div>
              <ul className="space-y-6">
                {items.map((i) => (
                  <li
                    key={`${i.id}-${i.size}`}
                    className="flex gap-4 border-b border-border pb-6 last:border-0"
                  >
                    <img src={i.image} alt={i.name} className="h-28 w-20 object-cover" />
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-serif text-base leading-tight">{i.name}</h4>
                        <button
                          onClick={() => remove(i.id, i.size)}
                          aria-label="Remover"
                          className="text-muted-foreground hover:text-accent"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Tamanho {i.size}</p>
                      <div className="mt-auto flex items-center justify-between">
                        <div className="flex items-center border border-border">
                          <button
                            onClick={() => updateQty(i.id, i.size, -1)}
                            aria-label="Diminuir"
                            className="flex h-8 w-8 items-center justify-center hover:bg-secondary transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center text-sm tabular-nums">{i.qty}</span>
                          <button
                            onClick={() => updateQty(i.id, i.size, 1)}
                            aria-label="Aumentar"
                            className="flex h-8 w-8 items-center justify-center hover:bg-secondary transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="text-sm tabular-nums">{formatBRL(i.price * i.qty)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <ShippingCalculator subtotal={subtotal} />
              </div>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="space-y-4 border-t border-border px-6 py-6">
            <div className="flex items-center justify-between">
              <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">
                Subtotal
              </span>
              <span className="font-serif text-xl tabular-nums">{formatBRL(subtotal)}</span>
            </div>
            <p className="text-[11px] font-light text-muted-foreground">
              Frete grátis para pedidos acima de {formatBRL(FREE_SHIPPING_THRESHOLD)}. Impostos
              calculados no checkout.
            </p>
            {checkoutMsg && <p className="text-[11px] text-accent">{checkoutMsg}</p>}
            <button
              onClick={onCheckout}
              className="w-full bg-charcoal py-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy"
            >
              {user ? "Finalizar Compra" : "Entrar para Finalizar"}
            </button>
            {!user && (
              <p className="text-center text-[10px] text-muted-foreground">
                É necessário estar autenticado para prosseguir ao pagamento.
              </p>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

/* ---------- Search Overlay ---------- */
function SearchOverlay() {
  const { isOpen, close, query, setQuery } = useSearch();
  const [term, setTerm] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTerm(query);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, query]);

  if (!isOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(term.trim());
    close();
    document.getElementById("collections")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <div
        onClick={close}
        className="fixed inset-0 z-[80] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-x-0 top-0 z-[90] animate-in slide-in-from-top duration-500">
        <div className="bg-background shadow-2xl">
          <div className="mx-auto max-w-3xl px-6 py-10 md:py-14">
            <div className="flex items-center justify-between">
              <p className="text-[11px] tracking-luxe uppercase text-accent">Buscar</p>
              <button onClick={close} aria-label="Fechar" className="hover:text-accent">
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <form onSubmit={submit} className="mt-6 flex items-center gap-4 border-b border-foreground/40 pb-3 focus-within:border-accent transition-colors">
              <Search className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <input
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Ex: cashmere, blazer, mocassim..."
                className="flex-1 bg-transparent py-2 font-serif text-2xl md:text-3xl outline-none placeholder:text-muted-foreground/50"
              />
              <button
                type="submit"
                className="text-[11px] tracking-luxe uppercase hover:text-accent transition-colors"
              >
                Buscar
              </button>
            </form>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Pressione Enter para pesquisar na coleção.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Auth Modal ---------- */
function AuthModal() {
  const { isOpen, closeAuth, signIn, signUp, user } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && isOpen) closeAuth();
  }, [user, isOpen, closeAuth]);

  if (!isOpen) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } =
      mode === "login" ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (error) setError(error);
  };

  return (
    <>
      <div
        onClick={closeAuth}
        className="fixed inset-0 z-[80] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-md bg-background p-8 md:p-10 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
          <button
            onClick={closeAuth}
            aria-label="Fechar"
            className="absolute right-4 top-4 hover:text-accent"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="text-[11px] tracking-luxe uppercase text-accent">
            {mode === "login" ? "Bem-vindo de volta" : "Nova conta"}
          </p>
          <h2 className="mt-2 font-serif text-3xl">
            {mode === "login" ? "Entrar" : "Criar Conta"}
          </h2>
          <p className="mt-2 text-sm font-light text-muted-foreground">
            {mode === "login"
              ? "Acesse sua conta para finalizar a compra."
              : "Registre-se para prosseguir com o pagamento e envio."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                E-mail
              </label>
              <input
                type="text"
                required
                autoComplete={mode === "login" ? "username" : "email"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Senha
              </label>
              <input
                type="password"
                required
                minLength={4}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent transition-colors"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-charcoal py-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy disabled:opacity-50"
            >
              {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar Conta"}
            </button>
          </form>

          <div className="mt-6 text-center text-xs font-light text-muted-foreground">
            {mode === "login" ? (
              <>
                Não tem uma conta?{" "}
                <button
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className="text-foreground hover:text-accent underline underline-offset-4"
                >
                  Criar conta
                </button>
              </>
            ) : (
              <>
                Já tem uma conta?{" "}
                <button
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="text-foreground hover:text-accent underline underline-offset-4"
                >
                  Entrar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
