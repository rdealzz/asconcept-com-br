import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  Trash2,
  Upload,
  Sparkles,
} from "lucide-react";
import {
  useCart,
  formatBRL,
  type Product,
  type ProductCategory,
} from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
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
  { id: "1", category: "clothes", name: "Camisa de Linho Cornwall", description: "Linho italiano acabado à mão. Modelagem relaxada.", longDescription: "Confeccionada em linho italiano de fio longo, com botões de madrepérola natural e pespontos internos.", price: 1590, image: p1, gallery: [p1] },
  { id: "2", category: "clothes", name: "Suéter de Cashmere Kensington", description: "Cashmere puro da Mongólia em azul meia-noite.", longDescription: "Tricô fino em cashmere mongol grade A, com gola careca ribana e punhos em canelado.", price: 3290, image: p2, gallery: [p2] },
  { id: "3", category: "clothes", name: "Blazer Trespassado Mayfair", description: "Lã com lapela pico, alfaiataria napolitana.", longDescription: "Alfaiataria napolitana em lã super 120, com lapela pico, ombro natural e forro em cupro.", price: 7890, image: p3, gallery: [p3] },
  { id: "4", category: "clothes", name: "Calça de Prega Windsor", description: "Cintura alta em crepe de lã marfim.", longDescription: "Cintura alta com pregas duplas, corte reto e caimento fluido em crepe de lã fresca.", price: 2590, image: p4, gallery: [p4] },
  { id: "5", category: "clothes", name: "Lenço de Seda Saint-Tropez", description: "Twill de seda com bainha rolada à mão, estampado em Como.", longDescription: "Sarja de seda 100% italiana, estampada digitalmente em Como e finalizada com bainha rolada à mão.", price: 1850, image: p5, gallery: [p5] },
  { id: "6", category: "clothes", name: "Mocassim Belgrave", description: "Couro de bezerro costurado Blake, conhaque.", longDescription: "Mocassim penny loafer em couro de bezerro full-grain, com forro interno em pelica.", price: 4290, image: p6, gallery: [p6] },
  { id: "7", category: "clothes", name: "Polo Trançado Hampton", description: "Algodão egípcio com costuras finalizadas à mão.", longDescription: "Malha piquê em algodão egípcio de fibra longa, com padronagem trançada exclusiva.", price: 2190, image: p7, gallery: [p7] },
  { id: "8", category: "clothes", name: "Lenço de Bolso Belgravia", description: "Seda doze dobras, ourela marfim.", longDescription: "Lenço de bolso em seda dobrada doze vezes à mão, com bainha em contraste marfim.", price: 790, image: p8, gallery: [p8] },
];

const DEFAULT_STOCK: Record<string, number> = {
  "1": 5, "2": 3, "3": 1, "4": 0, "5": 8, "6": 2, "7": 1, "8": 4,
};

const PRODUCTS_KEY = "as_products_v2";
const STOCK_KEY = "as_stock_v2";
const SNEAKERS_LAUNCH = new Date("2026-09-01T00:00:00-03:00").getTime();

function useIsAdmin() {
  const { user } = useAuth();
  return !!user?.isAdmin;
}

/* ---------- Catalog Context ---------- */
type CatalogCtx = {
  products: Product[];
  stock: Record<string, number>;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  addProduct: (p: Product, qty: number) => void;
  deleteProduct: (id: string) => void;
  setStock: (id: string, qty: number) => void;
  decrementStock: (id: string, by?: number) => void;
  resetCatalog: () => void;
};
const CatalogContext = createContext<CatalogCtx | null>(null);

function loadProductsInitial(): Product[] {
  if (typeof window === "undefined") return DEFAULT_PRODUCTS;
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (raw) return JSON.parse(raw) as Product[];
  } catch {}
  // Primeiro acesso — grava o padrão de fábrica imediatamente para blindar contra F5.
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(DEFAULT_PRODUCTS));
  } catch {}
  return DEFAULT_PRODUCTS;
}

function loadStockInitial(): Record<string, number> {
  if (typeof window === "undefined") return DEFAULT_STOCK;
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    if (raw) return JSON.parse(raw) as Record<string, number>;
  } catch {}
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify(DEFAULT_STOCK));
  } catch {}
  return DEFAULT_STOCK;
}

function persistProducts(next: Product[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(next));
  } catch {}
}

function persistStock(next: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify(next));
  } catch {}
}

