import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  Menu,
  Settings,
  MapPin,
  Package,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useOrders } from "@/lib/orders-context";
import type { OrderStatus } from "@/lib/types";
import {
  useCart,
  formatBRL,
  applyPixDiscount,
  PIX_ENABLED,
  type Product,
  type ProductCategory,
} from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { ShippingCalculator, FreeShippingHint } from "@/components/ShippingCalculator";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { AVAILABLE_COUPONS, findCoupon, hasUsedCoupon } from "@/lib/coupons";
import { SUPPORT_EMAIL, WHATSAPP_DISPLAY, WHATSAPP_LINK } from "@/components/WhatsAppFab";

import heroAsset from "@/assets/hero-amalfi-men.jpg.asset.json";
const hero = heroAsset.url;
import editorialAsset from "@/assets/editorial-linen.jpg.asset.json";
const editorial = editorialAsset.url;


export const Route = createFileRoute("/")({
  component: Index,
});

const SIZES = ["P", "M", "G", "GG"] as const;
export type Size = (typeof SIZES)[number];
export type SizeStock = Record<Size, number>;

const emptyStock = (): SizeStock => ({ P: 0, M: 0, G: 0, GG: 0 });
const totalStock = (s: SizeStock | undefined) =>
  s ? s.P + s.M + s.G + s.GG : 0;
const hasLastSize = (s: SizeStock | undefined) =>
  !!s && (s.P === 1 || s.M === 1 || s.G === 1 || s.GG === 1);

const SNEAKERS_LAUNCH = new Date("2026-09-01T00:00:00-03:00").getTime();

/** Máximo de fotos por produto no formulário do admin. */
const MAX_PRODUCT_IMAGES = 5;

function useIsAdmin() {
  const { user } = useAuth();
  return !!user?.isAdmin;
}

/* ---------- Catalog Context (Supabase-backed) ---------- */
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

function coerceSizeStock(v: unknown): SizeStock {
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

type ProductRow = {
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
};

function rowToProduct(r: ProductRow): Product {
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
  };
}