function CatalogProvider({ children }: { children: React.ReactNode }) {
  // Lazy init — carrega diretamente do localStorage evitando qualquer reset em F5.
  const [products, setProducts] = useState<Product[]>(loadProductsInitial);
  const [stock, setStockMap] = useState<Record<string, number>>(loadStockInitial);

  const commitProducts = (updater: (prev: Product[]) => Product[]) =>
    setProducts((prev) => {
      const next = updater(prev);
      persistProducts(next);
      return next;
    });

  const commitStock = (updater: (prev: Record<string, number>) => Record<string, number>) =>
    setStockMap((prev) => {
      const next = updater(prev);
      persistStock(next);
      return next;
    });

  const updateProduct = (id: string, patch: Partial<Product>) =>
    commitProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addProduct = (p: Product, qty: number) => {
    commitProducts((prev) => [...prev, p]);
    commitStock((prev) => ({ ...prev, [p.id]: Math.max(0, Math.floor(qty)) }));
  };

  const deleteProduct = (id: string) => {
    commitProducts((prev) => prev.filter((p) => p.id !== id));
    commitStock((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const setStock = (id: string, qty: number) =>
    commitStock((prev) => ({ ...prev, [id]: Math.max(0, Math.floor(qty)) }));

  const decrementStock = (id: string, by = 1) =>
    commitStock((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) - by) }));

  const resetCatalog = () => {
    commitProducts(() => DEFAULT_PRODUCTS);
    commitStock(() => DEFAULT_STOCK);
  };

  return (
    <CatalogContext.Provider
      value={{ products, stock, updateProduct, addProduct, deleteProduct, setStock, decrementStock, resetCatalog }}
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

/* ---------- Search + Tabs Context ---------- */
type SearchCtx = {
  query: string;
  setQuery: (q: string) => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  tab: ProductCategory;
  setTab: (t: ProductCategory) => void;
};
const SearchContext = createContext<SearchCtx | null>(null);
function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [tab, setTab] = useState<ProductCategory>("clothes");
  return (
    <SearchContext.Provider
      value={{
        query,
        setQuery,
        isOpen,
        open: () => setOpen(true),
        close: () => setOpen(false),
        tab,
        setTab,
      }}
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
    <CatalogProvider>
      <SearchProvider>
        <ProductProvider>
          <div className="min-h-screen bg-background text-foreground">
            <Nav />
            <Hero />
            <CategoryTabs />
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
  creatingCategory: ProductCategory | null;
  openCreate: (c: ProductCategory) => void;
} | null>(null);

function ProductProvider({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingCategory, setCreating] = useState<ProductCategory | null>(null);
  return (
    <ProductCtx.Provider
      value={{
        activeId,
        open: (id) => setActiveId(id),
        close: () => setActiveId(null),
        editingId,
        openEdit: (id) => {
          setEditingId(id);
          setCreating(null);
        },
        closeEdit: () => {
          setEditingId(null);
          setCreating(null);
        },
        creatingCategory,
        openCreate: (c) => {
          setCreating(c);
          setEditingId("__new__");
        },
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
          {isAdmin && (
            <span className="ml-2 hidden align-middle text-[9px] tracking-luxe uppercase text-accent md:inline">
              · Dev
            </span>
          )}
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

/* ---------- Category Tabs ---------- */
function CategoryTabs() {
  const { tab, setTab } = useSearch();
  return (
    <div id="collections" className="sticky top-[68px] z-40 border-y border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-center gap-2 px-6 py-4 md:gap-8 md:px-12">
        {(["clothes", "sneakers"] as ProductCategory[]).map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`relative px-4 py-2 text-[11px] tracking-luxe uppercase transition-colors ${
              tab === c ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c === "clothes" ? "Roupas" : "Sneakers"}
            {tab === c && (
              <span className="absolute inset-x-2 -bottom-[1px] h-[2px] bg-accent" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Products ---------- */
function Products() {
  const { query, setQuery, tab } = useSearch();
  const { products, resetCatalog } = useCatalog();
  const { openCreate } = useProduct();
  const isAdmin = useIsAdmin();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inTab = products.filter((p) => (p.category ?? "clothes") === tab);
    if (!q) return inTab;
    return inTab.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.longDescription ?? "").toLowerCase().includes(q),
    );
  }, [query, products, tab]);

  const showSneakersComingSoon = tab === "sneakers" && !isAdmin && filtered.length === 0;

  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-[1600px] px-6 md:px-12">
        <div className="mb-12 flex flex-col items-center text-center md:mb-20">
          <p className="mb-4 text-[11px] tracking-luxe uppercase text-accent">
            {tab === "clothes" ? "A Coleção" : "Sneakers"}
          </p>
          <h2 className="font-serif text-4xl md:text-6xl">
            {tab === "clothes" ? "Essenciais com Propósito" : "A Nova Cadência"}
          </h2>
          <p className="mt-6 max-w-xl text-sm md:text-base text-muted-foreground font-light">
            {tab === "clothes"
              ? "Peças atemporais, produzidas em pequenas séries por ateliês tradicionais europeus."
              : "Silhuetas contemporâneas, montadas artesanalmente em couros nobres."}
          </p>

          {query && (
            <div className="mt-8 flex items-center gap-3 border border-border px-4 py-2 text-xs">
              <span className="text-muted-foreground">Buscando por</span>
              <span className="font-serif italic">"{query}"</span>
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
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => openCreate(tab)}
                className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-[10px] tracking-luxe uppercase text-charcoal transition-colors hover:bg-accent/90"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Adicionar Novo Produto
              </button>
              <button
                onClick={() => {
                  if (confirm("Restaurar catálogo original? Todas as edições serão perdidas."))
                    resetCatalog();
                }}
                className="inline-flex items-center gap-2 border border-accent/50 px-3 py-2 text-[10px] tracking-luxe uppercase text-accent hover:bg-accent/10 transition-colors"
              >
                <RotateCcw className="h-3 w-3" strokeWidth={1.5} /> Restaurar catálogo
              </button>
            </div>
          )}
        </div>

        {showSneakersComingSoon ? (
          <SneakersComingSoon />
        ) : filtered.length === 0 ? (
          <div className="mx-auto max-w-lg py-16 text-center">
            <p className="font-serif text-2xl">
              {query
                ? `Nenhum produto encontrado para "${query}".`
                : "Nada por aqui ainda."}
            </p>
            <p className="mt-4 text-sm text-muted-foreground font-light">
              {query
                ? "Tente outra palavra-chave ou explore a coleção completa."
                : isAdmin
                  ? "Adicione o primeiro produto desta seção."
                  : "Volte em breve."}
            </p>
            {query && (
              <button
                onClick={() => setQuery("")}
                className="mt-8 border border-foreground px-8 py-3 text-[11px] tracking-luxe uppercase transition-colors hover:bg-foreground hover:text-ivory"
              >
                Ver toda a coleção
              </button>
            )}
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

/* ---------- Sneakers Coming Soon ---------- */
function useCountdown(target: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff / 3600000) % 24);
  const minutes = Math.floor((diff / 60000) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds };
}

function SneakersComingSoon() {
  const { days, hours, minutes, seconds } = useCountdown(SNEAKERS_LAUNCH);
  const units = [
    { label: "Dias", value: days },
    { label: "Horas", value: hours },
    { label: "Min", value: minutes },
    { label: "Seg", value: seconds },
  ];
  return (
    <div className="relative mx-auto max-w-4xl overflow-hidden border border-accent/30 bg-gradient-to-br from-navy via-charcoal to-navy p-10 text-center text-ivory shadow-2xl md:p-16">
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative">
        <div className="inline-flex items-center gap-2 border border-accent/60 px-4 py-1.5 text-[10px] tracking-luxe uppercase text-accent">
          <Sparkles className="h-3 w-3 animate-pulse" /> Em breve
        </div>
        <h3 className="mt-8 font-serif text-5xl leading-[1.05] md:text-7xl">
          Sneakers<br />
          <em className="text-accent">Coming Soon.</em>
        </h3>
        <p className="mx-auto mt-6 max-w-md text-sm text-ivory/70 font-light">
          Uma nova cadência está sendo montada. Assine o Clube para acesso antecipado.
        </p>
        <div className="mt-10 grid grid-cols-4 gap-2 md:gap-4">
          {units.map((u) => (
            <div
              key={u.label}
              className="border border-ivory/15 bg-charcoal/40 py-4 backdrop-blur"
            >
              <div className="font-serif text-3xl tabular-nums text-accent md:text-5xl">
                {String(u.value).padStart(2, "0")}
              </div>
              <div className="mt-1 text-[9px] tracking-luxe uppercase text-ivory/60">
                {u.label}
              </div>
            </div>
          ))}
        </div>
        <a
          href="#about"
          className="mt-12 inline-flex items-center gap-3 border border-accent px-8 py-3 text-[11px] tracking-luxe uppercase text-accent transition-all hover:bg-accent hover:text-charcoal"
        >
          Ser Avisado no Lançamento
        </a>
      </div>
    </div>
  );
}

/* ---------- Stock Badge ---------- */
function StockBadge({ qty }: { qty: number }) {
  if (qty === 0)
    return (
      <span className="inline-flex items-center border border-destructive/60 bg-destructive/10 px-2 py-1 text-[10px] tracking-luxe uppercase text-destructive">
        Sold Out
      </span>
    );
  if (qty === 1)
    return (
      <span className="inline-flex animate-pulse items-center gap-1 border border-accent bg-accent/20 px-2 py-1 text-[10px] font-semibold tracking-luxe uppercase text-accent shadow-[0_0_12px_rgba(0,0,0,0.15)]">
        ⚠️ Última unidade
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 border border-emerald-600/40 bg-emerald-600/10 px-2 py-1 text-[10px] tracking-luxe uppercase text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Disponível
    </span>
  );
}

/* ---------- Product Card ---------- */
function ProductCard({ product }: { product: Product }) {
  const { open, openEdit } = useProduct();
  const { stock, deleteProduct } = useCatalog();
  const isAdmin = useIsAdmin();
  const qty = stock[product.id] ?? 0;
  const soldOut = qty === 0;

  return (
    <article className="group flex flex-col">
      <div
        className={`relative aspect-[3/4] w-full overflow-hidden bg-secondary transition-transform duration-500 hover:-translate-y-1 hover:shadow-xl ${
          soldOut ? "" : "cursor-pointer"
        }`}
        onClick={() => !soldOut && open(product.id)}
      >
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className={`h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.08] ${
            soldOut ? "opacity-50 grayscale" : ""
          }`}
        />
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          <StockBadge qty={qty} />
        </div>
        {isAdmin && (
          <div className="absolute right-3 top-3 flex flex-col gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEdit(product.id);
              }}
              aria-label="Editar produto"
              className="flex h-8 w-8 items-center justify-center border border-accent/70 bg-background/90 text-accent shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-ivory"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Excluir "${product.name}"?`)) deleteProduct(product.id);
              }}
              aria-label="Excluir produto"
              className="flex h-8 w-8 items-center justify-center border border-destructive/60 bg-background/90 text-destructive shadow-sm backdrop-blur transition-colors hover:bg-destructive hover:text-ivory"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        )}
        {soldOut ? (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rotate-[-8deg] border-2 border-destructive/80 bg-charcoal/40 px-6 py-2 font-serif text-2xl tracking-widest text-destructive backdrop-blur">
                SOLD OUT
              </span>
            </div>
            <div className="absolute inset-x-4 bottom-4 border border-ivory/40 bg-charcoal/80 py-3 text-center text-[10px] tracking-luxe uppercase text-ivory/80 backdrop-blur-sm">
              Produto Esgotado
            </div>
          </>
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
      {qty === 1 && (
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-luxe text-accent">
          Garanta o seu antes que acabe!
        </p>
      )}
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
                  className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
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

/* ---------- Admin Edit / Create Modal ---------- */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function AdminEditModal() {
  const { editingId, closeEdit, creatingCategory } = useProduct();
  const { products, updateProduct, addProduct, stock, setStock, deleteProduct } = useCatalog();
  const { tab } = useSearch();
  const isAdmin = useIsAdmin();
  const isCreate = editingId === "__new__";
  const product = !isCreate && editingId ? products.find((p) => p.id === editingId) ?? null : null;
  const open = isAdmin && (isCreate || !!product);

  const [form, setForm] = useState({
    name: "",
    description: "",
    longDescription: "",
    price: 0,
    image: "",
    stock: 0,
    category: (creatingCategory ?? tab) as ProductCategory,
  });
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    setUploadError(null);
    if (isCreate) {
      setForm({
        name: "",
        description: "",
        longDescription: "",
        price: 0,
        image: "",
        stock: 1,
        category: creatingCategory ?? tab,
      });
    } else if (product) {
      setForm({
        name: product.name,
        description: product.description,
        longDescription: product.longDescription ?? "",
        price: product.price,
        image: product.image,
        stock: stock[product.id] ?? 0,
        category: (product.category ?? "clothes") as ProductCategory,
      });
    }
  }, [editingId, product, stock, isCreate, creatingCategory, tab]);

  if (!open) return null;

  const onPickFile = async (file: File | undefined) => {
    setUploadError(null);
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      setUploadError("Envie uma imagem JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("Imagem muito grande. Use um arquivo de até 2 MB.");
      return;
    }
    try {
      const b64 = await fileToBase64(file);
      setForm((f) => ({ ...f, image: b64 }));
    } catch {
      setUploadError("Falha ao ler a imagem.");
    }
  };

  const onSave = () => {
    const name = form.name.trim();
    if (!name) return alert("Informe o nome do produto.");
    if (!form.image) return alert("Envie uma foto do produto.");
    const price = Math.max(0, Number(form.price) || 0);
    const qty = Math.max(0, Math.floor(Number(form.stock) || 0));

    if (isCreate) {
      const id = `p_${Date.now()}`;
      addProduct(
        {
          id,
          name,
          description: form.description.trim() || name,
          longDescription: form.longDescription.trim() || undefined,
          price,
          image: form.image,
          gallery: [form.image],
          category: form.category,
        },
        qty,
      );
    } else if (product) {
      updateProduct(product.id, {
        name,
        description: form.description.trim(),
        longDescription: form.longDescription.trim() || undefined,
        price,
        image: form.image,
        gallery: [form.image],
        category: form.category,
      });
      setStock(product.id, qty);
    }
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
              <p className="text-[11px] tracking-luxe uppercase text-accent">
                {isCreate ? "Novo Produto · Admin" : "Editor · Admin"}
              </p>
            </div>
            <button onClick={closeEdit} aria-label="Fechar" className="hover:text-accent">
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-[180px_1fr]">
            <div>
              <div className="aspect-[3/4] w-full overflow-hidden border border-border bg-secondary">
                {form.image ? (
                  <img src={form.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-luxe text-muted-foreground">
                    Sem foto
                  </div>
                )}
              </div>
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 border border-accent/50 bg-accent/5 px-3 py-2 text-[10px] tracking-luxe uppercase text-accent transition-colors hover:bg-accent hover:text-charcoal">
                <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                Enviar Foto (JPG)
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                  className="hidden"
                />
              </label>
              {uploadError && (
                <p className="mt-2 text-[10px] text-destructive">{uploadError}</p>
              )}
              <p className="mt-2 text-[9px] tracking-luxe uppercase text-muted-foreground">
                Até 2 MB · Salvo no dispositivo
              </p>
            </div>

            <div className="space-y-4">
              <Field label="Categoria">
                <div className="flex gap-2">
                  {(["clothes", "sneakers"] as ProductCategory[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, category: c })}
                      className={`border px-3 py-1.5 text-[10px] tracking-luxe uppercase transition-colors ${
                        form.category === c
                          ? "border-foreground bg-foreground text-ivory"
                          : "border-border hover:border-foreground"
                      }`}
                    >
                      {c === "clothes" ? "Roupas" : "Sneakers"}
                    </button>
                  ))}
                </div>
              </Field>
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
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
            {!isCreate && product ? (
              <button
                onClick={() => {
                  if (confirm(`Excluir "${product.name}"?`)) {
                    deleteProduct(product.id);
                    closeEdit();
                  }
                }}
                className="inline-flex items-center gap-2 border border-destructive/60 px-4 py-2 text-[11px] tracking-luxe uppercase text-destructive transition-colors hover:bg-destructive hover:text-ivory"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Excluir
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
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
                <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
                {isCreate ? "Criar Produto" : "Salvar Alterações"}
              </button>
            </div>
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
  const { setTab } = useSearch();
  const { user, openAuth } = useAuth();
  const navigate = useNavigate();
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);

  const onCheckout = () => {
    if (!user) {
      setCheckoutMsg("Você precisa entrar ou criar uma conta para finalizar a compra.");
      close();
      openAuth();
      return;
    }
    close();
    navigate({ to: "/checkout" });
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
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-accent/40 bg-accent/5">
                <ShoppingBag className="h-9 w-9 text-accent" strokeWidth={1} />
                <span className="absolute -right-1 -top-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
                </span>
              </div>
              <p className="mt-8 font-serif text-2xl leading-tight">
                Seu carrinho<br />está vazio...
              </p>
              <p className="mt-4 max-w-[280px] text-sm font-light text-muted-foreground">
                Não deixe seus produtos favoritos esgotarem — as edições são limitadas.
              </p>
              <button
                onClick={() => {
                  setTab("clothes");
                  close();
                  setTimeout(
                    () => document.getElementById("collections")?.scrollIntoView({ behavior: "smooth" }),
                    150,
                  );
                }}
                className="mt-8 bg-charcoal px-8 py-3 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy"
              >
                Ver Novidades
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
              Pressione Enter para pesquisar em Roupas e Sneakers.
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