function CatalogProvider({ children }: { children: React.ReactNode }) {
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
    if (patch.longDescription !== undefined) dbPatch.long_description = patch.longDescription ?? null;
    if (patch.price !== undefined) dbPatch.price = patch.price;
    if (patch.image !== undefined) dbPatch.image = patch.image;
    if (patch.gallery !== undefined) dbPatch.gallery = patch.gallery;
    if (patch.category !== undefined) dbPatch.category = patch.category;
    if (patch.forceLastItem !== undefined)
      dbPatch.force_last_item = patch.forceLastItem === true;

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
      value={{ products, stock, loading, updateProduct, addProduct, deleteProduct, setStock, decrementStock, refresh }}
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
export type SubFilter = "todos" | "blusa" | "camiseta" | "calca";
type SearchCtx = {
  query: string;
  setQuery: (q: string) => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  tab: ProductCategory;
  setTab: (t: ProductCategory) => void;
  subFilter: SubFilter;
  setSubFilter: (s: SubFilter) => void;
};
const SearchContext = createContext<SearchCtx | null>(null);
function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [tab, setTab] = useState<ProductCategory>("clothes");
  const [subFilter, setSubFilter] = useState<SubFilter>("todos");
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
        subFilter,
        setSubFilter,
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <CatalogProvider>
      <SearchProvider>
        <ProductProvider>
          <div className="min-h-screen bg-background text-foreground">
            <Nav
              onOpenFilter={() => setFilterOpen(true)}
              onOpenAccount={() => setAccountOpen(true)}
              onOpenAdmin={() => setAdminOpen(true)}
              onOpenMobileMenu={() => setMobileMenuOpen(true)}
            />
            <Hero />
            <CategoryTabs />
            <Products />
            <Testimonials />
            <Concept />
            <Newsletter />
            <Footer />
            <CartDrawer />
            <ProductModal />
            <AuthModal />
            <WelcomeCouponPopup />
            <SearchOverlay />
            <AdminEditModal />
            <FilterSidebar open={filterOpen} onClose={() => setFilterOpen(false)} />
            <MinhaContaModal open={accountOpen} onClose={() => setAccountOpen(false)} />
            <AdminPanelModal open={adminOpen} onClose={() => setAdminOpen(false)} />
            <MobileMenu
              open={mobileMenuOpen}
              onClose={() => setMobileMenuOpen(false)}
              onOpenAccount={() => {
                setMobileMenuOpen(false);
                setAccountOpen(true);
              }}
              onOpenFilter={() => {
                setMobileMenuOpen(false);
                setFilterOpen(true);
              }}
            />
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
function Nav({
  onOpenFilter,
  onOpenAccount,
  onOpenAdmin,
  onOpenMobileMenu,
}: {
  onOpenFilter: () => void;
  onOpenAccount: () => void;
  onOpenAdmin: () => void;
  onOpenMobileMenu: () => void;
}) {
  const { open, count } = useCart();
  const { user, openAuth } = useAuth();
  const { open: openSearch } = useSearch();
  const isAdmin = useIsAdmin();
  const isDevMaster = !!user?.isAdmin;
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
      <div className="mx-auto grid max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center px-4 py-4 md:px-12 md:py-5">
        <div
          className={`flex items-center gap-5 ${
            scrolled ? "text-foreground" : "text-ivory"
          }`}
        >
          {/* Mobile hamburger */}
          <button
            aria-label="Abrir menu"
            onClick={onOpenMobileMenu}
            className="hover:text-accent transition-colors md:hidden"
          >
            <Menu className="h-5 w-5" strokeWidth={1.25} />
          </button>
          {/* Desktop filter */}
          <button
            aria-label="Filtrar categoria"
            onClick={onOpenFilter}
            className="hidden hover:text-accent transition-colors md:inline-flex"
          >
            <Menu className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <nav className="hidden items-center gap-8 text-[11px] tracking-luxe uppercase md:flex">
            <a href="#collections" className="hover:text-accent transition-colors">Coleção</a>
            <a href="#edit" className="hover:text-accent transition-colors">O Editorial</a>
            <a href="#about" className="hover:text-accent transition-colors">Sobre</a>
          </nav>
        </div>
        <a
          href="#"
          className={`font-serif text-lg md:text-2xl tracking-wider text-center whitespace-nowrap ${
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
          className={`flex items-center justify-end gap-4 md:gap-5 ${
            scrolled ? "text-foreground" : "text-ivory"
          }`}
        >
          <button
            aria-label="Buscar"
            onClick={openSearch}
            className="hidden hover:text-accent transition-colors md:inline-flex"
          >
            <Search className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => (user ? onOpenAccount() : openAuth())}
            aria-label={user ? "Minha Conta" : "Entrar"}
            title={user ? `${user.email}` : "Entrar"}
            className="hidden hover:text-accent transition-colors md:inline-flex"
          >
            <UserIcon className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            aria-label="Sacola"
            onClick={open}
            className="relative hover:text-accent transition-colors"
          >
            <ShoppingBag className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.5} />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-charcoal">
                {count}
              </span>
            )}
          </button>
          {isDevMaster && (
            <>
              <Link
                to="/pedidos"
                aria-label="Controle de Pedidos"
                title="Controle de Pedidos"
                className="hidden hover:text-accent transition-colors md:inline-flex"
              >
                <Package className="h-4 w-4" strokeWidth={1.5} />
              </Link>
              <button
                aria-label="Painel Admin"
                onClick={onOpenAdmin}
                title="Painel Admin"
                className="relative hidden hover:text-accent transition-colors md:inline-flex"
              >
                <Settings className="h-4 w-4" strokeWidth={1.5} />
                <span className="absolute -right-2 -top-2 h-1.5 w-1.5 rounded-full bg-accent" />
              </button>
            </>
          )}

        </div>
      </div>
    </header>
  );
}

/* ---------- Mobile Menu Drawer ---------- */
function MobileMenu({
  open,
  onClose,
  onOpenAccount,
  onOpenFilter,
}: {
  open: boolean;
  onClose: () => void;
  onOpenAccount: () => void;
  onOpenFilter: () => void;
}) {
  const { user, openAuth } = useAuth();
  const { setTab } = useSearch();
  const goTo = (id: string) => {
    onClose();
    setTimeout(
      () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }),
      180,
    );
  };
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[85] bg-charcoal/60 backdrop-blur-sm transition-opacity duration-400 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-[90] flex w-[88%] max-w-sm flex-col bg-[color:var(--ivory)] text-foreground shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <span className="font-serif text-lg tracking-wider">
            A<span className="text-accent">&amp;</span>S Concept
          </span>
          <button onClick={onClose} aria-label="Fechar menu" className="hover:text-accent">
            <X className="h-5 w-5" strokeWidth={1.25} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-6 py-8">
          <p className="mb-3 text-[10px] tracking-luxe uppercase text-muted-foreground">
            Coleção
          </p>
          <button
            onClick={() => {
              setTab("clothes");
              goTo("collections");
            }}
            className="py-3 text-left font-serif text-2xl leading-tight hover:text-accent"
          >
            Roupas
          </button>
          <button
            onClick={() => {
              setTab("sneakers");
              goTo("collections");
            }}
            className="py-3 text-left font-serif text-2xl leading-tight hover:text-accent"
          >
            Sneakers
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenFilter();
            }}
            className="py-3 text-left font-serif text-2xl leading-tight hover:text-accent"
          >
            Filtrar
          </button>

          <p className="mb-3 mt-8 text-[10px] tracking-luxe uppercase text-muted-foreground">
            Editorial
          </p>
          <button
            onClick={() => goTo("edit")}
            className="py-3 text-left font-serif text-2xl leading-tight hover:text-accent"
          >
            O Editorial
          </button>
          <button
            onClick={() => goTo("about")}
            className="py-3 text-left font-serif text-2xl leading-tight hover:text-accent"
          >
            Sobre a Marca
          </button>

          <p className="mb-3 mt-8 text-[10px] tracking-luxe uppercase text-muted-foreground">
            Conta
          </p>
          <button
            onClick={() => {
              onClose();
              if (user) onOpenAccount();
              else openAuth();
            }}
            className="py-3 text-left font-serif text-2xl leading-tight hover:text-accent"
          >
            {user ? "Minha Conta" : "Entrar / Criar Conta"}
          </button>
        </nav>

        <div className="border-t border-border px-6 py-5 text-[10px] tracking-luxe uppercase text-muted-foreground">
          A&amp;S Conccept — Herança Curada
        </div>
      </aside>
    </>
  );
}


/* ---------- Hero ---------- */
function Hero() {
  return (
    <section className="relative h-[100svh] w-full overflow-hidden">
      <img
        src={hero}
        alt="Editorial A&S Conccept"
        width={1920}
        height={1280}
        className="absolute inset-0 h-full w-full object-cover object-[65%_center] md:object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-charcoal/50 via-charcoal/25 to-charcoal/80" />
      <div className="relative z-10 flex h-full items-end pb-16 md:items-center md:pb-0">
        <div className="mx-auto w-full max-w-[1600px] px-5 md:px-12">
          <div className="max-w-2xl animate-fade-up text-ivory">
            <p className="mb-4 text-[10px] tracking-luxe uppercase text-accent md:mb-6 md:text-[11px]">
              — Coleção Outono / Inverno
            </p>
            <h1 className="font-serif text-[2.5rem] leading-[1.05] sm:text-5xl md:text-7xl lg:text-[6rem]">
              A Nova Era<br />da Herança.
            </h1>
            <p className="mt-6 max-w-md text-sm font-light text-ivory/85 md:mt-8 md:text-lg">
              Luxo curado para a próxima geração.
            </p>
            <a
              href="#collections"
              className="group mt-8 inline-flex items-center gap-4 border border-ivory/70 px-8 py-3.5 text-[11px] tracking-luxe uppercase text-ivory transition-all duration-500 hover:border-accent hover:text-accent md:mt-12 md:px-10 md:py-4"
            >
              Explorar a Coleção
              <span className="inline-block h-px w-6 bg-current transition-all duration-500 group-hover:w-10 md:w-8" />
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
const SUB_PATTERNS: Record<Exclude<SubFilter, "todos">, RegExp> = {
  blusa: /(blusa|su[ée]ter|polo)/i,
  camiseta: /(camisa|camiseta|t-?shirt)/i,
  calca: /(cal[çc]a|pants|trouser)/i,
};

function matchesSub(name: string, description: string, sub: SubFilter) {
  if (sub === "todos") return true;
  const re = SUB_PATTERNS[sub];
  return re.test(name) || re.test(description);
}

function Products() {
  const { query, setQuery, tab, subFilter, setSubFilter } = useSearch();
  const { products, stock, refresh: resetCatalog } = useCatalog();
  const { openCreate } = useProduct();
  const isAdmin = useIsAdmin();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let inTab = products.filter((p) => (p.category ?? "clothes") === tab);
    // Produtos sem estoque em nenhum tamanho somem da vitrine pública,
    // mas continuam visíveis para o admin (para repor estoque ou excluir).
    if (!isAdmin) {
      inTab = inTab.filter((p) => totalStock(stock[p.id]) > 0);
    }
    if (tab === "clothes" && subFilter !== "todos") {
      inTab = inTab.filter((p) => matchesSub(p.name, p.description, subFilter));
    }
    if (!q) return inTab;
    return inTab.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.longDescription ?? "").toLowerCase().includes(q),
    );
  }, [query, products, tab, subFilter, isAdmin, stock]);

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

          {subFilter !== "todos" && tab === "clothes" && (
            <div className="mt-4 flex items-center gap-3 border border-accent/50 bg-accent/5 px-4 py-2 text-xs">
              <span className="text-muted-foreground">Filtro:</span>
              <span className="font-serif italic capitalize">
                {subFilter === "calca" ? "Calça" : subFilter}
              </span>
              <button
                onClick={() => setSubFilter("todos")}
                className="ml-2 text-muted-foreground hover:text-accent"
                aria-label="Limpar filtro"
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
      <span className="inline-flex items-center gap-1 border border-accent/60 bg-accent/10 px-2 py-1 text-[10px] tracking-luxe uppercase text-accent">
        Última unidade
      </span>
    );
  return null;
}

/* ---------- Product Card ---------- */
function ProductCard({ product }: { product: Product }) {
  const { open, openEdit } = useProduct();
  const { stock, deleteProduct } = useCatalog();
  const isAdmin = useIsAdmin();
  const sizeStock = stock[product.id];
  const total = totalStock(sizeStock);
  const soldOut = total === 0;
  const showLastItem =
    !soldOut && (product.forceLastItem === true || hasLastSize(sizeStock) || total === 1);

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
          {showLastItem ? (
            <span className="inline-flex items-center gap-1 border border-[color:var(--gold)]/70 bg-background/95 px-2 py-1 text-[10px] tracking-luxe uppercase text-[color:var(--gold)] backdrop-blur">
              ✦ Último Item
            </span>
          ) : (
            <StockBadge qty={total} />
          )}
        </div>
        {soldOut ? (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rotate-[-8deg] border-2 border-destructive/80 bg-charcoal/40 px-6 py-2 font-serif text-2xl tracking-widest text-destructive backdrop-blur">
                SOLD OUT
              </span>
            </div>
            <div className="pointer-events-none absolute inset-x-4 bottom-4 border border-ivory/40 bg-charcoal/80 py-3 text-center text-[10px] tracking-luxe uppercase text-ivory/80 backdrop-blur-sm">
              Produto Esgotado
            </div>
          </>
        ) : (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 translate-y-6 border border-ivory/80 bg-charcoal/70 py-3 text-center text-[10px] tracking-luxe uppercase text-ivory opacity-0 backdrop-blur-sm transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
            Ver Produto
          </div>
        )}
        {isAdmin && (
          <div className="pointer-events-auto absolute right-3 top-3 z-30 flex flex-col gap-2">
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
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-serif text-base md:text-lg leading-tight">{product.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground font-light line-clamp-1">
            {product.description}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-xs md:text-sm tabular-nums">{formatBRL(product.price)}</span>
        </div>
      </div>
      {isAdmin && sizeStock && (
        <p className="mt-2 text-[10px] tracking-luxe uppercase text-muted-foreground">
          Estoque · P{sizeStock.P} · M{sizeStock.M} · G{sizeStock.G} · GG{sizeStock.GG}
          {product.forceLastItem && (
            <span className="ml-2 text-[color:var(--gold)]">· Último Item forçado</span>
          )}
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
  const [size, setSize] = useState<Size>("M");
  const [activeImg, setActiveImg] = useState(0);
  const active = activeId ? products.find((p) => p.id === activeId) ?? null : null;

  const sizeStock = active ? stock[active.id] : undefined;
  const total = totalStock(sizeStock);
  const soldOut = total === 0;
  const availableQty = sizeStock?.[size] ?? 0;
  const sizeSoldOut = availableQty === 0;
  const lastItem =
    !soldOut &&
    !!active &&
    (active.forceLastItem === true || hasLastSize(sizeStock) || total === 1);

  useEffect(() => {
    // Ao abrir um produto, selecionar automaticamente o primeiro tamanho com estoque.
    if (!active) return;
    setActiveImg(0);
    const s = stock[active.id];
    const firstAvailable = SIZES.find((sz) => (s?.[sz] ?? 0) > 0) ?? "M";
    setSize(firstAvailable);
  }, [activeId, active, stock]);

  if (!active) return null;
  const gallery = active.gallery && active.gallery.length ? active.gallery : [active.image];

  return (
    <>
      <div
        onClick={close}
        className="fixed inset-0 z-[80] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 z-[90] flex items-stretch justify-center pointer-events-none md:items-center md:p-8">
        <div className="pointer-events-auto relative flex h-[100svh] w-full max-w-5xl flex-col overflow-hidden bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-500 md:h-auto md:max-h-[92vh]">
          <button
            onClick={close}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-20 rounded-full bg-background/80 p-2 backdrop-blur hover:text-accent"
          >
            <X className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.5} />
          </button>
          <div className="grid flex-1 grid-cols-1 overflow-y-auto pb-28 md:grid-cols-2 md:pb-0">
            <div className="bg-secondary md:sticky md:top-0 md:self-start">
              <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden bg-secondary">
                <img
                  src={gallery[activeImg]}
                  alt={active.name}
                  className="h-full w-full object-contain transition-transform duration-700 hover:scale-105"
                />
                {gallery.length > 1 && (
                  <>
                    <button
                      onClick={() =>
                        setActiveImg((i) => (i - 1 + gallery.length) % gallery.length)
                      }
                      aria-label="Foto anterior"
                      className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 shadow-sm backdrop-blur transition-colors hover:text-accent"
                    >
                      <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => setActiveImg((i) => (i + 1) % gallery.length)}
                      aria-label="Próxima foto"
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 shadow-sm backdrop-blur transition-colors hover:text-accent"
                    >
                      <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
                    </button>
                    <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-charcoal/70 px-2 py-0.5 text-[10px] tracking-luxe text-ivory tabular-nums">
                      {activeImg + 1}/{gallery.length}
                    </span>
                  </>
                )}
              </div>
              {gallery.length > 1 && (
                <div className="flex gap-2 overflow-x-auto p-3">
                  {gallery.map((g, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      className={`h-20 w-16 shrink-0 overflow-hidden border transition-all ${
                        activeImg === i ? "border-accent" : "border-transparent opacity-70"
                      }`}
                    >
                      <img src={g} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>


            <div className="flex flex-col p-6 md:p-12">
              <p className="text-[11px] tracking-luxe uppercase text-accent">A&amp;S Conccept</p>
              <h2 className="mt-3 font-serif text-2xl leading-tight md:text-4xl">{active.name}</h2>
              <p className="mt-3 text-lg tabular-nums">{formatBRL(active.price)}</p>
              {(soldOut || lastItem) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {lastItem ? (
                    <span className="inline-flex items-center gap-1 border border-[color:var(--gold)]/70 bg-[color:var(--gold)]/10 px-2 py-1 text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
                      ✦ Último Item
                    </span>
                  ) : (
                    <StockBadge qty={total} />
                  )}
                </div>
              )}
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground font-light">
                {active.longDescription ?? active.description}
              </p>

              <div className="mt-8">
                <p className="mb-3 text-[11px] tracking-luxe uppercase text-muted-foreground">
                  Tamanho
                </p>
                <div className="flex flex-wrap gap-2">
                  {SIZES.map((s) => {
                    const q = sizeStock?.[s] ?? 0;
                    const isOut = q === 0;
                    return (
                      <button
                        key={s}
                        onClick={() => !isOut && setSize(s)}
                        disabled={isOut}
                        title={isOut ? "Tamanho esgotado" : `${q} em estoque`}
                        className={`relative h-12 w-16 border text-sm transition-all md:h-11 md:w-14 ${
                          size === s
                            ? "border-foreground bg-foreground text-ivory"
                            : "border-border hover:border-foreground"
                        } ${
                          isOut
                            ? "cursor-not-allowed opacity-40 line-through"
                            : ""
                        }`}
                      >
                        {s}
                        {q === 1 && !isOut && (
                          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[color:var(--gold)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {(sizeSoldOut || availableQty === 1 || availableQty === 2) && (
                  <p className="mt-2 text-[10px] tracking-luxe uppercase text-muted-foreground">
                    {sizeSoldOut
                      ? "Tamanho selecionado sem disponibilidade."
                      : availableQty === 1
                        ? "Última peça em estoque neste tamanho."
                        : `${availableQty} unidades disponíveis no tamanho ${size}.`}
                  </p>
                )}
              </div>

              {/* Desktop CTA */}
              <button
                onClick={() => {
                  if (soldOut || sizeSoldOut) return;
                  add(active, size);
                  decrementStock(active.id, size, 1);
                  close();
                }}
                disabled={soldOut || sizeSoldOut}
                className="mt-10 hidden bg-charcoal py-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground md:block"
              >
                {soldOut
                  ? "Produto Esgotado"
                  : sizeSoldOut
                    ? `Tamanho ${size} esgotado`
                    : "Adicionar à Sacola"}
              </button>

              <div className="mt-8">
                <ShippingCalculator subtotal={active.price} />
              </div>

              <div className="mt-8 space-y-2 border-t border-border pt-6 text-xs font-light text-muted-foreground">
                <p>Frete grátis em pedidos acima de {formatBRL(FREE_SHIPPING_THRESHOLD)}.</p>
              </div>
            </div>
          </div>

          {/* Mobile sticky CTA */}
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
            <button
              onClick={() => {
                if (soldOut || sizeSoldOut) return;
                add(active, size);
                decrementStock(active.id, size, 1);
                close();
              }}
              disabled={soldOut || sizeSoldOut}
              className="w-full bg-charcoal py-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {soldOut
                ? "Produto Esgotado"
                : sizeSoldOut
                  ? `Tamanho ${size} esgotado`
                  : `Adicionar — ${formatBRL(active.price)}`}
            </button>
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
    gallery: [] as string[],
    stock: emptyStock(),
    forceLastItem: false,
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
        gallery: [],
        stock: { P: 1, M: 1, G: 1, GG: 1 },
        forceLastItem: false,
        category: creatingCategory ?? tab,
      });
    } else if (product) {
      const gal =
        product.gallery && product.gallery.length
          ? product.gallery.slice(0, MAX_PRODUCT_IMAGES)
          : product.image
            ? [product.image]
            : [];
      setForm({
        name: product.name,
        description: product.description,
        longDescription: product.longDescription ?? "",
        price: product.price,
        gallery: gal,
        stock: coerceSizeStock(stock[product.id]),
        forceLastItem: product.forceLastItem === true,
        category: (product.category ?? "clothes") as ProductCategory,
      });
    }
  }, [editingId, product, stock, isCreate, creatingCategory, tab]);

  if (!open) return null;

  const onPickFiles = async (fileList: FileList | null) => {
    setUploadError(null);
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const remaining = MAX_PRODUCT_IMAGES - form.gallery.length;
    if (remaining <= 0) {
      setUploadError(`Máximo de ${MAX_PRODUCT_IMAGES} fotos por produto.`);
      return;
    }

    const accepted: string[] = [];
    let ignored = files.length > remaining;

    for (const file of files.slice(0, remaining)) {
      if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
        setUploadError("Envie imagens JPG, PNG ou WEBP.");
        continue;
      }
      if (file.size > 2 * 1024 * 1024) {
        setUploadError("Cada imagem deve ter até 2 MB.");
        continue;
      }
      try {
        accepted.push(await fileToBase64(file));
      } catch {
        setUploadError("Falha ao ler uma das imagens.");
      }
    }

    if (accepted.length) {
      setForm((f) => ({
        ...f,
        gallery: [...f.gallery, ...accepted].slice(0, MAX_PRODUCT_IMAGES),
      }));
    }
    if (ignored) {
      setUploadError(`Máximo de ${MAX_PRODUCT_IMAGES} fotos — fotos extras foram ignoradas.`);
    }
  };

  const removePhoto = (idx: number) =>
    setForm((f) => ({ ...f, gallery: f.gallery.filter((_, i) => i !== idx) }));

  const setCoverPhoto = (idx: number) =>
    setForm((f) => ({
      ...f,
      gallery: [f.gallery[idx], ...f.gallery.filter((_, i) => i !== idx)],
    }));




  const setSizeQty = (s: Size, v: number) =>
    setForm((f) => ({
      ...f,
      stock: { ...f.stock, [s]: Math.max(0, Math.floor(v || 0)) },
    }));

  const onSave = () => {
    const name = form.name.trim();
    if (!name) return alert("Informe o nome do produto.");
    const gallery = form.gallery.slice(0, MAX_PRODUCT_IMAGES);
    if (!gallery.length) return alert("Envie ao menos uma foto do produto.");
    const cover = gallery[0];
    const price = Math.max(0, Number(form.price) || 0);
    const stockObj = coerceSizeStock(form.stock);

    if (isCreate) {
      void addProduct(
        {
          name,
          description: form.description.trim() || name,
          longDescription: form.longDescription.trim() || undefined,
          price,
          image: cover,
          gallery,
          category: form.category,
          forceLastItem: form.forceLastItem || undefined,
        },
        stockObj,
      );
    } else if (product) {
      updateProduct(product.id, {
        name,
        description: form.description.trim(),
        longDescription: form.longDescription.trim() || undefined,
        price,
        image: cover,
        gallery,
        category: form.category,
        forceLastItem: form.forceLastItem || undefined,
      });
      setStock(product.id, stockObj);
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
                {form.gallery[0] ? (
                  <img src={form.gallery[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-luxe text-muted-foreground">
                    Sem foto
                  </div>
                )}
              </div>

              {form.gallery.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {form.gallery.map((g, i) => (
                    <div key={i} className="relative aspect-[3/4] overflow-hidden border border-border">
                      <img src={g} alt="" className="h-full w-full object-cover" />
                      {i === 0 && (
                        <span className="absolute inset-x-0 bottom-0 bg-charcoal/80 py-0.5 text-center text-[8px] tracking-luxe uppercase text-ivory">
                          Capa
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        aria-label="Remover foto"
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center bg-background/90 text-destructive shadow-sm transition-colors hover:bg-destructive hover:text-ivory"
                      >
                        <X className="h-3 w-3" strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label
                className={`mt-3 flex items-center justify-center gap-2 border border-accent/50 bg-accent/5 px-3 py-2 text-[10px] tracking-luxe uppercase text-accent transition-colors ${
                  form.gallery.length >= MAX_PRODUCT_IMAGES
                    ? "cursor-not-allowed opacity-40"
                    : "cursor-pointer hover:bg-accent hover:text-charcoal"
                }`}
              >
                <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                Enviar Fotos ({form.gallery.length}/{MAX_PRODUCT_IMAGES})
                <input
                  type="file"
                  multiple
                  disabled={form.gallery.length >= MAX_PRODUCT_IMAGES}
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(e) => {
                    void onPickFiles(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
              {uploadError && (
                <p className="mt-2 text-[10px] text-destructive">{uploadError}</p>
              )}
              <p className="mt-2 text-[9px] tracking-luxe uppercase text-muted-foreground">
                Até {MAX_PRODUCT_IMAGES} fotos · JPG, PNG ou WEBP · 2 MB cada
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
                <Field label="Total em estoque">
                  <div className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm tabular-nums">
                    {totalStock(form.stock)} unidades
                  </div>
                </Field>
              </div>
              <Field label="Estoque por tamanho">
                <div className="grid grid-cols-4 gap-2">
                  {SIZES.map((s) => (
                    <label key={s} className="block">
                      <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
                        {s}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={form.stock[s]}
                        onChange={(e) => setSizeQty(s, Number(e.target.value))}
                        className="w-full border border-border bg-transparent px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent"
                      />
                    </label>
                  ))}
                </div>
              </Field>
              <label className="flex cursor-pointer items-center gap-3 border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5 px-3 py-2">
                <input
                  type="checkbox"
                  checked={form.forceLastItem}
                  onChange={(e) => setForm({ ...form, forceLastItem: e.target.checked })}
                  className="h-4 w-4 accent-[color:var(--gold)]"
                />
                <span className="text-[11px] tracking-luxe uppercase text-[color:var(--gold)]">
                  Forçar tag "Último Item"
                </span>
              </label>
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
            alt="Editorial A&S Conccept"
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
              A&amp;S Conccept é um estudo de contenção — um guarda-roupa moderno traçado a partir
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
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setStatus("sending");
    setMsg(null);
    const { error } = await supabase
      .from("newsletter_subscribers")
      .insert({ email: clean } as never);
    if (error && !/duplicate|unique/i.test(error.message)) {
      setStatus("error");
      setMsg("Não foi possível registrar. Tente novamente.");
      return;
    }
    setStatus("sent");
    setMsg("Convite reservado. Verificaremos e retornaremos em breve.");
  };
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
          onSubmit={onSubmit}
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
          <button
            disabled={status === "sending"}
            className="text-[11px] tracking-luxe uppercase hover:text-accent transition-colors disabled:opacity-50"
          >
            {status === "sent" ? "Recebido ✦" : status === "sending" ? "Enviando..." : "Solicitar Convite"}
          </button>
        </form>
        {msg && <p className="mt-4 text-xs text-muted-foreground">{msg}</p>}
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function InstagramIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

type InstitutionalKey = "conceito" | "filosofia" | "termos" | "privacidade";

const INSTITUTIONAL_CONTENT: Record<
  InstitutionalKey,
  { eyebrow: string; title: string; paragraphs: string[] }
> = {
  conceito: {
    eyebrow: "Manifesto",
    title: "O Conceito",
    paragraphs: [
      "A&S Conccept nasce de um desejo antigo: devolver ao guarda-roupa contemporâneo a dignidade da alfaiataria atemporal, distante das oscilações efêmeras das temporadas. Cada peça é pensada como um pequeno patrimônio — algo que atravessa décadas sem ceder ao ruído das tendências.",
      "Nossa curadoria seleciona ateliês europeus e brasileiros que ainda entendem o valor de uma costura invisível, de um forro talhado à mão e do tempo generoso concedido a cada corte. O luxo, aqui, é silencioso: reside no toque, no caimento, na permanência.",
      "Cada coleção é apresentada em edições contidas, produzidas sob encomenda ou em séries limitadas — nunca em escala. É a nossa forma de recusar o excesso e preservar o gesto artesanal que define a maison.",
    ],
  },
  filosofia: {
    eyebrow: "Nossa Visão",
    title: "A Filosofia",
    paragraphs: [
      "Acreditamos que a elegância não se anuncia. Ela se percebe. É por isso que trabalhamos com paletas discretas — marfim, navy, charcoal e ouro velho — e com materiais nobres cuja beleza cresce com o uso: linhos italianos, cashmeres escoceses, couros vegetais curtidos ao tempo.",
      "Recusamos a lógica descartável do consumo acelerado. Cada cliente da A&S Conccept recebe uma peça acompanhada de sua origem, do nome do ateliê e de instruções de cuidado que asseguram sua longevidade. Reparo, ajuste e restauração fazem parte do nosso serviço vitalício.",
      "Nossa filosofia é, sobretudo, uma escolha ética: menos peças, melhor confecção, respeito ao artesão e ao vestir. É luxo que se afirma pela sobriedade — e permanece.",
    ],
  },
  termos: {
    eyebrow: "Documento Legal",
    title: "Termos e Condições",
    paragraphs: [
      "Ao utilizar o site A&S Conccept, o cliente concorda com as diretrizes de compra, pagamento, envio, troca e cancelamento aqui descritas. Os preços são apresentados em Reais (BRL) e podem sofrer atualizações periódicas conforme a variação cambial dos ateliês parceiros.",
      "Os pedidos são processados em até 3 dias úteis. Peças sob encomenda podem exigir prazo adicional de produção, informado no ato da compra. O envio é realizado por transportadora rastreada, com seguro integral do valor declarado.",
      "Trocas por defeito de fabricação ou divergência de tamanho podem ser solicitadas em até 30 dias corridos após a entrega. O produto deve ser devolvido em sua embalagem original, sem sinais de uso. Reservamo-nos o direito de recusar itens fora dessas condições.",
      "Este documento constitui um contrato eletrônico entre a A&S Conccept e o cliente, regido pelas leis brasileiras. Eventuais disputas serão dirimidas no foro da comarca de São Paulo/SP.",
    ],
  },
  privacidade: {
    eyebrow: "Compromisso",
    title: "Políticas de Privacidade",
    paragraphs: [
      "A A&S Conccept trata os dados pessoais de seus clientes com o mesmo rigor com que cuida de suas peças: com discrição, cuidado e propósito. Coletamos apenas as informações necessárias para processar pedidos, oferecer atendimento personalizado e manter comunicação editorial pertinente.",
      "Nenhum dado é compartilhado com terceiros para fins publicitários. Utilizamos protocolos criptográficos padrão de mercado para armazenar e transmitir informações sensíveis, como e-mail, endereço e telefone.",
      "O cliente pode, a qualquer momento, solicitar a exclusão, correção ou exportação de seus dados enviando um e-mail ao concierge da maison. Cumprimos integralmente a Lei Geral de Proteção de Dados (LGPD).",
      "Cookies são utilizados apenas para manter sua sessão ativa e mensurar o desempenho do site — nunca para rastreamento invasivo ou revenda de perfil.",
    ],
  },
};

function InstitutionalModal({
  which,
  onClose,
}: {
  which: InstitutionalKey | null;
  onClose: () => void;
}) {
  if (!which) return null;
  const content = INSTITUTIONAL_CONTENT[which];
  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[130] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 md:p-8 pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-[color:var(--ivory)] text-charcoal p-10 md:p-14 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-5 top-5 rounded-full bg-white/70 p-2 backdrop-blur hover:text-[color:var(--gold)] transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="text-[11px] tracking-luxe uppercase text-[color:var(--gold)]">
            {content.eyebrow}
          </p>
          <h2 className="mt-3 font-serif text-3xl md:text-4xl leading-tight">
            {content.title}
          </h2>
          <div className="mt-8 space-y-5 font-serif text-[15px] md:text-base leading-relaxed text-charcoal/85">
            {content.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="mt-10 border-t border-charcoal/15 pt-6">
            <button
              onClick={onClose}
              className="w-full bg-charcoal py-3 text-[11px] tracking-luxe uppercase text-ivory hover:bg-navy transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Footer() {
  const [modal, setModal] = useState<InstitutionalKey | null>(null);
  const institutional: { id: InstitutionalKey; label: string }[] = [
    { id: "conceito", label: "O Conceito" },
    { id: "filosofia", label: "A Filosofia" },
    { id: "termos", label: "Termos e Condições" },
    { id: "privacidade", label: "Políticas de Privacidade" },
  ];
  const cols = [
    { title: "Maison", links: ["Nossa História", "Ateliês", "Craftsmanship", "Sustentabilidade"] },
    { title: "Serviço", links: ["Concierge", "Envio", "Trocas", "Ajustes"] },
    { title: "Descobrir", links: ["O Editorial", "Journal", "Lookbook", "Revendedores"] },
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
            <a
              href="https://www.instagram.com/asconccept?igsh=MXYzNXhhNHRwMnlvcw%3D%3D&utm_source=qr"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram · @asconccept"
              className="group mt-6 inline-flex items-center gap-3 border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5 px-4 py-2.5 text-[11px] tracking-luxe uppercase text-[color:var(--gold)] shadow-[0_0_16px_-4px_rgba(212,175,55,0.35)] transition-all duration-500 hover:border-[color:var(--gold)] hover:bg-[color:var(--gold)]/15 hover:shadow-[0_0_24px_-2px_rgba(212,175,55,0.65)]"
            >
              <InstagramIcon className="h-4 w-4 transition-transform duration-500 group-hover:scale-110" />
              <span>@asconccept</span>
            </a>
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
          <div>
            <h4 className="mb-5 text-[11px] tracking-luxe uppercase text-accent">Institucional</h4>
            <ul className="space-y-3">
              {institutional.map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() => setModal(l.id)}
                    className="text-left text-xs font-light text-ivory/70 transition-colors hover:text-ivory"
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-3 border-t border-ivory/10 pt-8 text-xs font-light text-ivory/70 md:flex-row md:items-center md:justify-between">
          <p>
            Dúvidas ou problemas com seu pedido? Fale conosco:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-[color:var(--gold)] underline-offset-4 transition-colors hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p>
            Suporte via WhatsApp:{" "}
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--gold)] underline-offset-4 transition-colors hover:underline"
            >
              {WHATSAPP_DISPLAY}
            </a>
          </p>
        </div>
        <div className="mt-8 flex flex-col justify-between gap-4 border-t border-ivory/10 pt-8 text-[11px] text-ivory/50 md:flex-row">
          <p>© {new Date().getFullYear()} A&amp;S Conccept. Todos os direitos reservados.</p>
          <p className="tracking-luxe uppercase">Feito com propósito · Preços em BRL</p>
        </div>
      </div>
      <InstitutionalModal which={modal} onClose={() => setModal(null)} />
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
            <CouponRow subtotal={subtotal} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">
                Subtotal
              </span>
              <span className="font-serif text-xl tabular-nums">{formatBRL(subtotal)}</span>
            </div>
            {PIX_ENABLED && (
              <p className="text-[11px] font-light italic tracking-wide text-[color:var(--gold)]">
                ou {formatBRL(applyPixDiscount(subtotal))} no Pix (5% de desconto)
              </p>
            )}
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
  const { isOpen, closeAuth, signIn, signUp, resetPassword, user } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && isOpen) closeAuth();
  }, [user, isOpen, closeAuth]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setInfo(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const switchMode = (m: "login" | "signup" | "forgot") => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else if (mode === "signup") {
      const { error } = await signUp(email, password, name, phone);
      if (error) setError(error);
    } else {
      const { error } = await resetPassword(email);
      if (error) setError(error);
      else setInfo("Enviamos um link de recuperação para o seu e-mail.");
    }
    setLoading(false);
  };

  const title =
    mode === "login" ? "Entrar" : mode === "signup" ? "Criar Conta" : "Recuperar acesso";
  const eyebrow =
    mode === "login"
      ? "Bem-vindo de volta"
      : mode === "signup"
        ? "Nova conta"
        : "Esqueci a senha";

  return (
    <>
      <div
        onClick={closeAuth}
        className="fixed inset-0 z-[80] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 z-[90] flex items-end justify-center pointer-events-none sm:items-center sm:p-4">
        <div className="pointer-events-auto relative max-h-[95svh] w-full max-w-md overflow-y-auto bg-background p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-500 sm:p-8 md:p-10">
          <button
            onClick={closeAuth}
            aria-label="Fechar"
            className="absolute right-4 top-4 hover:text-accent"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="text-[11px] tracking-luxe uppercase text-accent">{eyebrow}</p>
          <h2 className="mt-2 font-serif text-3xl">{title}</h2>
          <p className="mt-2 text-sm font-light text-muted-foreground">
            {mode === "login"
              ? "Acesse sua conta para finalizar a compra."
              : mode === "signup"
                ? "Registre-se e ganhe 10% OFF na primeira compra."
                : "Digite o e-mail cadastrado para receber o link."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Celular (WhatsApp)
                  </label>
                  <input
                    type="tel"
                    required
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="(11) 98765-4321"
                    value={phone}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                      let out = d;
                      if (d.length > 2 && d.length <= 7) out = `(${d.slice(0, 2)}) ${d.slice(2)}`;
                      else if (d.length > 7)
                        out = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
                      else if (d.length > 0) out = `(${d}`;
                      setPhone(out);
                    }}
                    className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent transition-colors"
                  />
                  <p className="mt-1 text-[10px] font-light text-muted-foreground/70">
                    Usaremos apenas para contato do atelier sobre seus pedidos.
                  </p>
                </div>
              </>
            )}
            <div>
              <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                E-mail
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent transition-colors"
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Senha
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-[10px] tracking-luxe uppercase text-accent hover:underline underline-offset-4"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  minLength={mode === "signup" ? 6 : 4}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent transition-colors"
                />
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
            {info && <p className="text-xs text-accent">{info}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-charcoal py-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy disabled:opacity-50"
            >
              {loading
                ? "Aguarde..."
                : mode === "login"
                  ? "Entrar"
                  : mode === "signup"
                    ? "Criar Conta"
                    : "Enviar link de recuperação"}
            </button>
          </form>

          <div className="mt-6 text-center text-xs font-light text-muted-foreground">
            {mode === "login" && (
              <>
                Não tem uma conta?{" "}
                <button
                  onClick={() => switchMode("signup")}
                  className="text-foreground hover:text-accent underline underline-offset-4"
                >
                  Criar conta
                </button>
              </>
            )}
            {mode === "signup" && (
              <>
                Já tem uma conta?{" "}
                <button
                  onClick={() => switchMode("login")}
                  className="text-foreground hover:text-accent underline underline-offset-4"
                >
                  Entrar
                </button>
              </>
            )}
            {mode === "forgot" && (
              <>
                Lembrou a senha?{" "}
                <button
                  onClick={() => switchMode("login")}
                  className="text-foreground hover:text-accent underline underline-offset-4"
                >
                  Voltar ao login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}


/* ---------- Filter Sidebar ---------- */
const SUB_OPTIONS: { id: SubFilter; label: string }[] = [
  { id: "todos", label: "Todos os produtos" },
  { id: "blusa", label: "Blusa" },
  { id: "camiseta", label: "Camiseta" },
  { id: "calca", label: "Calça" },
];

function FilterSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { subFilter, setSubFilter, setTab } = useSearch();
  const select = (id: SubFilter) => {
    setTab("clothes");
    setSubFilter(id);
    onClose();
    setTimeout(
      () => document.getElementById("collections")?.scrollIntoView({ behavior: "smooth" }),
      120,
    );
  };
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[85] bg-charcoal/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-[90] flex w-full max-w-xs flex-col bg-background shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              Filtrar
            </p>
            <h3 className="font-serif text-xl">Categorias</h3>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="hover:text-accent">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {SUB_OPTIONS.map((o) => {
            const active = subFilter === o.id;
            return (
              <button
                key={o.id}
                onClick={() => select(o.id)}
                className={`flex w-full items-center justify-between border-l-2 px-4 py-3 text-left text-sm transition-colors ${
                  active
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary/50 hover:text-foreground"
                }`}
              >
                <span className="font-serif text-base">{o.label}</span>
                {active && (
                  <span className="text-[10px] tracking-luxe uppercase text-accent">
                    Ativo
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <p className="border-t border-border px-6 py-4 text-[10px] leading-relaxed text-muted-foreground">
          Selecione uma categoria para refinar a vitrine de Roupas.
        </p>
      </aside>
    </>
  );
}

/* ---------- Minha Conta Modal ---------- */
function MinhaContaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, updateProfile, getAddress, saveAddress, signOut } = useAuth();
  const { orders, byUser } = useOrders();
  const isDevMaster = !!user?.isAdmin;
  const myOrders = user
    ? isDevMaster || user.isAdmin
      ? orders
      : byUser(user.email)
    : [];

  const [name, setName] = useState(user?.name ?? "");
  const [address, setAddress] = useState(() => getAddress() ?? {});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setName(user?.name ?? "");
      setAddress(getAddress() ?? {});
      setSavedFlash(null);
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    }
    // Only reset when the modal opens or user identity changes — getAddress is
    // recreated on every AuthProvider render and would clear the flash instantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  if (!open || !user) return null;

  const onSave = () => {
    updateProfile({ name });
    saveAddress(address);
    setSavedFlash("Dados salvos com sucesso.");
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSavedFlash(null), 2400);
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[95] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-300">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-10 rounded-full bg-background/80 p-2 backdrop-blur hover:text-accent"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <div className="border-b border-border px-8 py-6">
            <p className="text-[11px] tracking-luxe uppercase text-accent">Minha Conta</p>
            <h2 className="mt-1 font-serif text-3xl">Olá, {user.name || user.email.split("@")[0]}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
          </div>

          <div className="grid gap-8 px-8 py-8 md:grid-cols-2">
            <section>
              <h3 className="mb-3 text-[10px] tracking-luxe uppercase text-muted-foreground">
                Dados Pessoais
              </h3>
              <label className="block">
                <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
                  Nome completo
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
            </section>

            <section>
              <h3 className="mb-3 flex items-center gap-2 text-[10px] tracking-luxe uppercase text-muted-foreground">
                <MapPin className="h-3 w-3" /> Morada de Entrega
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 sm:col-span-1 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">CEP</span>
                  <input
                    value={address.cep ?? ""}
                    onChange={(e) => setAddress({ ...address, cep: e.target.value })}
                    className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="col-span-2 sm:col-span-1 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">Número</span>
                  <input
                    value={address.numero ?? ""}
                    onChange={(e) => setAddress({ ...address, numero: e.target.value })}
                    className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">Logradouro</span>
                  <input
                    value={address.logradouro ?? ""}
                    onChange={(e) => setAddress({ ...address, logradouro: e.target.value })}
                    className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">Complemento</span>
                  <input
                    value={address.complemento ?? ""}
                    onChange={(e) => setAddress({ ...address, complemento: e.target.value })}
                    className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="col-span-2 sm:col-span-1 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">Bairro</span>
                  <input
                    value={address.bairro ?? ""}
                    onChange={(e) => setAddress({ ...address, bairro: e.target.value })}
                    className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="col-span-2 sm:col-span-1 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">Cidade / UF</span>
                  <div className="flex gap-2">
                    <input
                      value={address.cidade ?? ""}
                      onChange={(e) => setAddress({ ...address, cidade: e.target.value })}
                      className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                    <input
                      value={address.uf ?? ""}
                      maxLength={2}
                      onChange={(e) => setAddress({ ...address, uf: e.target.value.toUpperCase() })}
                      className="w-16 border border-border bg-transparent px-2 py-2 text-sm uppercase outline-none focus:border-accent"
                    />
                  </div>
                </label>
              </div>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-8 py-4">
            <button
              onClick={() => {
                signOut();
                onClose();
              }}
              className="inline-flex items-center gap-2 border border-border px-4 py-2 text-[11px] tracking-luxe uppercase hover:bg-secondary transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair da conta
            </button>
            <div className="flex items-center gap-3">
              {savedFlash && (
                <span className="text-[11px] text-accent animate-in fade-in duration-300">
                  ✦ {savedFlash}
                </span>
              )}
              <button
                onClick={onSave}
                className="inline-flex items-center gap-2 bg-charcoal px-6 py-2.5 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy"
              >
                <Save className="h-3.5 w-3.5" /> Salvar dados
              </button>
            </div>
          </div>

          <div className="border-t border-border px-8 py-6">
            <h3 className="mb-4 flex items-center gap-2 text-[10px] tracking-luxe uppercase text-muted-foreground">
              <Package className="h-3 w-3" /> Histórico de Pedidos
            </h3>
            {myOrders.length === 0 ? (
              <p className="border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
                Você ainda não realizou pedidos.
              </p>
            ) : (
              <ul className="space-y-3">
                {myOrders.slice(0, 8).map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-4 border border-border bg-card px-4 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        to="/pedidos/$id"
                        params={{ id: o.id }}
                        onClick={onClose}
                        className="font-mono text-sm hover:text-accent"
                      >
                        {o.id}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(o.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <span className="hidden sm:inline text-[10px] tracking-luxe uppercase text-muted-foreground">
                      {o.status}
                    </span>
                    <span className="font-serif tabular-nums">{formatBRL(o.total)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 text-right">
              <Link
                to="/pedidos"
                onClick={onClose}
                className="text-[11px] tracking-luxe uppercase text-accent hover:underline underline-offset-4"
              >
                Ver todos os pedidos →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Admin Panel Modal ---------- */
import { useServerFn } from "@tanstack/react-start";
import { adminDeleteOrder, adminDeleteCustomer } from "@/lib/admin.functions";

function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <>
      <div onClick={onCancel} className="fixed inset-0 z-[110] bg-charcoal/70 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
        <div className="pointer-events-auto w-full max-w-md bg-background p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <p className="text-[11px] tracking-luxe uppercase text-accent">A&amp;S Conccept · Confirmação</p>
          <h3 className="mt-2 font-serif text-2xl">{title}</h3>
          <p className="mt-4 text-sm text-muted-foreground">{message}</p>
          <div className="mt-8 flex justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={busy}
              className="border border-border px-5 py-2 text-[11px] tracking-luxe uppercase hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="border border-destructive bg-destructive px-5 py-2 text-[11px] tracking-luxe uppercase text-ivory hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Excluindo..." : "Excluir definitivamente"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}


const ADMIN_STATUSES: OrderStatus[] = [
  "Aguardando Aprovação",
  "Preparando pedido",
  "Em trânsito",
  "Entregue",
];

type NewsletterRow = { id: string; email: string; created_at: string };
type ManualCustomerRow = { id: string; name: string | null; email: string; phone: string | null; created_at: string };

function AdminPanelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, listCustomers, refreshCustomers } = useAuth();
  const { orders, updateStatus, createOrder, refresh: refreshOrders } = useOrders();
  const { products } = useCatalog();
  const [tab, setTab] = useState<"calc" | "pedidos" | "clientes">("pedidos");
  const [newsletter, setNewsletter] = useState<NewsletterRow[]>([]);
  const [manual, setManual] = useState<ManualCustomerRow[]>([]);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [showManualCustomer, setShowManualCustomer] = useState(false);
  const [confirmOrder, setConfirmOrder] = useState<string | null>(null);
  const [confirmCustomer, setConfirmCustomer] = useState<
    { email: string; kind: "auth" | "manual"; name: string } | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const deleteOrderFn = useServerFn(adminDeleteOrder);
  const deleteCustomerFn = useServerFn(adminDeleteCustomer);

  const isAdminUser = !!user?.isAdmin;

  const handleDeleteOrder = async () => {
    if (!confirmOrder || !isAdminUser) return;
    setDeleting(true);
    try {
      await deleteOrderFn({ data: { orderNumber: confirmOrder } });
      await refreshOrders();
      setConfirmOrder(null);
    } catch (e) {
      console.error("[admin] delete order failed", e);
      alert("Não foi possível excluir o pedido.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!confirmCustomer || !isAdminUser) return;
    setDeleting(true);
    try {
      await deleteCustomerFn({
        data: { email: confirmCustomer.email, kind: confirmCustomer.kind },
      });
      if (confirmCustomer.kind === "manual") {
        await loadManual();
      } else {
        await refreshCustomers();
      }
      setConfirmCustomer(null);
    } catch (e) {
      console.error("[admin] delete customer failed", e);
      alert("Não foi possível excluir o cliente.");
    } finally {
      setDeleting(false);
    }
  };



  const loadNewsletter = useCallback(async () => {
    const { data } = await supabase
      .from("newsletter_subscribers")
      .select("id, email, created_at")
      .order("created_at", { ascending: false });
    if (data) setNewsletter(data as NewsletterRow[]);
  }, []);
  const loadManual = useCallback(async () => {
    const { data } = await supabase
      .from("manual_customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setManual(data as ManualCustomerRow[]);
  }, []);

  useEffect(() => {
    if (open && isAdminUser) {
      void loadNewsletter();
      void loadManual();
    }
  }, [open, isAdminUser, loadNewsletter, loadManual]);

  if (!open || !isAdminUser) return null;

  const customers = listCustomers();

  const tabs = [
    { id: "calc" as const, label: "Calculadora" },
    { id: "pedidos" as const, label: `Pedidos (${orders.length})` },
    { id: "clientes" as const, label: `Clientes (${customers.length + manual.length})` },
  ];

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[95] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-300">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-10 rounded-full bg-background/80 p-2 backdrop-blur hover:text-accent"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <div className="border-b border-border px-8 py-6">
            <p className="flex items-center gap-2 text-[11px] tracking-luxe uppercase text-accent">
              <Shield className="h-3 w-3" /> Painel Admin · A&amp;S Conccept
            </p>
            <h2 className="mt-1 font-serif text-3xl">Gestão Interna</h2>
          </div>
          <div className="flex gap-1 border-b border-border px-8 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative whitespace-nowrap px-5 py-3 text-[11px] tracking-luxe uppercase transition-colors ${
                  tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute inset-x-2 -bottom-[1px] h-[2px] bg-accent" />
                )}
              </button>
            ))}
          </div>

          <div className="px-8 py-6">
            {tab === "calc" && (
              <div className="space-y-10">
                <MarkupCalculator />
                <FinancialOverview />
              </div>
            )}

            {tab === "pedidos" && (
              <>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                    {orders.length} pedidos registrados
                  </p>
                  <button
                    onClick={() => setShowManualOrder(true)}
                    className="inline-flex items-center gap-1.5 border border-charcoal bg-charcoal px-3 py-1.5 text-[10px] tracking-luxe uppercase text-ivory hover:bg-navy transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Adicionar Novo Pedido Manualmente
                  </button>
                </div>
                {orders.length === 0 ? (
                  <p className="border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
                    Nenhum pedido registrado no momento.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] tracking-luxe uppercase text-muted-foreground">
                          <th className="py-3 pr-3">Cliente</th>
                          <th className="py-3 pr-3">E-mail</th>
                          <th className="py-3 pr-3">Produto</th>
                          <th className="py-3 pr-3">Tam</th>
                          <th className="py-3 pr-3 text-right">Qtd</th>
                          <th className="py-3 pr-3 text-right">Total</th>
                          <th className="py-3 pr-3">Status</th>
                          <th className="py-3 pr-3 text-right">Ações</th>
                        </tr>

                      </thead>
                      <tbody>
                        {orders.map((o) =>
                          o.items.map((i, ix) => (
                            <tr
                              key={`${o.id}-${i.id}-${i.size}-${ix}`}
                              className="border-b border-border/50 align-top"
                            >
                              <td className="py-3 pr-3 font-serif">
                                {o.customerName ?? o.customerEmail.split("@")[0]}
                              </td>
                              <td className="py-3 pr-3 text-[11px] text-muted-foreground">
                                {o.customerEmail}
                              </td>
                              <td className="py-3 pr-3">
                                <div className="flex items-center gap-2">
                                  {i.image && (
                                    <img
                                      src={i.image}
                                      alt={i.name}
                                      className="h-12 w-9 flex-none object-cover border border-border/60"
                                    />
                                  )}
                                  <span className="font-serif leading-tight">{i.name}</span>
                                </div>
                              </td>
                              <td className="py-3 pr-3">{i.size}</td>
                              <td className="py-3 pr-3 text-right tabular-nums">{i.quantity}</td>
                              <td className="py-3 pr-3 text-right font-serif tabular-nums">
                                {ix === 0 ? formatBRL(o.total) : ""}
                              </td>
                              <td className="py-3 pr-3">
                                {ix === 0 && (
                                  <select
                                    value={o.status}
                                    onChange={(e) =>
                                      updateStatus(o.id, e.target.value as OrderStatus)
                                    }
                                    className="border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent"
                                  >
                                    {ADMIN_STATUSES.map((s) => (
                                      <option key={s} value={s}>
                                        {s === "Aguardando Aprovação"
                                          ? "Aprovar"
                                          : s === "Preparando pedido"
                                            ? "Preparando Pedido"
                                            : s === "Em trânsito"
                                              ? "Em Trânsito"
                                              : s}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>
                              <td className="py-3 pr-3 text-right">
                                {ix === 0 && (
                                  <button
                                    onClick={() => setConfirmOrder(o.id)}
                                    aria-label={`Excluir pedido ${o.id}`}
                                    title="Excluir pedido"
                                    className="inline-flex items-center justify-center border border-border p-1.5 text-muted-foreground transition-colors hover:border-destructive hover:bg-destructive hover:text-ivory"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  </button>
                                )}
                              </td>
                            </tr>

                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === "clientes" && (
              <div className="space-y-10">
                <section>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                      Clientes cadastrados
                    </h3>
                    <button
                      onClick={() => setShowManualCustomer(true)}
                      className="inline-flex items-center gap-1.5 border border-charcoal bg-charcoal px-3 py-1.5 text-[10px] tracking-luxe uppercase text-ivory hover:bg-navy transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Adicionar Cliente Manualmente
                    </button>
                  </div>
                  {customers.length === 0 && manual.length === 0 ? (
                    <p className="border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
                      Nenhum cliente registrado ainda.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] tracking-luxe uppercase text-muted-foreground">
                          <th className="py-3 pr-4">Nome</th>
                          <th className="py-3 pr-4">E-mail</th>
                          <th className="py-3 pr-4">Celular</th>
                          <th className="py-3 pr-4 text-right">Cadastrado em</th>
                          <th className="py-3 pr-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.map((c) => (
                          <tr key={`p-${c.email}`} className="border-b border-border/50">
                            <td className="py-3 pr-4 font-serif">
                              {c.name ?? c.email.split("@")[0]}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground">{c.email}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{c.phone ?? "—"}</td>
                            <td className="py-3 pr-4 text-right text-[11px] text-muted-foreground">
                              {c.createdAt
                                ? new Date(c.createdAt).toLocaleDateString("pt-BR")
                                : "—"}
                            </td>
                            <td className="py-3 pr-4 text-right">
                              <button
                                onClick={() =>
                                  setConfirmCustomer({
                                    email: c.email,
                                    kind: "auth",
                                    name: c.name ?? c.email,
                                  })
                                }
                                aria-label={`Excluir cliente ${c.email}`}
                                title="Excluir cliente"
                                className="inline-flex items-center justify-center border border-border p-1.5 text-muted-foreground transition-colors hover:border-destructive hover:bg-destructive hover:text-ivory"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {manual.map((m) => (
                          <tr key={`m-${m.id}`} className="border-b border-border/50">
                            <td className="py-3 pr-4 font-serif">
                              {m.name ?? m.email.split("@")[0]}
                              <span className="ml-2 text-[9px] tracking-luxe uppercase text-accent">
                                · manual
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground">{m.email}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{m.phone ?? "—"}</td>
                            <td className="py-3 pr-4 text-right text-[11px] text-muted-foreground">
                              {new Date(m.created_at).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="py-3 pr-4 text-right">
                              <button
                                onClick={() =>
                                  setConfirmCustomer({
                                    email: m.email,
                                    kind: "manual",
                                    name: m.name ?? m.email,
                                  })
                                }
                                aria-label={`Excluir cliente ${m.email}`}
                                title="Excluir cliente"
                                className="inline-flex items-center justify-center border border-border p-1.5 text-muted-foreground transition-colors hover:border-destructive hover:bg-destructive hover:text-ivory"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                  )}
                </section>

                <section>
                  <h3 className="mb-4 text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Newsletter · Convites solicitados ({newsletter.length})
                  </h3>
                  {newsletter.length === 0 ? (
                    <p className="border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
                      Nenhum e-mail capturado ainda.
                    </p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {newsletter.map((n) => (
                        <li
                          key={n.id}
                          className="flex items-center justify-between border border-border bg-card px-3 py-2 text-xs"
                        >
                          <span className="truncate">{n.email}</span>
                          <span className="ml-3 flex-none text-[10px] text-muted-foreground">
                            {new Date(n.created_at).toLocaleDateString("pt-BR")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      {showManualOrder && (
        <ManualOrderModal
          products={products}
          customers={customers.map((c) => ({
            email: c.email,
            name: c.name ?? c.email.split("@")[0],
          }))}
          onClose={() => setShowManualOrder(false)}
          onSaved={() => setShowManualOrder(false)}
          createOrder={createOrder}
        />
      )}
      {showManualCustomer && (
        <ManualCustomerModal
          onClose={() => setShowManualCustomer(false)}
          onSaved={async () => {
            setShowManualCustomer(false);
            await loadManual();
          }}
        />
      )}
      <ConfirmDialog
        open={!!confirmOrder}
        title="Excluir pedido"
        message={`Tem certeza que deseja remover o pedido ${confirmOrder ?? ""} permanentemente? Esta ação não pode ser desfeita.`}
        onConfirm={handleDeleteOrder}
        onCancel={() => !deleting && setConfirmOrder(null)}
        busy={deleting}
      />
      <ConfirmDialog
        open={!!confirmCustomer}
        title="Excluir cliente"
        message={`Esta ação excluirá o cadastro de ${confirmCustomer?.name ?? ""} e todos os dados associados. Deseja prosseguir?`}
        onConfirm={handleDeleteCustomer}
        onCancel={() => !deleting && setConfirmCustomer(null)}
        busy={deleting}
      />
    </>

  );
}

/* ---------- Markup Calculator ---------- */
const STRIPE_RATE = 0.0499;
const STRIPE_FIXED = 0.5;

function MarkupCalculator() {
  const [mode, setMode] = useState<"suggest" | "reverse">("suggest");

  // Modo 1 — sugerir preço a partir de custo + margem desejada
  const [cost, setCost] = useState<number>(100);
  const [margin, setMargin] = useState<number>(50);

  const desiredNet = cost + (cost * margin) / 100;
  const suggestedPrice = (desiredNet + STRIPE_FIXED) / (1 - STRIPE_RATE);
  const stripeFee = suggestedPrice * STRIPE_RATE + STRIPE_FIXED;
  const netReceived = suggestedPrice - stripeFee;
  const profit = netReceived - cost;

  // Modo 2 — descobrir margem real a partir de custo + preço fixo
  const [rCost, setRCost] = useState<number>(100);
  const [rPrice, setRPrice] = useState<number>(220);
  const rStripeFee = rPrice > 0 ? rPrice * STRIPE_RATE + STRIPE_FIXED : 0;
  const rNet = rPrice - rStripeFee;
  const rProfit = rNet - rCost;
  const rMarginPct = rPrice > 0 ? (rProfit / rPrice) * 100 : 0;
  const isLoss = rProfit < 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
            Central de Simulação Financeira
          </p>
          <h3 className="font-serif text-2xl">Calculadora de Markup</h3>
        </div>
        <div className="inline-flex border border-border">
          {[
            { id: "suggest" as const, label: "Simular Preço de Venda" },
            { id: "reverse" as const, label: "Descobrir Margem Real" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`px-4 py-2 text-[10px] tracking-luxe uppercase transition-colors ${
                mode === t.id
                  ? "bg-charcoal text-ivory"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "suggest" ? (
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-5">
            <p className="text-xs font-light text-muted-foreground">
              Insira o custo bruto e a margem líquida desejada. O preço de etiqueta é calculado para
              que, após as taxas Stripe Brasil (4,99% + R$ 0,50), você receba exatamente o custo
              somado à margem líquida.
            </p>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Custo do Produto (R$)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Margem de Lucro Desejada (%)
              </span>
              <input
                type="number"
                min={0}
                step="0.1"
                value={margin}
                onChange={(e) => setMargin(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>

          <div className="border border-border bg-[color:var(--ivory)]/40 p-6 space-y-4">
            <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">Resultado</p>
            <ResultRow label="Preço de Venda Sugerido (Etiqueta)" value={formatBRL(suggestedPrice)} highlight />
            <div className="border-t border-border/60" />
            <ResultRow label="Taxa Stripe Brasil (4,99% + R$ 0,50)" value={`− ${formatBRL(stripeFee)}`} />
            <ResultRow label="Você recebe (líquido)" value={formatBRL(netReceived)} />
            <ResultRow label="Custo do produto" value={`− ${formatBRL(cost)}`} />
            <div className="border-t border-border/60" />
            <ResultRow label="Lucro líquido" value={formatBRL(profit)} highlight />
          </div>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-5">
            <p className="text-xs font-light text-muted-foreground">
              Informe o custo do produto e o preço de venda que você já pratica. O sistema deduz a
              taxa Stripe Brasil (4,99% + R$ 0,50) e revela sua margem líquida real em tempo real.
            </p>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Custo do Produto (R$)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={rCost}
                onChange={(e) => setRCost(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Preço de Venda Praticado (R$)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={rPrice}
                onChange={(e) => setRPrice(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>

          <div className="border border-border bg-[color:var(--ivory)]/40 p-6 space-y-4">
            <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
              Diagnóstico Real
            </p>
            <ResultRow label="Preço de Venda" value={formatBRL(rPrice)} />
            <ResultRow
              label="Taxa Stripe Brasil (4,99% + R$ 0,50)"
              value={`− ${formatBRL(rStripeFee)}`}
            />
            <ResultRow label="Custo do Produto" value={`− ${formatBRL(rCost)}`} />
            <div className="border-t border-border/60" />
            <ResultRow
              label="Lucro Líquido (R$)"
              value={formatBRL(rProfit)}
              highlight
              tone={isLoss ? "loss" : "gold"}
            />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">
                Margem Líquida Real
              </span>
              <span
                className={`font-serif text-2xl tabular-nums ${
                  isLoss ? "text-[#7a1f1f]" : "text-[color:var(--gold)]"
                }`}
              >
                {rMarginPct.toFixed(2)}%
              </span>
            </div>
            {isLoss && (
              <p className="text-[11px] text-[#7a1f1f] font-light">
                Atenção: nesta configuração o produto opera em prejuízo após taxas.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({
  label,
  value,
  highlight,
  tone = "gold",
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "gold" | "loss";
}) {
  const color =
    highlight && tone === "loss"
      ? "text-[#7a1f1f]"
      : highlight
        ? "text-[color:var(--gold)]"
        : "";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums ${
          highlight ? `font-serif text-xl ${color}` : "text-sm"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ---------- Financial Overview ---------- */
// Estimativa institucional: 40% do preço de venda representa o CPV médio
// enquanto o custo real por SKU não é registrado no catálogo.
const COST_RATIO = 0.4;
const PIX_FEE_RATE = 0.05;

type FinancePoint = {
  label: string;
  gross: number;
  grossProfit: number;
  netProfit: number;
};

function FinancialOverview() {
  const { orders } = useOrders();

  const realOrders = useMemo(
    () => orders.filter((o) => o.status !== "Aguardando Aprovação"),
    [orders],
  );

  const { kpis, series } = useMemo(() => {
    let gross = 0;
    let cpv = 0;
    let fees = 0;
    for (const o of realOrders) {
      gross += o.subtotal;
      for (const it of o.items) {
        cpv += it.price * it.quantity * COST_RATIO;
      }
      fees += o.subtotal * STRIPE_RATE + STRIPE_FIXED;
      if (o.paymentMethod === "pix") fees += o.subtotal * PIX_FEE_RATE;
    }
    const grossProfit = gross - cpv;
    const netProfit = grossProfit - fees;
    const netMarginPct = gross > 0 ? (netProfit / gross) * 100 : 0;

    // Série semanal (últimas 4 semanas). Se histórico real for insuficiente,
    // preenche com curva realista crescente para preservar a leitura visual.
    const now = new Date();
    const weeks: FinancePoint[] = [];
    for (let i = 3; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(now.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      const label = `Sem ${4 - i}`;
      let g = 0;
      let c = 0;
      let f = 0;
      for (const o of realOrders) {
        const d = new Date(o.createdAt);
        if (d >= start && d <= end) {
          g += o.subtotal;
          for (const it of o.items) c += it.price * it.quantity * COST_RATIO;
          f += o.subtotal * STRIPE_RATE + STRIPE_FIXED;
          if (o.paymentMethod === "pix") f += o.subtotal * PIX_FEE_RATE;
        }
      }
      weeks.push({
        label,
        gross: g,
        grossProfit: g - c,
        netProfit: g - c - f,
      });
    }

    // Nunca substituímos os dados reais por valores fictícios: o painel
    // sempre reflete o faturamento efetivo, mesmo que seja próximo de zero.


    return {
      kpis: { gross, grossProfit, netProfit, netMarginPct },
      series: weeks,
    };
  }, [realOrders]);

  return (
    <div className="space-y-6">
      <div className="border-t border-border pt-6">
        <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
          Indicadores da Maison
        </p>
        <h3 className="font-serif text-2xl">Visão Geral Financeira</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Faturamento Total" value={formatBRL(kpis.gross)} accent="navy" />
        <KpiCard label="Lucro Bruto" value={formatBRL(kpis.grossProfit)} accent="charcoal" />
        <KpiCard label="Lucro Líquido Real" value={formatBRL(kpis.netProfit)} accent="gold" />
        <KpiCard
          label="Margem Líquida Média"
          value={`${kpis.netMarginPct.toFixed(1)}%`}
          accent="gold"
        />
      </div>

      <div className="border border-border bg-[color:var(--ivory)]/40 p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
              Evolução · Últimas 4 semanas
            </p>
            <p className="text-xs text-muted-foreground font-light">
              Faturamento, lucro bruto e lucro líquido real após taxas Stripe e Pix.
            </p>
          </div>
        </div>
        <FinanceChart data={series} />
        <div className="mt-4 flex flex-wrap gap-5 text-[10px] tracking-luxe uppercase text-muted-foreground">
          <LegendDot color="var(--navy)" label="Faturamento" />
          <LegendDot color="var(--charcoal)" label="Lucro Bruto" />
          <LegendDot color="var(--gold)" label="Lucro Líquido" />
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "navy" | "charcoal" | "gold";
}) {
  const color =
    accent === "gold"
      ? "text-[color:var(--gold)]"
      : accent === "navy"
        ? "text-[color:var(--navy)]"
        : "text-[color:var(--charcoal)]";
  return (
    <div className="border border-border bg-background p-5">
      <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">{label}</p>
      <p className={`mt-2 font-serif text-2xl tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function FinanceChart({ data }: { data: FinancePoint[] }) {
  const w = 640;
  const h = 240;
  const padX = 40;
  const padY = 24;
  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.gross, d.grossProfit, d.netProfit)),
    1,
  );
  const stepX = (w - padX * 2) / Math.max(1, data.length - 1);

  const toPath = (key: keyof Omit<FinancePoint, "label">) =>
    data
      .map((d, i) => {
        const x = padX + i * stepX;
        const y = h - padY - ((d[key] as number) / maxVal) * (h - padY * 2);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const areaPath = (() => {
    const line = toPath("gross");
    const first = padX;
    const last = padX + (data.length - 1) * stepX;
    const bottom = h - padY;
    return `${line} L ${last.toFixed(1)} ${bottom} L ${first.toFixed(1)} ${bottom} Z`;
  })();

  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-[240px]"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="grossFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--navy)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--navy)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <line
            key={r}
            x1={padX}
            x2={w - padX}
            y1={h - padY - r * (h - padY * 2)}
            y2={h - padY - r * (h - padY * 2)}
            stroke="currentColor"
            strokeOpacity="0.08"
          />
        ))}
        <path d={areaPath} fill="url(#grossFill)" />
        <path d={toPath("gross")} fill="none" stroke="var(--navy)" strokeWidth="2" />
        <path
          d={toPath("grossProfit")}
          fill="none"
          stroke="var(--charcoal)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path d={toPath("netProfit")} fill="none" stroke="var(--gold)" strokeWidth="2" />

        {data.map((d, i) => {
          const x = padX + i * stepX;
          return (
            <g key={i}>
              <rect
                x={x - stepX / 2}
                y={0}
                width={stepX}
                height={h}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              <text
                x={x}
                y={h - 6}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                opacity="0.6"
              >
                {d.label}
              </text>
              {(["gross", "grossProfit", "netProfit"] as const).map((k) => {
                const y = h - padY - ((d[k] as number) / maxVal) * (h - padY * 2);
                const color =
                  k === "gross"
                    ? "var(--navy)"
                    : k === "grossProfit"
                      ? "var(--charcoal)"
                      : "var(--gold)";
                return <circle key={k} cx={x} cy={y} r={hover === i ? 4 : 2.5} fill={color} />;
              })}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-2 right-2 border border-border bg-background/95 backdrop-blur px-4 py-3 shadow-sm text-xs">
          <p className="text-[10px] tracking-luxe uppercase text-muted-foreground mb-1">
            {data[hover].label}
          </p>
          <p className="tabular-nums">
            <span className="text-[color:var(--navy)]">■</span> Faturamento:{" "}
            {formatBRL(data[hover].gross)}
          </p>
          <p className="tabular-nums">
            <span className="text-[color:var(--charcoal)]">■</span> Lucro Bruto:{" "}
            {formatBRL(data[hover].grossProfit)}
          </p>
          <p className="tabular-nums">
            <span className="text-[color:var(--gold)]">■</span> Lucro Líquido:{" "}
            {formatBRL(data[hover].netProfit)}
          </p>
        </div>
      )}
    </div>
  );
}


/* ---------- Manual Order Modal ---------- */
function ManualOrderModal({
  products,
  customers,
  onClose,
  onSaved,
  createOrder,
}: {
  products: Product[];
  customers: { email: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  createOrder: ReturnType<typeof useOrders>["createOrder"];
}) {
  const [customerEmail, setCustomerEmail] = useState(customers[0]?.email ?? "");
  const [customerName, setCustomerName] = useState(customers[0]?.name ?? "");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [size, setSize] = useState<Size>("M");
  const [qty, setQty] = useState<number>(1);
  const [total, setTotal] = useState<number>(products[0]?.price ?? 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const chosen = products.find((p) => p.id === productId);

  const save = async () => {
    setErr(null);
    if (!customerEmail || !chosen) {
      setErr("Selecione um cliente e um produto.");
      return;
    }
    setSaving(true);
    try {
      await createOrder({
        customerEmail,
        customerName,
        items: [
          {
            id: chosen.id,
            name: chosen.name,
            price: Number(total) / Math.max(1, qty),
            image: chosen.image,
            quantity: qty,
            size,
          },
        ],
        address: {
          cep: "",
          logradouro: "",
          numero: "",
          bairro: "",
          cidade: "",
          uf: "",
        },
        shippingCost: 0,
        subtotal: Number(total),
        total: Number(total),
        paymentMethod: "pix",
        status: "Preparando pedido",
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message ?? "Falha ao salvar pedido.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[110] bg-charcoal/70 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg bg-background p-8 shadow-2xl relative">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 hover:text-accent"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="text-[11px] tracking-luxe uppercase text-accent">Registrar venda</p>
          <h3 className="mt-1 font-serif text-2xl">Novo Pedido Manual</h3>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Cliente
              </span>
              {customers.length > 0 ? (
                <select
                  value={customerEmail}
                  onChange={(e) => {
                    setCustomerEmail(e.target.value);
                    const c = customers.find((x) => x.email === e.target.value);
                    if (c) setCustomerName(c.name);
                  }}
                  className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {customers.map((c) => (
                    <option key={c.email} value={c.email}>
                      {c.name} · {c.email}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                />
              )}
            </label>

            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Produto
              </span>
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  const p = products.find((x) => x.id === e.target.value);
                  if (p) setTotal(p.price * qty);
                }}
                className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatBRL(p.price)}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                  Tamanho
                </span>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value as Size)}
                  className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                  Quantidade
                </span>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => {
                    const q = Math.max(1, Math.floor(Number(e.target.value) || 1));
                    setQty(q);
                    if (chosen) setTotal(chosen.price * q);
                  }}
                  className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Valor Total Negociado (R$)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={total}
                onChange={(e) => setTotal(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>

            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="border border-border px-4 py-2 text-[11px] tracking-luxe uppercase hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-charcoal px-5 py-2 text-[11px] tracking-luxe uppercase text-ivory hover:bg-navy disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar Pedido"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Manual Customer Modal ---------- */
function ManualCustomerModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErr("Informe um e-mail válido.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("manual_customers")
      .insert({
        name: name.trim() || null,
        email: cleanEmail,
        phone: phone.trim() || null,
      } as never);
    setSaving(false);
    if (error) {
      setErr("Não foi possível salvar o cliente.");
      return;
    }
    await onSaved();
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[110] bg-charcoal/70 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-background p-8 shadow-2xl relative">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 hover:text-accent"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="text-[11px] tracking-luxe uppercase text-accent">Cadastro rápido</p>
          <h3 className="mt-1 font-serif text-2xl">Novo Cliente</h3>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">Nome</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Celular (WhatsApp)
              </span>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="(11) 98765-4321"
                value={phone}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                  let out = d;
                  if (d.length > 2 && d.length <= 7) out = `(${d.slice(0, 2)}) ${d.slice(2)}`;
                  else if (d.length > 7)
                    out = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
                  else if (d.length > 0) out = `(${d}`;
                  setPhone(out);
                }}
                className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="border border-border px-4 py-2 text-[11px] tracking-luxe uppercase hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-charcoal px-5 py-2 text-[11px] tracking-luxe uppercase text-ivory hover:bg-navy disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar Cliente"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Coupon Row (Cart) ---------- */
function CouponRow({ subtotal }: { subtotal: number }) {
  const { user, openAuth } = useAuth();
  const { couponCode, couponDiscount, setCoupon } = useCart();
  const [code, setCode] = useState(couponCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const apply = async () => {
    setError(null);
    if (!user) {
      openAuth();
      return;
    }
    const c = findCoupon(code);
    if (!c) {
      setError("Cupom inválido.");
      return;
    }
    setLoading(true);
    const already = await hasUsedCoupon(user.id, c.code);
    setLoading(false);
    if (already) {
      setError("Este cupom já foi utilizado por você.");
      return;
    }
    setCoupon(c);
  };

  const clear = () => {
    setCoupon(null);
    setCode("");
    setError(null);
  };

  if (couponCode) {
    return (
      <div className="flex items-center justify-between border border-[color:var(--gold)]/50 bg-[color:var(--gold)]/5 px-3 py-2 text-xs">
        <span className="text-[color:var(--gold)] tracking-luxe uppercase">
          ✦ {couponCode} · − {formatBRL(couponDiscount)}
        </span>
        <button onClick={clear} className="text-[10px] tracking-luxe uppercase text-muted-foreground hover:text-destructive">
          Remover
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Cupom"
          className="flex-1 border border-border bg-transparent px-2 py-1.5 text-xs uppercase outline-none focus:border-accent"
        />
        <button
          onClick={apply}
          disabled={loading}
          className="border border-charcoal px-3 py-1.5 text-[10px] tracking-luxe uppercase hover:bg-charcoal hover:text-ivory transition-colors disabled:opacity-50"
        >
          Aplicar
        </button>
      </div>
      {error && <p className="mt-1 text-[10px] text-destructive">{error}</p>}
      {AVAILABLE_COUPONS.length > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Dica: use <span className="font-mono text-[color:var(--gold)]">10%OFFF</span> — válido uma vez por cliente.
        </p>
      )}
    </div>
  );
}

/* ---------- Welcome Coupon Popup (post-signup) ---------- */
function WelcomeCouponPopup() {
  const { justSignedUp, clearJustSignedUp, user } = useAuth();
  const [copied, setCopied] = useState(false);
  if (!justSignedUp || !user) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText("10%OFFF");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };
  return (
    <>
      <div className="fixed inset-0 z-[120] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300" onClick={clearJustSignedUp} />
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-md bg-[color:var(--ivory)] p-10 text-charcoal shadow-2xl animate-in fade-in zoom-in-95 duration-500">
          <button onClick={clearJustSignedUp} aria-label="Fechar" className="absolute right-4 top-4 hover:text-[color:var(--gold)]">
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="text-[11px] tracking-luxe uppercase text-[color:var(--gold)]">Bem-vindo à Maison</p>
          <h2 className="mt-2 font-serif text-3xl leading-tight">
            Um presente<br />de estreia ✦
          </h2>
          <p className="mt-4 text-sm font-light text-charcoal/80">
            Sua adesão à A&amp;S Conccept desbloqueia 10% de desconto na primeira compra.
          </p>
          <div className="mt-6 border border-dashed border-[color:var(--gold)] bg-white p-4 text-center">
            <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">Cupom exclusivo</p>
            <p className="mt-1 font-mono text-2xl tracking-widest text-[color:var(--gold)]">10%OFFF</p>
            <button
              onClick={copy}
              className="mt-3 text-[10px] tracking-luxe uppercase text-charcoal hover:text-[color:var(--gold)] underline underline-offset-4"
            >
              {copied ? "Copiado ✦" : "Copiar código"}
            </button>
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
            Válido uma única vez por cliente, sobre o subtotal, sem cumulatividade com outras ofertas.
          </p>
          <button
            onClick={clearJustSignedUp}
            className="mt-6 w-full bg-charcoal py-3 text-[11px] tracking-luxe uppercase text-ivory hover:bg-navy transition-colors"
          >
            Explorar a coleção
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- Testimonials ---------- */
type TestimonialRow = {
  id: string;
  customer_name: string;
  content: string;
  rating: number;
  sort_order: number;
};

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < n ? "text-[color:var(--gold)]" : "text-muted-foreground/30"}>★</span>
      ))}
    </span>
  );
}

function Testimonials() {
  const isAdmin = useIsAdmin();
  const [rows, setRows] = useState<TestimonialRow[]>([]);
  const [idx, setIdx] = useState(0);
  const [editing, setEditing] = useState<TestimonialRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("testimonials")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setRows(data as TestimonialRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (rows.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % rows.length), 6500);
    return () => clearInterval(id);
  }, [rows.length]);

  if (rows.length === 0 && !isAdmin) return null;
  const current = rows[idx % Math.max(1, rows.length)];

  const save = async (t: Partial<TestimonialRow> & { id?: string }) => {
    if (t.id) {
      await supabase.from("testimonials").update({
        customer_name: t.customer_name, content: t.content, rating: t.rating, sort_order: t.sort_order ?? 0,
      } as never).eq("id", t.id);
    } else {
      await supabase.from("testimonials").insert({
        customer_name: t.customer_name, content: t.content, rating: t.rating ?? 5, sort_order: t.sort_order ?? rows.length,
      } as never);
    }
    setEditing(null); setCreating(false); await load();
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir depoimento?")) return;
    await supabase.from("testimonials").delete().eq("id", id);
    await load();
  };

  return (
    <section className="border-t border-border bg-secondary/30 py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p className="mb-4 text-[11px] tracking-luxe uppercase text-accent">Prova Social</p>
        <h2 className="font-serif text-3xl md:text-5xl">Vozes da Maison</h2>

        {current && (
          <figure key={current.id} className="mt-12 animate-in fade-in duration-700">
            <Stars n={current.rating} />
            <blockquote className="mt-6 font-serif text-xl md:text-2xl italic leading-relaxed text-charcoal">
              “{current.content}”
            </blockquote>
            <figcaption className="mt-6 text-[11px] tracking-luxe uppercase text-muted-foreground">
              — {current.customer_name}
            </figcaption>
          </figure>
        )}

        {rows.length > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            {rows.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Depoimento ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-8 bg-[color:var(--gold)]" : "w-2 bg-border hover:bg-muted-foreground"}`}
              />
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="mt-10 border-t border-border pt-6 text-left">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">Admin · Depoimentos</p>
              <button
                onClick={() => { setCreating(true); setEditing({ id: "", customer_name: "", content: "", rating: 5, sort_order: rows.length }); }}
                className="inline-flex items-center gap-1 border border-accent px-3 py-1.5 text-[10px] tracking-luxe uppercase text-accent hover:bg-accent hover:text-charcoal"
              >
                <Plus className="h-3 w-3" /> Novo
              </button>
            </div>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 border border-border bg-background px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-serif">{r.customer_name} · <Stars n={r.rating} /></p>
                    <p className="truncate text-muted-foreground">{r.content}</p>
                  </div>
                  <div className="flex flex-none gap-1">
                    <button onClick={() => { setEditing(r); setCreating(false); }} className="border border-border p-1 hover:border-accent"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => remove(r.id)} className="border border-destructive/60 p-1 text-destructive hover:bg-destructive hover:text-ivory"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {editing && (
        <TestimonialEditor
          initial={editing}
          isCreate={creating}
          onCancel={() => { setEditing(null); setCreating(false); }}
          onSave={save}
        />
      )}
    </section>
  );
}

function TestimonialEditor({
  initial, isCreate, onCancel, onSave,
}: {
  initial: TestimonialRow;
  isCreate: boolean;
  onCancel: () => void;
  onSave: (t: Partial<TestimonialRow> & { id?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial.customer_name);
  const [content, setContent] = useState(initial.content);
  const [rating, setRating] = useState(initial.rating || 5);
  return (
    <>
      <div onClick={onCancel} className="fixed inset-0 z-[100] bg-charcoal/70 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-background p-6 shadow-2xl">
          <p className="text-[11px] tracking-luxe uppercase text-accent">
            {isCreate ? "Novo depoimento" : "Editar depoimento"}
          </p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">Nome</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent" />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">Depoimento</span>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} className="mt-1 w-full border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent" />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">Estrelas (1-5)</span>
              <input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(Math.max(1, Math.min(5, Number(e.target.value) || 5)))} className="mt-1 w-24 border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent" />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={onCancel} className="border border-border px-4 py-2 text-[11px] tracking-luxe uppercase hover:bg-secondary">Cancelar</button>
            <button
              onClick={() => onSave({ id: isCreate ? undefined : initial.id, customer_name: name.trim(), content: content.trim(), rating })}
              className="bg-accent px-4 py-2 text-[11px] tracking-luxe uppercase text-charcoal hover:bg-accent/90"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
