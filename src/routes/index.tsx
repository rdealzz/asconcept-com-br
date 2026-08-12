import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Search,
  User as UserIcon,
  ShoppingBag,
  X,
  Plus,
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
  Star,
} from "lucide-react";
import { useOrders } from "@/lib/orders-context";
import { isPrePaymentStatus, type Order, type OrderStatus } from "@/lib/types";
import { useCart, formatBRL, type Product, type ProductCategory } from "@/lib/cart-context";
import {
  PRODUCT_CATEGORIES,
  CATEGORY_LABELS,
  categoryCopy,
  categoryLabel,
  coerceCategory,
} from "@/lib/categories";
import { useAuth } from "@/lib/auth-context";
import {
  useCatalog,
  emptyStock,
  totalStock,
  type OptionalColumn,
  type Size,
  type SizeStock,
} from "@/lib/catalog-context";
import {
  SIZE_GRIDS,
  SIZE_GRID_LABELS,
  gridOfSizes,
  sizesForProduct,
  suggestSizeGrid,
  type SizeGridId,
} from "@/lib/sizes";
import { collapseVariants, groupOf, productParam } from "@/lib/variants";
import { ColorSwatches } from "@/components/ColorSwatches";
import { VariantsAdmin, SQL_VARIACOES } from "@/components/VariantsAdmin";
import { StorageSecurityNote } from "@/components/StorageSecurityNote";
import { supabase } from "@/integrations/supabase/client";
import { productImageSrc, productImageSrcSet, uploadProductPhoto } from "@/lib/product-images";

import { FavoriteButton, ShareButton } from "@/components/ProductActions";
import { StitchDivider } from "@/components/StitchDivider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader } from "@/components/Loader";
import { Eyebrow, PillButton } from "@/components/ui-kit";
import { Showroom } from "@/components/Showroom";
import { ProductCardMeta } from "@/components/ProductCardMeta";
import { economizandoDados, noOcioso, temHover, useNearViewport } from "@/lib/near-viewport";
import { Inview, StackedLines, WordReveal, useScrollProgress } from "@/lib/motion";
import { useVisualShell } from "@/lib/visual-shell";
import { EmptyCategoryState } from "@/components/EmptyCategoryState";

import {
  SUPPORT_EMAIL,
  WHATSAPP_DISPLAY,
  WHATSAPP_LINK,
  openWhatsApp,
} from "@/components/WhatsAppFab";

import heroAsset from "@/assets/hero-amalfi-men.jpg.asset.json";
const hero = heroAsset.url;
import editorialAsset from "@/assets/editorial-linen.jpg.asset.json";
const editorial = editorialAsset.url;

export const Route = createFileRoute("/")({
  component: Index,
});

const SNEAKERS_LAUNCH = new Date("2026-09-01T00:00:00-03:00").getTime();

/** Máximo de fotos por produto no formulário do admin. */
const MAX_PRODUCT_IMAGES = 5;

function useIsAdmin() {
  const { user } = useAuth();
  return !!user?.isAdmin;
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
  const [pronto, setPronto] = useState(false);

  useVisualShell();

  // Quem chega na home com #produtos (voltando da página de produto, ou pelo
  // rodapé) precisa da mesma folga do cabeçalho fixo — o pulo nativo do
  // navegador deixaria o topo da seção escondido atrás dele.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    // Um respiro para a grade montar antes de medir a posição.
    const t = setTimeout(() => scrollToSection(hash), 250);
    return () => clearTimeout(t);
  }, []);

  // Link antigo de compartilhamento: `/?produto=<id>` era o que o botão
  // "Copiar link" gerava, e ninguém lia esse parâmetro — quem recebia o link
  // caía na home, sem a peça. Os links já espalhados por aí passam a abrir a
  // página da peça. O botão hoje gera a URL certa (ver `ProductActions`).
  const navegar = useNavigate();
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("produto");
    if (!id) return;
    void navegar({ to: "/produto/$id", params: { id }, replace: true });
  }, [navegar]);

  return (
    <SearchProvider>
      <ProductProvider>
        <Loader onReady={() => setPronto(true)} />
        <div className="min-h-screen bg-background text-foreground">
          <Nav
            onOpenFilter={() => setFilterOpen(true)}
            onOpenAccount={() => setAccountOpen(true)}
            onOpenAdmin={() => setAdminOpen(true)}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
          />
          {/* O respiro em volta é o que dá o enquadramento em cartão: cada
              seção vira um bloco arredondado sobre o fundo da página. */}
          <main className="w-full overflow-x-clip p-2 sm:p-3">
            <Hero pronto={pronto} />
            <div className="mx-auto max-w-[1600px] px-6 pt-10 md:px-12 md:pt-14">
              <StitchDivider label="The New Era of Heritage" />
            </div>
            {/* Abas e grade no mesmo bloco: assim a barra fixa solta o topo
                quando a vitrine acaba, em vez de acompanhar a página inteira e
                passar por cima das seções seguintes. */}
            <div className="relative">
              <CategoryTabs />
              <ShowroomBand />
              <Products />
            </div>

            <Concept />
            <Testimonials />
            <Newsletter />
            <Footer />
          </main>
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
  );
}

/* ---------- Product Modal Context ---------- */
/**
 * Contexto do fluxo de admin (editar / criar produto). A visualização do
 * produto deixou de morar aqui: agora é a rota /produto/$id.
 */
const ProductCtx = createContext<{
  editingId: string | null;
  openEdit: (id: string) => void;
  closeEdit: () => void;
  creatingCategory: ProductCategory | null;
  openCreate: (c: ProductCategory) => void;
} | null>(null);

function ProductProvider({ children }: { children: React.ReactNode }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingCategory, setCreating] = useState<ProductCategory | null>(null);
  return (
    <ProductCtx.Provider
      value={{
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
  const { open: openSearch, setTab } = useSearch();
  const isAdmin = useIsAdmin();
  const isDevMaster = !!user?.isAdmin;
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLink =
    "asc-label relative transition-colors duration-ascfast ease-asc after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-asc-gold after:transition-all after:duration-asc after:ease-asc hover:after:w-full hover:text-asc-gold";

  return (
    <header
      className={`fixed top-0 z-50 w-full border-b transition-all duration-asc ease-asc ${
        scrolled
          ? "border-asc-line bg-asc-bg/80 py-2 backdrop-blur-md md:py-3"
          : "border-transparent bg-transparent py-4 md:py-6"
      }`}
    >
      <div className="mx-auto grid max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center px-4 md:px-10">
        <div
          className={`flex items-center gap-5 ${
            scrolled ? "text-asc-ink" : "text-asc-ink-inverse"
          }`}
        >
          {/* Mobile hamburger */}
          <button
            aria-label="Abrir menu"
            onClick={onOpenMobileMenu}
            className="transition-colors duration-ascfast ease-asc hover:text-asc-gold md:hidden"
          >
            <Menu className="h-5 w-5" strokeWidth={1.25} />
          </button>
          {/* Desktop filter */}
          <button
            aria-label="Filtrar categoria"
            onClick={onOpenFilter}
            className="hidden transition-colors duration-ascfast ease-asc hover:text-asc-gold md:inline-flex"
          >
            <Menu className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {/* Botões, e não <a href="#id">: o pulo nativo esconde a seção atrás
              do cabeçalho fixo e, no caso da barra de abas (sticky), nem
              chegava a sair do lugar. */}
          <nav className="hidden items-center gap-9 md:flex">
            <button
              onClick={() => {
                setTab("clothes");
                scrollToSection("produtos");
              }}
              className={navLink}
            >
              Coleção
            </button>
            {/* Acessórios leva à mesma vitrine, já filtrada — é uma categoria
                do catálogo, não uma rota nova. */}
            <button
              onClick={() => {
                setTab("acessorios");
                scrollToSection("produtos");
              }}
              className={navLink}
            >
              {CATEGORY_LABELS.acessorios}
            </button>
            <button onClick={() => scrollToSection("edit")} className={navLink}>
              O Editorial
            </button>
            <button onClick={() => scrollToSection("about")} className={navLink}>
              Somente por Convite
            </button>
          </nav>
        </div>
        <a
          href="#"
          className={`whitespace-nowrap text-center font-display tracking-wide transition-all duration-asc ease-asc ${
            scrolled ? "text-xl md:text-2xl" : "text-2xl md:text-3xl"
          } ${scrolled ? "text-asc-ink" : "text-asc-ink-inverse"}`}
        >
          A<span className="text-asc-gold">&amp;</span>S{" "}
          <span className="font-light italic">Conccept</span>
          {isAdmin && (
            <span className="asc-label ml-2 hidden align-middle text-[9px] text-asc-gold md:inline">
              · Dev
            </span>
          )}
        </a>
        <div
          className={`flex items-center justify-end gap-4 md:gap-5 ${
            scrolled ? "text-asc-ink" : "text-asc-ink-inverse"
          }`}
        >
          <button
            aria-label="Buscar"
            onClick={openSearch}
            className="hidden transition-colors duration-ascfast ease-asc hover:text-asc-gold md:inline-flex"
          >
            <Search className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <ThemeToggle className="hidden md:inline-flex [&>svg]:h-4 [&>svg]:w-4" />
          <button
            onClick={() => (user ? onOpenAccount() : openAuth())}
            aria-label={user ? "Minha Conta" : "Entrar"}
            title={user ? `${user.email}` : "Entrar"}
            className="hidden transition-colors duration-ascfast ease-asc hover:text-asc-gold md:inline-flex"
          >
            <UserIcon className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            aria-label="Sacola"
            onClick={open}
            className="relative transition-colors duration-ascfast ease-asc hover:text-asc-gold"
          >
            <ShoppingBag className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.5} />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-asc-gold px-1 text-[10px] font-medium text-asc-bg">
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
                className="hidden transition-colors duration-ascfast ease-asc hover:text-asc-gold md:inline-flex"
              >
                <Package className="h-4 w-4" strokeWidth={1.5} />
              </Link>
              <button
                aria-label="Painel Admin"
                onClick={onOpenAdmin}
                title="Painel Admin"
                className="relative hidden transition-colors duration-ascfast ease-asc hover:text-asc-gold md:inline-flex"
              >
                <Settings className="h-4 w-4" strokeWidth={1.5} />
                <span className="absolute -right-2 -top-2 h-1.5 w-1.5 rounded-full bg-asc-gold" />
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
    // Espera o painel fechar antes de rolar, senão a animação atropela.
    setTimeout(() => scrollToSection(id), 180);
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
        className={`fixed inset-y-0 left-0 z-[90] flex w-[88%] max-w-sm flex-col bg-asc-bg-raised text-foreground transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <span className="font-serif text-lg tracking-wider">
            A<span className="text-accent">&amp;</span>S Conccept
          </span>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button onClick={onClose} aria-label="Fechar menu" className="hover:text-accent">
              <X className="h-5 w-5" strokeWidth={1.25} />
            </button>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-6 py-8">
          <p className="mb-3 text-[10px] tracking-luxe uppercase text-muted-foreground">Coleção</p>
          {PRODUCT_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => {
                setTab(c);
                goTo("produtos");
              }}
              className="py-3 text-left font-serif text-2xl leading-tight hover:text-accent"
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
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
/**
 * Abertura editorial: título gigante que sobe de trás de uma máscara, palavra
 * por palavra, sobre a foto em parallax. As animações só começam quando a tela
 * de abertura termina — daí o `pronto`.
 */
function Hero({ pronto }: { pronto: boolean }) {
  const placa = useRef<HTMLDivElement>(null);

  // A foto é maior que a seção e sobe deslocada, para o parallax nunca
  // descobrir uma borda.
  const secao = useScrollProgress<HTMLElement>((p) => {
    if (placa.current) placa.current.style.transform = `translateY(${p * 12}%)`;
  });

  return (
    <section
      ref={secao}
      className="asc-gravure asc-on-dark relative isolate w-full overflow-hidden rounded-[2rem] bg-asc-bg-dark"
      style={{ height: "calc(100svh - 1.5rem)", minHeight: "36rem" }}
    >
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div ref={placa} className="absolute inset-x-0 -top-[16%] h-[132%] w-full">
          <img
            src={hero}
            alt="Editorial A&S Conccept"
            width={1920}
            height={1280}
            fetchPriority="high"
            className="h-full w-full object-cover object-[65%_center] md:object-center"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/65 via-charcoal/35 to-charcoal/80" />
      </div>

      <div className="flex h-full flex-col">
        <div className="flex-1" />

        <div className="px-6 sm:px-10">
          <p
            className="asc-tagline mb-4 transition-all duration-ascslow ease-asc"
            style={{ opacity: pronto ? 1 : 0, transform: pronto ? "none" : "translateY(8px)" }}
          >
            Coleção Outono / Inverno
          </p>
          <h1
            className="font-display-wide font-medium uppercase text-ivory"
            style={{
              fontSize: "12.5vw",
              lineHeight: 0.85,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
            }}
          >
            <WordReveal text="A Nova Era" play={pronto} stagger={140} duration={1100} />
          </h1>
        </div>

        <div className="mt-auto flex flex-col gap-6 px-6 pb-8 sm:flex-row sm:items-end sm:justify-between sm:px-10 sm:pb-10">
          <p
            className="font-display-wide font-medium uppercase text-ivory/85"
            style={{ fontSize: "2.4rem", lineHeight: 0.95, letterSpacing: "-0.01em" }}
          >
            <StackedLines
              lines={["Herança que", "se veste."]}
              play={pronto}
              baseDelay={350}
              stagger={110}
              duration={900}
            />
          </p>

          <div
            className="transition-all duration-ascslow ease-asc"
            style={{
              opacity: pronto ? 1 : 0,
              transform: pronto ? "none" : "translateY(28px)",
              transitionDelay: "780ms",
            }}
          >
            <PillButton variant="light" onClick={() => scrollToSection("produtos")}>
              Ver a Coleção
            </PillButton>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Category Tabs ---------- */
/**
 * Altura reservada para o cabeçalho fixo ao rolar até uma seção.
 * Sem essa folga o topo da seção fica escondido atrás dele.
 */
const HEADER_OFFSET = 96;

/**
 * Rola até uma seção respeitando o cabeçalho fixo.
 *
 * Substitui os `<a href="#id">`: o pulo nativo do navegador ignora o
 * cabeçalho fixo e, no caso da barra de abas — que é `sticky` —, chegava a
 * não sair do lugar, porque ela já estava presa no topo.
 */
function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  // Espera o próximo quadro: quando a troca de aba muda o conteúdo, a altura
  // da página só está correta depois de o React pintar.
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  });
}

function CategoryTabs() {
  const { tab, setTab } = useSearch();
  return (
    <div
      id="collections"
      className="sticky top-[68px] z-40 border-y border-border bg-background/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-center gap-2 px-6 py-4 md:gap-8 md:px-12">
        {PRODUCT_CATEGORIES.map((c) => (
          <button
            key={c}
            // Trocar a aba também leva o cliente até as peças. Antes o conteúdo
            // mudava lá embaixo e quem estava no topo não via nada acontecer.
            onClick={() => {
              setTab(c);
              scrollToSection("produtos");
            }}
            className={`relative px-4 py-2 text-[11px] tracking-luxe uppercase transition-colors ${
              tab === c ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {CATEGORY_LABELS[c]}
            {tab === c && <span className="absolute inset-x-2 -bottom-[1px] h-[2px] bg-accent" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Vitrine giratória ---------- */
/**
 * O palco da aba ativa: só as peças que o admin marcou como destaque, no
 * desenho de landing — peça girável no centro, informação de um lado, cartões
 * de vidro do outro.
 *
 * A curadoria é manual de propósito: antes a vitrine pegava as oito primeiras
 * peças com estoque, o que fazia a abertura da home mudar sozinha a cada
 * cadastro. Peça esgotada continua fora — destacar não repõe estoque.
 */
function ShowroomBand() {
  const { tab } = useSearch();
  const { products, stock, groups, loading } = useCatalog();
  const isAdmin = useIsAdmin();

  // Duas cores da mesma peça em destaque não ocupam dois palcos: a vitrine
  // giratória mostra o álbum uma vez só, pela peça principal.
  const destaques = useMemo(
    () =>
      collapseVariants(
        products
          .filter((p) => coerceCategory(p.category) === tab)
          .filter((p) => p.isFeatured === true)
          .filter((p) => totalStock(stock[p.id]) > 0),
        groups,
      ).slice(0, 8),
    [products, stock, groups, tab],
  );

  // Enquanto o catálogo chega, nada de anunciar vitrine vazia.
  if (loading) return null;

  if (destaques.length === 0) return <VitrineSemCuradoria isAdmin={isAdmin} />;

  const copy = categoryCopy(tab);
  return (
    <Showroom products={destaques} eyebrow={copy.showroomEyebrow} sideTitle={copy.showroomTitle} />
  );
}

/**
 * O lugar da vitrine quando o admin ainda não escolheu nenhuma peça.
 * Mantém a moldura escura da seção — a home não perde o ritmo por falta de
 * curadoria — e, para o admin, diz onde se marca um destaque.
 */
function VitrineSemCuradoria({ isAdmin }: { isAdmin: boolean }) {
  return (
    <section
      aria-label="Vitrine de destaques"
      className="asc-on-dark relative isolate mt-3 overflow-hidden rounded-[2rem] bg-asc-bg-dark px-6 py-24 text-center sm:px-10"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-asc-gold/60 to-transparent"
      />
      <Eyebrow tone="light" className="mb-5">
        Curadoria
      </Eyebrow>
      <p
        className="mx-auto font-display font-light leading-[0.95] text-asc-ink"
        style={{ fontSize: "clamp(2rem, 4vw, 3.5rem)" }}
      >
        Nova curadoria <span className="italic text-asc-gold-soft">em breve.</span>
      </p>
      <p className="mx-auto mt-6 max-w-sm text-sm font-light leading-relaxed text-asc-ink-inverse-muted">
        {isAdmin
          ? "Nenhuma peça em destaque nesta categoria. Marque uma no Painel Admin · Produtos, em “Destacar na Vitrine”."
          : "As próximas peças escolhidas pelo ateliê aparecem aqui. Enquanto isso, percorra a coleção completa abaixo."}
      </p>
    </section>
  );
}

/* ---------- Products ---------- */
/**
 * Que peça é esta, para o filtro de tipo.
 *
 * A ordem importa e é o coração da correção: antes cada tipo tinha seu regex e
 * o produto passava em todos que casassem, então "Shorts de Banho Polo Ralph
 * Lauren" aparecia em Blusa (por causa de "polo", que ali é marca) e em Calça
 * ao mesmo tempo. Agora cada peça recebe UM tipo, decidido de baixo para cima:
 * peça de baixo primeiro, depois camisa/camiseta, e só então o guarda-chuva
 * das peças de cima.
 *
 * O nome manda. A descrição só é consultada quando o nome não diz nada — é ela
 * que costuma citar "polo" ou "camisa" de passagem, ao descrever o tecido.
 */
const TIPOS_DE_PECA: Array<{ id: Exclude<SubFilter, "todos">; re: RegExp }> = [
  {
    id: "calca",
    re: /\b(cal[çc]as?|bermudas?|shorts?|jeans|legging|pantalona|jogger|cargo|saias?|pants|trousers?)\b/i,
  },
  { id: "camiseta", re: /\b(camisetas?|camisas?|t-?shirts?|regatas?)\b/i },
  {
    id: "blusa",
    re: /\b(blusas?|su[ée]teres?|su[ée]ter|moletom|moletons|jaquetas?|casacos?|tricot|cardig[ãa]|polos?)\b/i,
  },
];

/** O tipo de uma peça, ou `null` quando nada no texto denuncia a espécie. */
function tipoDaPeca(name: string, description: string): Exclude<SubFilter, "todos"> | null {
  for (const { id, re } of TIPOS_DE_PECA) if (re.test(name)) return id;
  for (const { id, re } of TIPOS_DE_PECA) if (re.test(description)) return id;
  return null;
}

function matchesSub(name: string, description: string, sub: SubFilter) {
  if (sub === "todos") return true;
  return tipoDaPeca(name, description) === sub;
}

function Products() {
  const { query, setQuery, tab, subFilter, setSubFilter } = useSearch();
  const { products, stock, groups, loading: catalogLoading, refresh: resetCatalog } = useCatalog();
  const { openCreate } = useProduct();
  const isAdmin = useIsAdmin();

  const copy = categoryCopy(tab);

  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    let inTab = products.filter((p) => coerceCategory(p.category) === tab);
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

  /**
   * A vitrine mostra um card por álbum, não um por cor.
   *
   * Qual das cores aparece: a principal, definida pelo admin. Menos numa
   * busca — pesquisar "camisa preta" tem de trazer a preta, ainda que a capa
   * do álbum seja a branca. Como `base` já está filtrada pela busca, o
   * representante é simplesmente a primeira cor que sobreviveu ao filtro.
   */
  const filtered = useMemo(() => {
    const buscando = query.trim().length > 0;
    if (!buscando) return collapseVariants(base, groups);
    const visiveis = new Set(base.map((p) => p.id));
    return collapseVariants(base, groups, (g) => g.members.find((m) => visiveis.has(m.id)));
  }, [base, groups, query]);

  const showSneakersComingSoon = tab === "sneakers" && !isAdmin && base.length === 0;

  return (
    <section
      id="produtos"
      className="relative isolate overflow-hidden rounded-[2rem] py-12 md:py-16"
    >
      <div className="relative z-10 mx-auto max-w-[1600px] px-4 sm:px-6 md:px-12">
        <div className="mb-10 flex flex-col items-center text-center md:mb-14">
          <Eyebrow className="mb-3">{copy.eyebrow}</Eyebrow>
          {/* Entrelinha curta: o serif em corpo grande abre demais no padrão e
              era o que empurrava as duas linhas do título para longe uma da outra. */}
          <h2 className="font-serif text-3xl leading-[1.08] md:text-5xl">
            <StackedLines lines={copy.lines} />
          </h2>
          <p className="mt-4 max-w-xl text-sm md:text-base text-muted-foreground font-light">
            {copy.blurb}
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
                {SUB_OPTIONS.find((o) => o.id === subFilter)?.label ?? subFilter}
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
                className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-[10px] tracking-luxe uppercase text-asc-ink transition-colors hover:bg-accent/90"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Adicionar Novo Produto
              </button>
              {/* O botão relê o catálogo do banco — e é só isso que ele sempre
                  fez. O rótulo dizia "Restaurar catálogo original" e o aviso
                  prometia que "todas as edições serão perdidas": um susto por
                  engano, que fazia parecer que o painel tinha um botão capaz de
                  apagar o trabalho de cadastro. Nada é apagado. */}
              <button
                onClick={() => void resetCatalog()}
                title="Relê as peças do banco — útil depois de editar em outra aba ou de rodar uma migração."
                className="inline-flex items-center gap-2 border border-accent/50 px-3 py-2 text-[10px] tracking-luxe uppercase text-accent hover:bg-accent/10 transition-colors"
              >
                <RotateCcw className="h-3 w-3" strokeWidth={1.5} /> Recarregar catálogo
              </button>
            </div>
          )}
        </div>

        {showSneakersComingSoon ? (
          <SneakersComingSoon />
        ) : catalogLoading ? (
          /* Esqueletos enquanto o catálogo chega: a grade já ocupa o espaço
             final das peças, então nada pula de lugar quando as fotos
             aparecem — e a página não parece vazia. */
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-12 md:grid-cols-3 md:gap-x-8 md:gap-y-20 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              // O esqueleto copia a medida do card real — foto 3/4, duas
              // linhas de nome e uma de preço. É isso que faz a grade não
              // pular de lugar quando as peças chegam.
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] w-full bg-asc-bg-raised" />
                <div className="mt-3 flex flex-col gap-1">
                  <div className="min-h-[2.75em] space-y-1.5 text-[0.9rem] leading-snug sm:text-base">
                    <div className="h-[0.9em] w-5/6 bg-asc-bg-raised" />
                    <div className="h-[0.9em] w-3/5 bg-asc-bg-raised" />
                  </div>
                  <div className="h-4 w-1/3 bg-asc-bg-raised" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          query ? (
            <div className="mx-auto max-w-lg py-16 text-center">
              <p className="font-display text-3xl text-asc-ink">Nenhuma peça para "{query}".</p>
              <p className="mt-4 font-sans text-sm font-light text-asc-ink-muted">
                Tente outra palavra-chave ou percorra a coleção completa.
              </p>
              <button
                onClick={() => setQuery("")}
                className="asc-label mt-8 border border-asc-ink px-8 py-3 transition-all duration-asc ease-asc hover:bg-asc-ink hover:text-asc-bg"
              >
                Ver toda a coleção
              </button>
            </div>
          ) : isAdmin ? (
            <div className="mx-auto max-w-lg py-16 text-center">
              <p className="font-display text-3xl text-asc-ink">Nada por aqui ainda.</p>
              <p className="mt-4 font-sans text-sm font-light text-asc-ink-muted">
                Adicione o primeiro produto desta seção.
              </p>
            </div>
          ) : (
            <EmptyCategoryState categoryName={copy.eyebrow} />
          )
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-12 md:grid-cols-3 md:gap-x-8 md:gap-y-20 lg:grid-cols-4">
            {filtered.map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < EAGER_CARDS} />
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
    <div className="asc-on-dark relative mx-auto max-w-4xl overflow-hidden border border-accent/30 bg-gradient-to-br from-navy via-charcoal to-navy p-10 text-center text-ivory md:p-16">
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative">
        <div className="inline-flex items-center gap-2 border border-accent/60 px-4 py-1.5 text-[10px] tracking-luxe uppercase text-accent">
          <Sparkles className="h-3 w-3 animate-pulse" /> Em breve
        </div>
        <h3 className="mt-8 font-serif text-5xl leading-[1.05] md:text-7xl">
          Sneakers
          <br />
          <em className="text-accent">Coming Soon.</em>
        </h3>
        <p className="mx-auto mt-6 max-w-md text-sm text-ivory/70 font-light">
          Uma nova cadência está sendo montada. Assine o Clube para acesso antecipado.
        </p>
        <div className="mt-10 grid grid-cols-4 gap-2 md:gap-4">
          {units.map((u) => (
            <div key={u.label} className="border border-asc-line bg-charcoal/40 py-4 backdrop-blur">
              <div className="font-serif text-3xl tabular-nums text-accent md:text-5xl">
                {String(u.value).padStart(2, "0")}
              </div>
              <div className="mt-1 text-[9px] tracking-luxe uppercase text-ivory/60">{u.label}</div>
            </div>
          ))}
        </div>
        <a
          href="#about"
          className="mt-12 inline-flex items-center gap-3 border border-accent px-8 py-3 text-[11px] tracking-luxe uppercase text-accent transition-all hover:bg-accent hover:text-asc-ink"
        >
          Ser Avisado no Lançamento
        </a>
      </div>
    </div>
  );
}

/* ---------- Product Card ---------- */

/** Caixa de marcação das tags de curadoria, no formulário do admin. */
function TagSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5 px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-[color:var(--gold)]"
      />
      <span className="text-[11px] tracking-luxe uppercase text-[color:var(--gold)]">{label}</span>
    </label>
  );
}

/** Tag de curadoria sobre a foto: pequena, translúcida, sempre numa linha. */
function CardTag({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "gold" }) {
  return (
    <span
      className={`asc-label inline-flex items-center whitespace-nowrap rounded-full border border-asc-ink-inverse/15 bg-asc-bg-dark/45 px-2.5 py-1 text-[9px] tracking-[0.16em] backdrop-blur-sm ${
        tone === "gold" ? "text-asc-gold-soft" : "text-asc-ink-inverse"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Largura que o card ocupa na tela, acompanhando a grade: 2 colunas no celular,
 * 3 a partir de md, 4 a partir de lg. É o que permite ao navegador baixar a
 * variante de 480 no celular em vez da de 1000.
 */
const CARD_SIZES = "(min-width: 1024px) 23vw, (min-width: 768px) 30vw, 46vw";

/** Quantos cards da grade entram com prioridade alta (a primeira dobra). */
const EAGER_CARDS = 4;

/**
 * @param priority Card acima da dobra. Agora que a foto é requisição própria (e
 *   não mais base64 dentro do JSON do catálogo), o `loading="lazy"` do restante
 *   da grade finalmente adia alguma coisa — e vale disputar a banda inicial só
 *   para as primeiras peças, que são o LCP da vitrine.
 */
const ProductCard = memo(function ProductCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const { openEdit } = useProduct();
  const { stock, groups, deleteProduct, loadGallery } = useCatalog();
  const isAdmin = useIsAdmin();
  const sizeStock = stock[product.id];
  const total = totalStock(sizeStock);
  const soldOut = total === 0;
  // As duas tags são decisão do admin, e só dele: nada de deduzir "último
  // item" de um estoque que chegou a 1, nem "novidade" da data de cadastro. Se
  // a peça não está marcada, ela não aparece nessas seções.
  const showLastItem = !soldOut && product.forceLastItem === true;
  const novidade = !soldOut && product.forceNew === true;

  const hoverImg = (product.gallery ?? []).find((g) => g && g !== product.image);

  // As outras cores desta peça. Cor esgotada some da fileira para o cliente —
  // um seletor que leva a uma página "Produto Esgotado" é caminho para lugar
  // nenhum. Para o admin ela continua à mostra, que é como ele repõe.
  const album = groupOf(product, groups);
  const cores = useMemo(
    () => (album ? album.members.filter((m) => isAdmin || totalStock(stock[m.id]) > 0) : []),
    [album, isAdmin, stock],
  );

  /**
   * A segunda foto tem de estar em cache ANTES do mouse chegar.
   *
   * Antes o hover fazia duas viagens à rede em sequência: buscar a galeria da
   * peça no banco e só então baixar a foto. Dava para ver o efeito acontecendo
   * tarde. Agora, quando o card se aproxima da tela, a galeria é pedida (em
   * lote com os vizinhos) e a foto do hover é baixada no tempo ocioso. Só
   * depois de ela estar pronta é que o `<img>` entra na página — trocar de
   * opacidade para uma imagem já decodificada é trabalho de GPU, sem rede e
   * sem layout no meio.
   */
  const [cardRef, perto] = useNearViewport<HTMLElement>();
  const [hoverPronto, setHoverPronto] = useState(false);

  useEffect(() => {
    if (!perto) return;
    void loadGallery(product.id);
  }, [perto, product.id, loadGallery]);

  useEffect(() => {
    // Sem hover (celular) a segunda foto nunca aparece: baixá-la ali seria
    // dobrar os bytes da vitrine por um efeito que o aparelho não exibe.
    if (!perto || !hoverImg || soldOut || !temHover() || economizandoDados()) return;
    let vivo = true;
    const cancelar = noOcioso(() => {
      const img = new Image();
      img.decoding = "async";
      // Prioridade baixa: é uma foto que o cliente talvez nunca veja, e ela
      // não pode competir com as capas que ele está rolando agora.
      img.fetchPriority = "low";
      img.onload = () => vivo && setHoverPronto(true);
      img.src = productImageSrc(hoverImg, 1000);
      // Já em cache: `complete` é verdadeiro sem esperar o onload.
      if (img.complete) setHoverPronto(true);
    });
    return () => {
      vivo = false;
      cancelar();
    };
  }, [perto, hoverImg, soldOut]);

  return (
    <article
      ref={cardRef as React.Ref<HTMLElement>}
      className="group flex flex-col"
      // Rede de segurança para quem chega no card antes do observador: uma
      // chamada repetida de `loadGallery` é descartada na origem.
      onMouseEnter={() => void loadGallery(product.id)}
      onTouchStart={() => void loadGallery(product.id)}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-asc-bg-raised">
        {/* Link real (rastreável, abre em nova aba com o meio do mouse) em
            overlay. Fica em z-20, abaixo dos botões de ação em z-30, para
            não aninhar <button> dentro de <a>. */}
        {!soldOut && (
          <Link
            to="/produto/$id"
            params={{ id: productParam(product) }}
            aria-label={`Ver ${product.name}`}
            className="absolute inset-0 z-20"
          />
        )}
        <img
          src={productImageSrc(product.image, 1000)}
          srcSet={productImageSrcSet(product.image)}
          sizes={CARD_SIZES}
          alt={product.name}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-asc ease-asc ${
            soldOut ? "opacity-50 grayscale" : ""
          } ${hoverImg && !soldOut && hoverPronto ? "group-hover:opacity-0" : ""}`}
        />
        {hoverImg && !soldOut && hoverPronto && (
          <img
            src={productImageSrc(hoverImg, 1000)}
            srcSet={productImageSrcSet(hoverImg)}
            sizes={CARD_SIZES}
            alt={`${product.name} — segunda vista`}
            decoding="async"
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-asc ease-asc group-hover:opacity-100"
          />
        )}
        {/* Pílulas translúcidas em vez das tarjas opacas que tomavam a cabeça
            da foto. Lado a lado e não empilhadas: quando o admin marca as duas,
            elas cabem numa linha só. Peça esgotada não recebe tag nenhuma — a
            tarja "Esgotado" no rodapé do card já diz isso, e com mais clareza. */}
        {(showLastItem || novidade) && (
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5 pr-14">
            {showLastItem && <CardTag tone="gold">Último item</CardTag>}
            {novidade && <CardTag>Novidade</CardTag>}
          </div>
        )}
        {soldOut ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-asc-bg-dark/75 py-3 text-center backdrop-blur-sm">
            <span className="asc-label text-[10px] text-asc-ink-inverse-muted">Esgotado</span>
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-asc-bg-dark/70 py-3 text-center opacity-0 backdrop-blur-sm transition-all duration-asc ease-asc group-hover:translate-y-0 group-hover:opacity-100">
            <span className="asc-label text-[10px] text-asc-ink-inverse">Ver Peça</span>
          </div>
        )}

        <div className="pointer-events-auto absolute right-3 top-3 z-30 flex flex-col gap-2">
          {/* O coração fica sempre visível: cheio, ele é o que diz de relance
              quais peças já foram salvas. */}
          <FavoriteButton productId={product.id} className="h-8 w-8" />
          {/* Editar e excluir são ferramenta de quem administra, não parte da
              vitrine: no desktop só aparecem com o ponteiro no card (ou com o
              foco pelo teclado). No toque não há hover, então continuam à
              mostra — esconder ali seria esconder de vez. */}
          {isAdmin && (
            <div className="flex flex-col gap-2 transition-opacity duration-asc ease-asc md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
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
      </div>
      {/* As cores da peça, logo abaixo da foto — como nas vitrines das casas
          grandes. Cada bolinha abre direto a página daquela cor: o cliente não
          escolhe duas vezes. Fileira de altura fixa só quando existe álbum,
          para não abrir buraco embaixo das peças de cor única. */}
      {cores.length > 1 && (
        <ColorSwatches members={cores} activeId={product.id} max={6} className="mt-3" />
      )}

      {/* Só foto, nome e preço. Descrição e parcelamento vivem na página da
          peça, que é onde o cliente para para ler — aqui eles só empurravam o
          preço para baixo e desalinhavam a fileira. */}
      <ProductCardMeta id={product.id} name={product.name} price={product.price} />

      {/* Linha de serviço do admin, fora da leitura da vitrine: uma linha só,
          truncada, para não voltar a empilhar texto embaixo do card. */}
      {isAdmin && sizeStock && (
        <p className="mt-2 truncate text-[10px] tracking-luxe uppercase text-muted-foreground">
          Estoque · {total} un.
          {product.forceLastItem && <span className="ml-2 text-[color:var(--gold)]">· último</span>}
          {product.forceNew && <span className="ml-2 text-[color:var(--gold)]">· novidade</span>}
        </p>
      )}
    </article>
  );
});

/* ---------- Admin Edit / Create Modal ---------- */

/**
 * Tamanho máximo do arquivo escolhido no painel.
 *
 * Era 2 MB porque a foto ia inteira para dentro da linha do produto, em base64,
 * e todo visitante baixava aquilo. Agora ela é redimensionada e recomprimida em
 * três larguras antes de subir para o Storage, então o peso do original só
 * atrasa o envio do admin — dá para aceitar uma foto direto do celular.
 */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function AdminEditModal() {
  const { editingId, closeEdit, creatingCategory } = useProduct();
  const { products, updateProduct, addProduct, stock, setStock, deleteProduct, loadGallery } =
    useCatalog();
  const { tab } = useSearch();
  const isAdmin = useIsAdmin();
  const isCreate = editingId === "__new__";
  const product =
    !isCreate && editingId ? (products.find((p) => p.id === editingId) ?? null) : null;

  // A vitrine carrega só a foto de capa. Aqui é obrigatório ter a galeria
  // inteira antes de mostrar o formulário: salvar com a lista incompleta
  // apagaria as demais fotos da peça no banco.
  const [galleryReady, setGalleryReady] = useState(false);
  useEffect(() => {
    if (isCreate) {
      setGalleryReady(true);
      return;
    }
    if (!editingId) {
      setGalleryReady(false);
      return;
    }
    setGalleryReady(false);
    let vivo = true;
    void loadGallery(editingId).then(() => {
      if (vivo) setGalleryReady(true);
    });
    return () => {
      vivo = false;
    };
  }, [editingId, isCreate, loadGallery]);

  const open = isAdmin && (isCreate || !!product);

  const [form, setForm] = useState({
    name: "",
    description: "",
    longDescription: "",
    price: 0,
    gallery: [] as string[],
    stock: emptyStock() as SizeStock,
    forceLastItem: false,
    forceNew: false,
    category: (creatingCategory ?? tab) as ProductCategory,
    /** Grade de tamanhos da peça (letras, calças, calçados, único). */
    sizeGrid: suggestSizeGrid(creatingCategory ?? tab, "") as SizeGridId,
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /**
   * Enquanto ninguém encosta no seletor, a grade acompanha a categoria e o
   * nome — digitar "Calça de Alfaiataria" já troca P/M/G/GG por 36–46. Depois
   * de uma escolha manual, o palpite se cala.
   */
  const [gradeManual, setGradeManual] = useState(false);

  useEffect(() => {
    setUploadError(null);
    if (isCreate) {
      const categoria = creatingCategory ?? tab;
      const grade = suggestSizeGrid(categoria, "");
      setGradeManual(false);
      setForm({
        name: "",
        description: "",
        longDescription: "",
        price: 0,
        gallery: [],
        // Uma unidade por tamanho da grade: é o cadastro mais comum e evita
        // salvar peça sem estoque nenhum.
        stock: Object.fromEntries(SIZE_GRIDS[grade].map((s) => [s, 1])),
        forceLastItem: false,
        forceNew: false,
        category: categoria,
        sizeGrid: grade,
      });
    } else if (product) {
      const gal =
        product.gallery && product.gallery.length
          ? product.gallery.slice(0, MAX_PRODUCT_IMAGES)
          : product.image
            ? [product.image]
            : [];
      const gravado = stock[product.id] ?? {};
      // Peça já cadastrada: manda o que está no banco. Se os tamanhos gravados
      // não formam nenhuma grade conhecida (peça antiga, meio a meio), cai no
      // palpite — e o seletor fica lá para o admin corrigir.
      const grade =
        gridOfSizes(Object.keys(gravado).filter((s) => (gravado[s] ?? 0) > 0)) ??
        suggestSizeGrid(product.category, product.name);
      setGradeManual(true);
      setForm({
        name: product.name,
        description: product.description,
        longDescription: product.longDescription ?? "",
        price: product.price,
        gallery: gal,
        stock: gravado,
        forceLastItem: product.forceLastItem === true,
        forceNew: product.forceNew === true,
        category: coerceCategory(product.category),
        sizeGrid: grade,
      });
    }
  }, [editingId, product, stock, isCreate, creatingCategory, tab]);

  if (!open) return null;

  // Sem a galeria completa em mãos, não abre o formulário — evita que um save
  // grave a lista de fotos pela metade.
  if (!galleryReady) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-asc-bg-dark/80 backdrop-blur-sm">
        <p className="asc-label text-asc-ink-muted">Carregando fotos da peça…</p>
      </div>
    );
  }

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
    const ignored = files.length > remaining;

    // O envio agora vai à rede (Storage), e não mais só à memória, então o
    // botão precisa avisar que está trabalhando.
    setUploading(true);
    try {
      for (const file of files.slice(0, remaining)) {
        if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
          setUploadError("Envie imagens JPG, PNG ou WEBP.");
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setUploadError("Cada imagem deve ter até 12 MB.");
          continue;
        }
        try {
          accepted.push(await uploadProductPhoto(file));
        } catch (err) {
          console.error("[fotos] envio falhou", err);
          // O motivo real ("acesso negado", "imagem grande demais") vale mais
          // que um "falhou" genérico: é ele que diz se o problema é a foto, a
          // sessão ou o servidor.
          const motivo = err instanceof Error ? err.message.trim() : "";
          setUploadError(
            motivo
              ? `Falha ao enviar uma das imagens: ${motivo}`
              : "Falha ao enviar uma das imagens.",
          );
        }
      }
    } finally {
      setUploading(false);
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

  /**
   * Os campos de estoque: a grade escolhida, mais qualquer tamanho de outra
   * grade que a peça ainda tenha em estoque — para que reeditar uma peça antiga
   * não apague o que está no depósito sem o admin ver.
   */
  const camposDeTamanho = (() => {
    const lista: string[] = [...SIZE_GRIDS[form.sizeGrid]];
    for (const [s, q] of Object.entries(form.stock)) {
      if (Number(q) > 0 && !lista.includes(s)) lista.push(s);
    }
    return lista;
  })();

  /** Troca a grade sem perder o que já foi digitado nos tamanhos que se repetem. */
  const trocarGrade = (grade: SizeGridId) => {
    setGradeManual(true);
    setForm((f) => {
      const stock: SizeStock = {};
      for (const s of SIZE_GRIDS[grade]) stock[s] = f.stock[s] ?? 0;
      for (const [s, q] of Object.entries(f.stock)) if (Number(q) > 0) stock[s] = Number(q);
      return { ...f, sizeGrid: grade, stock };
    });
  };

  /** Nome e categoria realimentam o palpite de grade, até alguém escolher na mão. */
  const aoMudarNome = (name: string) =>
    setForm((f) => ({
      ...f,
      name,
      sizeGrid: gradeManual ? f.sizeGrid : suggestSizeGrid(f.category, name),
    }));

  const aoMudarCategoria = (category: ProductCategory) =>
    setForm((f) => ({
      ...f,
      category,
      sizeGrid: gradeManual ? f.sizeGrid : suggestSizeGrid(category, f.name),
    }));

  const onSave = () => {
    const name = form.name.trim();
    if (!name) return alert("Informe o nome do produto.");
    const gallery = form.gallery.slice(0, MAX_PRODUCT_IMAGES);
    if (!gallery.length) return alert("Envie ao menos uma foto do produto.");
    const cover = gallery[0];
    // Preço tem de ser maior que zero.
    //
    // Salvar com 0 fazia a peça entrar na vitrine anunciando "R$ 0,00" e, pior,
    // virar um beco sem saída: o cliente escolhe o tamanho, vai pagar, e o
    // servidor recusa o pedido com "Preço inválido" — ele recalcula tudo pelo
    // banco e não aceita peça sem preço (ver `createPendingOrderCore`). Melhor
    // barrar aqui, onde ainda dá para digitar o número certo.
    const price = Math.max(0, Number(form.price) || 0);
    if (price <= 0)
      return alert("Informe o preço da peça — ela não pode ir para a vitrine sem preço.");
    // Grava só os tamanhos que estavam na tela: assim uma peça que mudou de
    // grade não fica com "M: 0" perdido no banco para sempre.
    const stockObj: SizeStock = {};
    for (const s of camposDeTamanho) stockObj[s] = Math.max(0, Math.floor(form.stock[s] ?? 0));

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
          forceLastItem: form.forceLastItem,
          forceNew: form.forceNew,
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
        // Booleano de verdade, não `|| undefined`: com `undefined` o patch
        // simplesmente não levava o campo, e DESMARCAR a tag nunca chegava ao
        // banco — a peça continuava marcada depois de salva.
        forceLastItem: form.forceLastItem,
        forceNew: form.forceNew,
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
        <div className="pointer-events-auto relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-background animate-in fade-in zoom-in-95 duration-300">
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
                  <img
                    src={productImageSrc(form.gallery[0], 480)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-luxe text-muted-foreground">
                    Sem foto
                  </div>
                )}
              </div>

              {form.gallery.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {form.gallery.map((g, i) => (
                    <div
                      key={i}
                      className="relative aspect-[3/4] overflow-hidden border border-border"
                    >
                      <img
                        src={productImageSrc(g, 480)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                      {i === 0 ? (
                        <span className="absolute inset-x-0 bottom-0 bg-charcoal/80 py-0.5 text-center text-[8px] tracking-luxe uppercase text-ivory">
                          Capa
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCoverPhoto(i)}
                          className="absolute inset-x-0 bottom-0 bg-background/85 py-0.5 text-center text-[8px] tracking-luxe uppercase text-accent transition-colors hover:bg-accent hover:text-ivory"
                        >
                          Definir capa
                        </button>
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
                  uploading || form.gallery.length >= MAX_PRODUCT_IMAGES
                    ? "cursor-not-allowed opacity-40"
                    : "cursor-pointer hover:bg-accent hover:text-asc-ink"
                }`}
              >
                <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                {uploading
                  ? "Enviando…"
                  : `Enviar Fotos (${form.gallery.length}/${MAX_PRODUCT_IMAGES})`}
                <input
                  type="file"
                  multiple
                  disabled={uploading || form.gallery.length >= MAX_PRODUCT_IMAGES}
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(e) => {
                    void onPickFiles(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
              {uploadError && <p className="mt-2 text-[10px] text-destructive">{uploadError}</p>}
              <p className="mt-2 text-[9px] tracking-luxe uppercase text-muted-foreground">
                Até {MAX_PRODUCT_IMAGES} fotos · JPG, PNG ou WEBP · 12 MB cada
              </p>
            </div>

            <div className="space-y-4">
              <Field label="Categoria">
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => aoMudarCategoria(c)}
                      className={`border px-3 py-1.5 text-[10px] tracking-luxe uppercase transition-colors ${
                        form.category === c
                          ? "border-foreground bg-foreground text-asc-bg"
                          : "border-border hover:border-foreground"
                      }`}
                    >
                      {CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Nome do produto">
                <input
                  value={form.name}
                  onChange={(e) => aoMudarNome(e.target.value)}
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
              <Field label="Grade de tamanhos">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(SIZE_GRIDS) as SizeGridId[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => trocarGrade(g)}
                      className={`border px-3 py-1.5 text-[10px] tracking-luxe uppercase transition-colors ${
                        form.sizeGrid === g
                          ? "border-foreground bg-foreground text-asc-bg"
                          : "border-border hover:border-foreground"
                      }`}
                    >
                      {SIZE_GRID_LABELS[g]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[9px] tracking-luxe uppercase text-muted-foreground">
                  {gradeManual
                    ? "Grade escolhida à mão"
                    : "Sugerida pela categoria e pelo nome da peça"}
                </p>
              </Field>
              <Field label="Estoque por tamanho">
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {camposDeTamanho.map((s) => (
                    <label key={s} className="block">
                      <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
                        {s}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={form.stock[s] ?? 0}
                        onChange={(e) => setSizeQty(s, Number(e.target.value))}
                        className="w-full border border-border bg-transparent px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent"
                      />
                    </label>
                  ))}
                </div>
              </Field>
              {/* As duas tags da vitrine saem daqui, e só daqui: nenhuma peça
                  recebe "Último Item" por estoque baixo nem "Novidade" por
                  data de cadastro. */}
              <div className="grid gap-2 sm:grid-cols-2">
                <TagSwitch
                  label='Forçar tag "Último Item"'
                  checked={form.forceLastItem}
                  onChange={(v) => setForm({ ...form, forceLastItem: v })}
                />
                <TagSwitch
                  label='Forçar tag "Novidade"'
                  checked={form.forceNew}
                  onChange={(v) => setForm({ ...form, forceNew: v })}
                />
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
                className="inline-flex items-center gap-2 bg-accent px-6 py-2.5 text-[11px] tracking-luxe uppercase text-asc-ink transition-colors hover:bg-accent/90"
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
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), {
      threshold: 0.15,
    });
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
            decoding="async"
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
              <span className="inline-block h-px w-8 bg-current transition-all duration-300 group-hover:w-12" />
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
    <section
      id="about"
      className="asc-on-dark bg-asc-bg-dark py-[var(--asc-section-y)] text-asc-ink-inverse"
    >
      <div className="mx-auto max-w-xl px-6 text-center">
        <p className="asc-label mb-6 text-asc-gold-soft">Acesso Restrito</p>
        <h2 className="mb-6 font-display text-4xl leading-tight md:text-5xl">
          Somente por Convite
        </h2>
        <p className="mx-auto mb-10 max-w-md font-sans text-sm leading-relaxed text-asc-ink-inverse-muted">
          Peças em edição limitada, acesso antecipado a novos drops e atendimento dedicado —
          reservado a quem faz parte do círculo A&amp;S Conccept.
        </p>

        <StitchDivider className="mb-10 opacity-60" />

        {status === "sent" ? (
          <p className="font-display text-xl text-asc-gold-soft">
            {msg ?? "Recebemos seu pedido. Em breve, entraremos em contato."}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-8 text-left">
            <div className="relative">
              <label
                htmlFor="member-email"
                className="asc-label mb-2 block text-[10px] text-asc-ink-inverse-muted"
              >
                E-mail
              </label>
              <input
                id="member-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full border-b border-asc-line-dark bg-transparent py-3 font-sans text-sm text-asc-ink-inverse outline-none transition-colors duration-asc ease-asc placeholder:text-asc-ink-inverse-muted/60 focus:border-asc-gold"
              />
            </div>
            <button
              type="submit"
              disabled={status === "sending"}
              className="asc-label w-full border border-asc-ink-inverse/30 py-4 text-asc-ink-inverse transition-all duration-asc ease-asc hover:border-asc-gold hover:text-asc-gold disabled:opacity-50"
            >
              {status === "sending" ? "Enviando..." : "Solicitar Convite"}
            </button>
            {status === "error" && msg && <p className="font-sans text-xs text-asc-error">{msg}</p>}
          </form>
        )}
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function InstagramIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
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
        <div className="pointer-events-auto relative w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-asc-bg-raised text-asc-ink p-10 md:p-14 animate-in fade-in zoom-in-95 duration-300">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-5 top-5 rounded-full bg-asc-bg-raised/80 p-2 backdrop-blur hover:text-[color:var(--gold)] transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="text-[11px] tracking-luxe uppercase text-[color:var(--gold)]">
            {content.eyebrow}
          </p>
          <h2 className="mt-3 font-serif text-3xl md:text-4xl leading-tight">{content.title}</h2>
          <div className="mt-8 space-y-5 font-serif text-[15px] md:text-base leading-relaxed text-asc-ink/85">
            {content.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="mt-10 border-t border-asc-line pt-6">
            <button
              onClick={onClose}
              className="w-full asc-btn-primary py-3 text-[11px] tracking-luxe uppercase"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

type FooterLink = { label: string; to?: string; hash?: string };

function Footer() {
  const [modal, setModal] = useState<InstitutionalKey | null>(null);
  const institutional: { id: InstitutionalKey; label: string }[] = [
    { id: "conceito", label: "O Conceito" },
    { id: "filosofia", label: "A Filosofia" },
  ];
  const cols: { title: string; links: FooterLink[] }[] = [
    {
      title: "Maison",
      links: [
        { label: "Nossa História", to: "/sobre" },
        { label: "Craftsmanship", to: "/craftsmanship" },
        { label: "Sustentabilidade", to: "/sustentabilidade" },
      ],
    },
    {
      title: "Serviço",
      links: [
        { label: "Envio e Prazos", to: "/envio" },
        { label: "Trocas e Devoluções", to: "/trocas" },
        { label: "Ajustes e Caimento", to: "/ajustes" },
        { label: "Perguntas Frequentes", to: "/faq" },
      ],
    },
    {
      title: "Descobrir",
      links: [
        { label: "A Coleção", hash: "/#produtos" },
        { label: "O Editorial", hash: "/#edit" },
        { label: "Sobre Nós", hash: "/#about" },
      ],
    },
  ];
  return (
    <footer className="asc-gravure asc-on-dark border-t border-asc-line bg-charcoal text-ivory">
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
              className="group mt-6 inline-flex items-center gap-3 border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5 px-4 py-2.5 text-[11px] tracking-luxe uppercase text-[color:var(--gold)] shadow-[0_0_16px_-4px_rgba(212,175,55,0.35)] transition-all duration-300 hover:border-[color:var(--gold)] hover:bg-[color:var(--gold)]/15 hover:shadow-[0_0_24px_-2px_rgba(212,175,55,0.65)]"
            >
              <InstagramIcon className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
              <span>@asconccept</span>
            </a>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="mb-5 text-[11px] tracking-luxe uppercase text-accent">{c.title}</h4>
              <ul className="space-y-3">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.to ? (
                      <Link
                        to={l.to}
                        className="text-xs font-light text-ivory/70 transition-colors hover:text-ivory"
                      >
                        {l.label}
                      </Link>
                    ) : (
                      <a
                        href={l.hash}
                        className="text-xs font-light text-ivory/70 transition-colors hover:text-ivory"
                      >
                        {l.label}
                      </a>
                    )}
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
              <li>
                <Link
                  to="/termos"
                  className="text-xs font-light text-ivory/70 transition-colors hover:text-ivory"
                >
                  Termos e Condições
                </Link>
              </li>
              <li>
                <Link
                  to="/privacidade"
                  className="text-xs font-light text-ivory/70 transition-colors hover:text-ivory"
                >
                  Políticas de Privacidade
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-3 border-t border-asc-line pt-8 text-xs font-light text-ivory/70 md:flex-row md:items-center md:justify-between">
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
              onClick={openWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--gold)] underline-offset-4 transition-colors hover:underline"
            >
              {WHATSAPP_DISPLAY}
            </a>
          </p>
        </div>
        <div className="mt-8 flex flex-col justify-between gap-4 border-t border-asc-line pt-8 text-[11px] text-ivory/50 md:flex-row">
          <p>© {new Date().getFullYear()} A&amp;S Conccept. Todos os direitos reservados.</p>
          <p className="tracking-luxe uppercase">Feito com propósito · Preços em BRL</p>
        </div>
      </div>
      <InstitutionalModal which={modal} onClose={() => setModal(null)} />
    </footer>
  );
}

/* ---------- Cart Drawer ---------- */

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
    scrollToSection("produtos");
  };

  return (
    <>
      <div
        onClick={close}
        className="fixed inset-0 z-[80] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-x-0 top-0 z-[90] animate-in slide-in-from-top duration-300">
        <div className="bg-background">
          <div className="mx-auto max-w-3xl px-6 py-10 md:py-14">
            <div className="flex items-center justify-between">
              <p className="text-[11px] tracking-luxe uppercase text-accent">Buscar</p>
              <button onClick={close} aria-label="Fechar" className="hover:text-accent">
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <form
              onSubmit={submit}
              className="mt-6 flex items-center gap-4 border-b border-foreground/40 pb-3 focus-within:border-accent transition-colors"
            >
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

/* ---------- Filter Sidebar ---------- */
const SUB_OPTIONS: { id: SubFilter; label: string }[] = [
  { id: "todos", label: "Todos os produtos" },
  { id: "blusa", label: "Blusas e casacos" },
  { id: "camiseta", label: "Camisas e camisetas" },
  { id: "calca", label: "Calças e shorts" },
];

function FilterSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { subFilter, setSubFilter, tab, setTab } = useSearch();

  const irParaVitrine = () => {
    onClose();
    setTimeout(() => scrollToSection("produtos"), 120);
  };

  // Categoria é a divisão principal do catálogo; o refino por tipo de peça só
  // existe dentro de Roupas — trocar de categoria zera o refino, senão o
  // cliente sairia de "Calça" para Acessórios com um filtro invisível ligado.
  const selectCategory = (c: ProductCategory) => {
    setTab(c);
    setSubFilter("todos");
    irParaVitrine();
  };

  const select = (id: SubFilter) => {
    setTab("clothes");
    setSubFilter(id);
    irParaVitrine();
  };

  const itemCls = (active: boolean) =>
    `flex w-full items-center justify-between border-l-2 px-4 py-3 text-left text-sm transition-colors ${
      active
        ? "border-accent bg-accent/10 text-foreground"
        : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary/50 hover:text-foreground"
    }`;
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[85] bg-charcoal/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-[90] flex w-full max-w-xs flex-col bg-background transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">Filtrar</p>
            <h3 className="font-serif text-xl">Categorias</h3>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="hover:text-accent">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          <p className="px-4 pb-2 text-[10px] tracking-luxe uppercase text-muted-foreground">
            Categorias
          </p>
          {PRODUCT_CATEGORIES.map((c) => {
            const active = tab === c;
            return (
              <button key={c} onClick={() => selectCategory(c)} className={itemCls(active)}>
                <span className="font-serif text-base">{CATEGORY_LABELS[c]}</span>
                {active && (
                  <span className="text-[10px] tracking-luxe uppercase text-accent">Ativo</span>
                )}
              </button>
            );
          })}

          <p className="mt-6 px-4 pb-2 text-[10px] tracking-luxe uppercase text-muted-foreground">
            Refinar Roupas
          </p>
          {SUB_OPTIONS.map((o) => {
            const active = tab === "clothes" && subFilter === o.id;
            return (
              <button key={o.id} onClick={() => select(o.id)} className={itemCls(active)}>
                <span className="font-serif text-base">{o.label}</span>
                {active && (
                  <span className="text-[10px] tracking-luxe uppercase text-accent">Ativo</span>
                )}
              </button>
            );
          })}
        </nav>
        <p className="border-t border-border px-6 py-4 text-[10px] leading-relaxed text-muted-foreground">
          Escolha uma categoria do catálogo ou refine a vitrine de Roupas por tipo de peça.
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
  const myOrders = user ? (isDevMaster || user.isAdmin ? orders : byUser(user.email)) : [];

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
        <div className="pointer-events-auto relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-background animate-in fade-in zoom-in-95 duration-300">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-10 rounded-full bg-background/80 p-2 backdrop-blur hover:text-accent"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <div className="border-b border-border px-8 py-6">
            <p className="text-[11px] tracking-luxe uppercase text-accent">Minha Conta</p>
            <h2 className="mt-1 font-serif text-3xl">
              Olá, {user.name || user.email.split("@")[0]}
            </h2>
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
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
                    CEP
                  </span>
                  <input
                    value={address.cep ?? ""}
                    onChange={(e) => setAddress({ ...address, cep: e.target.value })}
                    className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="col-span-2 sm:col-span-1 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Número
                  </span>
                  <input
                    value={address.numero ?? ""}
                    onChange={(e) => setAddress({ ...address, numero: e.target.value })}
                    className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Logradouro
                  </span>
                  <input
                    value={address.logradouro ?? ""}
                    onChange={(e) => setAddress({ ...address, logradouro: e.target.value })}
                    className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Complemento
                  </span>
                  <input
                    value={address.complemento ?? ""}
                    onChange={(e) => setAddress({ ...address, complemento: e.target.value })}
                    className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="col-span-2 sm:col-span-1 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Bairro
                  </span>
                  <input
                    value={address.bairro ?? ""}
                    onChange={(e) => setAddress({ ...address, bairro: e.target.value })}
                    className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="col-span-2 sm:col-span-1 block">
                  <span className="mb-1 block text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Cidade / UF
                  </span>
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
                className="inline-flex items-center gap-2 asc-btn-primary px-6 py-2.5 text-[11px] tracking-luxe uppercase"
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
        <div className="pointer-events-auto w-full max-w-md bg-background p-8 animate-in fade-in zoom-in-95 duration-200">
          <p className="text-[11px] tracking-luxe uppercase text-accent">
            A&amp;S Conccept · Confirmação
          </p>
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

const ROTULO_STATUS: Record<string, string> = {
  "Aguardando Pagamento": "Aguardando Pagamento",
  "Pagamento recusado": "Pagamento Recusado",
  "Falha no pagamento": "Falha no Pagamento",
  "Aguardando Aprovação": "Aguardando Aprovação",
  "Preparando pedido": "Preparando Pedido",
  "Em trânsito": "Em Trânsito",
  Entregue: "Entregue",
};

/**
 * Seletor de etapa da tabela do painel rápido.
 *
 * Oferece apenas o status atual e o seguinte: o servidor recusa qualquer salto,
 * e um `<select>` com as quatro etapas convidava o admin a escolher algo que
 * seria rejeitado. Pedido sem pagamento confirmado só tem um caminho —
 * confirmar o pagamento — e é isso que aparece.
 */
function StatusSelect({
  order,
  onChange,
}: {
  order: Order;
  onChange: (next: OrderStatus) => Promise<void>;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const naoPago = isPrePaymentStatus(order.status);
  const idx = ADMIN_STATUSES.indexOf(order.status);
  const proximo = naoPago ? "Aguardando Aprovação" : idx >= 0 ? ADMIN_STATUSES[idx + 1] : undefined;

  return (
    <div className="flex flex-col items-start gap-1">
      <select
        value={order.status}
        disabled={salvando || !proximo}
        onChange={async (e) => {
          const next = e.target.value as OrderStatus;
          if (next === order.status) return;
          setErro(null);
          setSalvando(true);
          try {
            await onChange(next);
          } catch (err) {
            // Sem isto a recusa do servidor sumia e o admin só via o valor
            // voltar sozinho, sem explicação.
            setErro(err instanceof Error ? err.message : "Não foi possível atualizar.");
          } finally {
            setSalvando(false);
          }
        }}
        className="border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent disabled:opacity-60"
      >
        <option value={order.status}>{ROTULO_STATUS[order.status] ?? order.status}</option>
        {proximo && (
          <option value={proximo}>
            → {naoPago ? "Confirmar pagamento" : ROTULO_STATUS[proximo]}
          </option>
        )}
      </select>
      {erro && (
        <span className="max-w-[14rem] text-[10px] leading-tight text-destructive">{erro}</span>
      )}
    </div>
  );
}

type NewsletterRow = { id: string; email: string; created_at: string };
type ManualCustomerRow = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
};

function AdminPanelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, listCustomers, refreshCustomers } = useAuth();
  const { orders, updateStatus, createOrder, refresh: refreshOrders } = useOrders();
  const { products, groups } = useCatalog();
  const [tab, setTab] = useState<"calc" | "pedidos" | "clientes" | "produtos" | "variacoes">(
    "pedidos",
  );
  const [newsletter, setNewsletter] = useState<NewsletterRow[]>([]);
  const [manual, setManual] = useState<ManualCustomerRow[]>([]);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [showManualCustomer, setShowManualCustomer] = useState(false);
  const [confirmOrder, setConfirmOrder] = useState<string | null>(null);
  const [confirmCustomer, setConfirmCustomer] = useState<{
    email: string;
    kind: "auth" | "manual";
    name: string;
  } | null>(null);
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

  const featuredCount = products.filter((p) => p.isFeatured).length;

  const tabs = [
    { id: "calc" as const, label: "Calculadora" },
    { id: "pedidos" as const, label: `Pedidos (${orders.length})` },
    { id: "clientes" as const, label: `Clientes (${customers.length + manual.length})` },
    { id: "produtos" as const, label: `Produtos (${products.length})` },
    { id: "variacoes" as const, label: `Variações (${groups.size})` },
  ];

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[95] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-background animate-in fade-in zoom-in-95 duration-300">
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
                    className="inline-flex items-center gap-1.5 asc-btn-primary px-3 py-1.5 text-[10px] tracking-luxe uppercase"
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
                                      src={productImageSrc(i.image, 480)}
                                      alt={i.name}
                                      loading="lazy"
                                      decoding="async"
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
                                  <StatusSelect
                                    order={o}
                                    onChange={(next) => updateStatus(o.id, next)}
                                  />
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

            {tab === "produtos" && <ProdutosAdmin featuredCount={featuredCount} />}
            {tab === "variacoes" && <VariantsAdmin />}

            {tab === "clientes" && (
              <div className="space-y-10">
                <section>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                      Clientes cadastrados
                    </h3>
                    <button
                      onClick={() => setShowManualCustomer(true)}
                      className="inline-flex items-center gap-1.5 asc-btn-primary px-3 py-1.5 text-[10px] tracking-luxe uppercase"
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

/* ---------- Admin · Produtos (curadoria da vitrine) ---------- */

/**
 * Cadastro com resto de duas grades — "P" e "40" na mesma peça.
 *
 * Vinha de quando a loja completava os tamanhos pela categoria: o admin trocava
 * a grade e o que sobrou continuava gravado, invisível, porque a vitrine
 * mostrava a grade palpitada de qualquer jeito. Agora que ela mostra o que está
 * gravado, esse resto aparece para o cliente — então o painel aponta onde está.
 */
function temGradeMista(stock: SizeStock | undefined): boolean {
  const tamanhos = Object.keys(stock ?? {});
  if (tamanhos.length < 2) return false;
  return gridOfSizes(tamanhos) === null;
}

/**
 * O SQL de cada coluna de curadoria, igual ao da migração correspondente.
 *
 * Duplicado aqui de propósito: o arquivo de migração serve ao deploy, e este
 * texto serve ao admin que abriu o painel e precisa colar o script no SQL
 * Editor agora. Se um mudar, mude o outro.
 */
const SQL_CURADORIA: Record<OptionalColumn, string> = {
  is_featured: `ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS products_is_featured_idx
  ON public.products (is_featured)
  WHERE is_featured;`,
  force_new: `ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS force_new BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS products_force_new_idx
  ON public.products (force_new)
  WHERE force_new;`,
  variant: SQL_VARIACOES,
};
/**
 * Lista de gestão de produtos do painel.
 *
 * O que ela faz de novo é a curadoria: "Destacar na Vitrine" liga o
 * `is_featured` da peça, e a vitrine giratória da home passa a mostrar
 * exatamente as peças marcadas. O botão só existe aqui dentro — o painel só
 * abre para admin — e a RLS de `products` recusa o UPDATE de qualquer outro,
 * então esconder o botão é conveniência, não a tranca.
 */
function ProdutosAdmin({ featuredCount }: { featuredCount: number }) {
  const { products, stock, setFeatured, missingColumns, refresh } = useCatalog();
  const { openEdit } = useProduct();
  const isAdmin = useIsAdmin();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [sqlCopiado, setSqlCopiado] = useState(false);

  if (!isAdmin) return null;

  const alternar = async (p: Product) => {
    setErro(null);
    setSalvando(p.id);
    const msg = await setFeatured(p.id, p.isFeatured !== true);
    setSalvando(null);
    if (msg) setErro(msg);
  };

  // Uma coluna faltando ou duas, o que o admin cola no SQL Editor é um script
  // só — e ele é seguro de rodar de novo.
  const sqlPendente = missingColumns.map((c) => SQL_CURADORIA[c]).join("\n\n");

  const copiarSql = async () => {
    try {
      await navigator.clipboard.writeText(sqlPendente);
      setSqlCopiado(true);
      window.setTimeout(() => setSqlCopiado(false), 2500);
    } catch {
      /* área de transferência indisponível — o SQL está à vista mesmo assim */
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
          {products.length} peças cadastradas · {featuredCount} em destaque
        </p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          As peças destacadas abrem a home. Sem nenhuma, a vitrine exibe “Nova curadoria em breve”.
        </p>
      </div>

      {/* Migração pendente: em vez de deixar o admin clicar num botão que só
          devolve 400, a instrução vem com o SQL pronto para copiar. */}
      {missingColumns.length > 0 ? (
        <div className="mb-5 border border-accent/50 bg-accent/[0.07] px-4 py-4">
          <p className="text-[10px] tracking-luxe uppercase text-accent">Migração pendente</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {missingColumns.length > 1 ? "As colunas " : "A coluna "}
            {missingColumns.map((c, i) => (
              <span key={c}>
                {i > 0 && " e "}
                <code className="text-accent">{c}</code>
              </span>
            ))}
            {missingColumns.length > 1 ? " ainda não existem" : " ainda não existe"} no banco, e sem
            {missingColumns.length > 1 ? " elas" : " ela"} não há como gravar a curadoria. Rode o
            script abaixo no SQL Editor do Supabase — ele é seguro de rodar mais de uma vez.
          </p>
          <pre className="mt-3 overflow-x-auto border border-border bg-background/60 p-3 text-[10px] leading-relaxed text-muted-foreground">
            {sqlPendente}
          </pre>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void copiarSql()}
              className="inline-flex items-center gap-1.5 asc-btn-primary px-3 py-1.5 text-[10px] tracking-luxe uppercase"
            >
              {sqlCopiado ? "SQL copiado" : "Copiar SQL"}
            </button>
            <button
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[10px] tracking-luxe uppercase text-muted-foreground transition-colors hover:border-accent hover:text-accent"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.5} /> Já rodei · verificar
            </button>
          </div>
        </div>
      ) : (
        erro && (
          <p className="mb-4 border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            {erro}
          </p>
        )
      )}

      {products.length === 0 ? (
        <p className="border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          Nenhum produto cadastrado. Adicione o primeiro pela vitrine.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-luxe uppercase text-muted-foreground">
                <th className="py-3 pr-3">Peça</th>
                <th className="py-3 pr-3">Categoria</th>
                <th className="py-3 pr-3 text-right">Preço</th>
                <th className="py-3 pr-3 text-right">Estoque</th>
                <th className="py-3 pr-3 text-right">Vitrine</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const destacada = p.isFeatured === true;
                const total = totalStock(stock[p.id]);
                const gradeMista = temGradeMista(stock[p.id]);
                const semPreco = !(Number(p.price) > 0);
                return (
                  <tr key={p.id} className="border-b border-border/50 align-middle">
                    <td className="py-3 pr-3">
                      <button
                        onClick={() => openEdit(p.id)}
                        className="flex items-center gap-3 text-left transition-colors hover:text-accent"
                        title="Editar peça"
                      >
                        {p.image && (
                          <img
                            src={productImageSrc(p.image, 480)}
                            alt=""
                            aria-hidden
                            loading="lazy"
                            decoding="async"
                            className="h-12 w-9 flex-none border border-border/60 object-cover"
                          />
                        )}
                        <span className="font-serif leading-tight">{p.name}</span>
                      </button>
                      {/* Diagnóstico de cadastro antigo: a loja passou a
                          respeitar exatamente os tamanhos gravados, então uma
                          peça com resto de duas grades ("P" e "40" juntos)
                          aparece assim para o cliente. Nada é apagado por
                          conta própria — o aviso mostra onde reeditar. */}
                      {gradeMista && (
                        <span
                          className="mt-1 block text-[10px] tracking-luxe uppercase text-[color:var(--gold)]"
                          title="Os tamanhos gravados misturam grades diferentes. Abra a peça e escolha a grade certa."
                        >
                          Grade mista · revisar tamanhos
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-[11px] text-muted-foreground">
                      {categoryLabel(p.category)}
                    </td>
                    <td className="py-3 pr-3 text-right font-serif tabular-nums">
                      {semPreco ? (
                        <span
                          className="text-destructive"
                          title="Peça sem preço: aparece como R$ 0,00 na vitrine e o pagamento é recusado. Abra a peça e informe o preço."
                        >
                          Sem preço
                        </span>
                      ) : (
                        formatBRL(p.price)
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {total === 0 ? (
                        <span className="text-destructive">Esgotado</span>
                      ) : (
                        `${total} un.`
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <button
                        onClick={() => void alternar(p)}
                        disabled={salvando === p.id || missingColumns.includes("is_featured")}
                        aria-pressed={destacada}
                        title={
                          destacada
                            ? "Remover da vitrine de destaques"
                            : "Destacar na vitrine da home"
                        }
                        className={`inline-flex items-center gap-2 whitespace-nowrap border px-3 py-1.5 text-[10px] tracking-luxe uppercase transition-colors disabled:opacity-50 ${
                          destacada
                            ? "border-accent bg-accent text-asc-ink hover:bg-accent/90"
                            : "border-border text-muted-foreground hover:border-accent hover:text-accent"
                        }`}
                      >
                        <Star
                          className="h-3.5 w-3.5"
                          strokeWidth={1.5}
                          fill={destacada ? "currentColor" : "none"}
                        />
                        {destacada ? "Em destaque" : "Destacar na Vitrine"}
                      </button>
                      {destacada && total === 0 && (
                        <p className="mt-1 text-[9px] leading-tight text-muted-foreground">
                          Sem estoque · não aparece na vitrine
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <StorageSecurityNote />
    </div>
  );
}

/* ---------- Markup Calculator ---------- */
/**
 * Taxa do gateway usada na precificação e no painel financeiro.
 *
 * O valor veio da configuração antiga (Stripe Brasil) e continua aqui como
 * estimativa. A loja cobra pelo Mercado Pago, cuja taxa muda conforme o plano,
 * o prazo de recebimento e a forma de pagamento — Pix costuma ser bem mais
 * barato que cartão. Ajuste os dois números abaixo para os do seu contrato:
 * é o único ponto do código que precisa mudar.
 */
const TAXA_GATEWAY_PCT = 0.0499;
const TAXA_GATEWAY_FIXA = 0.5;
const TAXA_LABEL = "Taxa do gateway (4,99% + R$ 0,50 · estimativa)";

function MarkupCalculator() {
  const [mode, setMode] = useState<"suggest" | "reverse">("suggest");

  // Modo 1 — sugerir preço a partir de custo + margem desejada
  const [cost, setCost] = useState<number>(100);
  const [margin, setMargin] = useState<number>(50);

  const desiredNet = cost + (cost * margin) / 100;
  const suggestedPrice = (desiredNet + TAXA_GATEWAY_FIXA) / (1 - TAXA_GATEWAY_PCT);
  const taxaEstimada = suggestedPrice * TAXA_GATEWAY_PCT + TAXA_GATEWAY_FIXA;
  const netReceived = suggestedPrice - taxaEstimada;
  const profit = netReceived - cost;

  // Modo 2 — descobrir margem real a partir de custo + preço fixo
  const [rCost, setRCost] = useState<number>(100);
  const [rPrice, setRPrice] = useState<number>(220);
  const rTaxaEstimada = rPrice > 0 ? rPrice * TAXA_GATEWAY_PCT + TAXA_GATEWAY_FIXA : 0;
  const rNet = rPrice - rTaxaEstimada;
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
              que, após a taxa do gateway (estimada em 4,99% + R$ 0,50), você receba exatamente o
              custo somado à margem líquida.
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

          <div className="border border-border bg-asc-bg-raised/40 p-6 space-y-4">
            <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
              Resultado
            </p>
            <ResultRow
              label="Preço de Venda Sugerido (Etiqueta)"
              value={formatBRL(suggestedPrice)}
              highlight
            />
            <div className="border-t border-border/60" />
            <ResultRow label={TAXA_LABEL} value={`− ${formatBRL(taxaEstimada)}`} />
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
              taxa estimada do gateway (4,99% + R$ 0,50) e revela sua margem líquida real em tempo
              real.
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

          <div className="border border-border bg-asc-bg-raised/40 p-6 space-y-4">
            <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
              Diagnóstico Real
            </p>
            <ResultRow label="Preço de Venda" value={formatBRL(rPrice)} />
            <ResultRow label={TAXA_LABEL} value={`− ${formatBRL(rTaxaEstimada)}`} />
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
                  isLoss ? "text-asc-error" : "text-[color:var(--gold)]"
                }`}
              >
                {rMarginPct.toFixed(2)}%
              </span>
            </div>
            {isLoss && (
              <p className="text-[11px] text-asc-error font-light">
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
    highlight && tone === "loss" ? "text-asc-error" : highlight ? "text-[color:var(--gold)]" : "";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${highlight ? `font-serif text-xl ${color}` : "text-sm"}`}>
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
      fees += o.subtotal * TAXA_GATEWAY_PCT + TAXA_GATEWAY_FIXA;
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
          f += o.subtotal * TAXA_GATEWAY_PCT + TAXA_GATEWAY_FIXA;
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

      <div className="border border-border bg-asc-bg-raised/40 p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
              Evolução · Últimas 4 semanas
            </p>
            <p className="text-xs text-muted-foreground font-light">
              Faturamento, lucro bruto e lucro líquido real após a taxa estimada do gateway.
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
        ? "text-asc-gold-soft"
        : "text-asc-ink";
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
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function FinanceChart({ data }: { data: FinancePoint[] }) {
  const w = 640;
  const h = 240;
  const padX = 40;
  const padY = 24;
  const maxVal = Math.max(...data.map((d) => Math.max(d.gross, d.grossProfit, d.netProfit)), 1);
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
            <span className="text-asc-gold-soft">■</span> Faturamento:{" "}
            {formatBRL(data[hover].gross)}
          </p>
          <p className="tabular-nums">
            <span className="text-asc-ink">■</span> Lucro Bruto:{" "}
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

  // A grade segue a peça escolhida: pedido manual de sneaker oferece número,
  // não P/M/G/GG.
  const tamanhos = sizesForProduct(chosen?.category, chosen?.name ?? "");
  // Trocar de peça pode deixar o tamanho selecionado fora da grade nova.
  const tamanhoAtual = tamanhos.includes(size) ? size : (tamanhos[0] ?? "");

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
            size: tamanhoAtual,
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
        <div className="pointer-events-auto w-full max-w-lg bg-background p-8 relative">
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
                  value={tamanhoAtual}
                  onChange={(e) => setSize(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {tamanhos.map((s) => (
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
              className="asc-btn-primary px-5 py-2 text-[11px] tracking-luxe uppercase disabled:opacity-50"
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
    const { error } = await supabase.from("manual_customers").insert({
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
        <div className="pointer-events-auto w-full max-w-md bg-background p-8 relative">
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
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Nome
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                E-mail
              </span>
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
                  else if (d.length > 7) out = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
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
              className="asc-btn-primary px-5 py-2 text-[11px] tracking-luxe uppercase disabled:opacity-50"
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
    } catch {
      /* ignore */
    }
  };
  return (
    <>
      <div
        className="fixed inset-0 z-[120] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={clearJustSignedUp}
      />
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-md bg-asc-bg-raised p-10 text-asc-ink animate-in fade-in zoom-in-95 duration-300">
          <button
            onClick={clearJustSignedUp}
            aria-label="Fechar"
            className="absolute right-4 top-4 hover:text-[color:var(--gold)]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="text-[11px] tracking-luxe uppercase text-[color:var(--gold)]">
            Bem-vindo à Maison
          </p>
          <h2 className="mt-2 font-serif text-3xl leading-tight">
            Um presente
            <br />
            de estreia ✦
          </h2>
          <p className="mt-4 text-sm font-light text-asc-ink/80">
            Sua adesão à A&amp;S Conccept desbloqueia 10% de desconto na primeira compra.
          </p>
          <div className="mt-6 border border-dashed border-[color:var(--gold)] bg-asc-bg-raised p-4 text-center">
            <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              Cupom exclusivo
            </p>
            <p className="mt-1 font-mono text-2xl tracking-widest text-[color:var(--gold)]">
              10%OFFF
            </p>
            <button
              onClick={copy}
              className="mt-3 text-[10px] tracking-luxe uppercase text-asc-ink hover:text-[color:var(--gold)] underline underline-offset-4"
            >
              {copied ? "Copiado ✦" : "Copiar código"}
            </button>
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
            Válido uma única vez por cliente, sobre o subtotal, sem cumulatividade com outras
            ofertas.
          </p>
          <button
            onClick={clearJustSignedUp}
            className="mt-6 w-full asc-btn-primary py-3 text-[11px] tracking-luxe uppercase"
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
        <span key={i} className={i < n ? "text-[color:var(--gold)]" : "text-muted-foreground/30"}>
          ★
        </span>
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
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (rows.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % rows.length), 6500);
    return () => clearInterval(id);
  }, [rows.length]);

  if (rows.length === 0 && !isAdmin) return null;
  const current = rows[idx % Math.max(1, rows.length)];

  const save = async (t: Partial<TestimonialRow> & { id?: string }) => {
    if (t.id) {
      await supabase
        .from("testimonials")
        .update({
          customer_name: t.customer_name,
          content: t.content,
          rating: t.rating,
          sort_order: t.sort_order ?? 0,
        } as never)
        .eq("id", t.id);
    } else {
      await supabase.from("testimonials").insert({
        customer_name: t.customer_name,
        content: t.content,
        rating: t.rating ?? 5,
        sort_order: t.sort_order ?? rows.length,
      } as never);
    }
    setEditing(null);
    setCreating(false);
    await load();
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir depoimento?")) return;
    await supabase.from("testimonials").delete().eq("id", id);
    await load();
  };

  return (
    <section className="mt-3 rounded-[2rem] border border-asc-line bg-secondary/30 py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <Eyebrow className="mb-4">Prova Social</Eyebrow>
        <h2 className="font-serif text-3xl md:text-5xl">
          <StackedLines lines={["Vozes da", "Maison"]} />
        </h2>

        {current && (
          <figure key={current.id} className="mt-12 animate-in fade-in duration-300">
            <Stars n={current.rating} />
            <blockquote className="mt-6 font-serif text-xl md:text-2xl italic leading-relaxed text-asc-ink">
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
              <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Admin · Depoimentos
              </p>
              <button
                onClick={() => {
                  setCreating(true);
                  setEditing({
                    id: "",
                    customer_name: "",
                    content: "",
                    rating: 5,
                    sort_order: rows.length,
                  });
                }}
                className="inline-flex items-center gap-1 border border-accent px-3 py-1.5 text-[10px] tracking-luxe uppercase text-accent hover:bg-accent hover:text-asc-ink"
              >
                <Plus className="h-3 w-3" /> Novo
              </button>
            </div>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 border border-border bg-background px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-serif">
                      {r.customer_name} · <Stars n={r.rating} />
                    </p>
                    <p className="truncate text-muted-foreground">{r.content}</p>
                  </div>
                  <div className="flex flex-none gap-1">
                    <button
                      onClick={() => {
                        setEditing(r);
                        setCreating(false);
                      }}
                      className="border border-border p-1 hover:border-accent"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="border border-destructive/60 p-1 text-destructive hover:bg-destructive hover:text-ivory"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
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
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={save}
        />
      )}
    </section>
  );
}

function TestimonialEditor({
  initial,
  isCreate,
  onCancel,
  onSave,
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
        <div className="pointer-events-auto w-full max-w-md bg-background p-6">
          <p className="text-[11px] tracking-luxe uppercase text-accent">
            {isCreate ? "Novo depoimento" : "Editar depoimento"}
          </p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Nome
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Depoimento
              </span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="mt-1 w-full border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Estrelas (1-5)
              </span>
              <input
                type="number"
                min={1}
                max={5}
                value={rating}
                onChange={(e) => setRating(Math.max(1, Math.min(5, Number(e.target.value) || 5)))}
                className="mt-1 w-24 border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="border border-border px-4 py-2 text-[11px] tracking-luxe uppercase hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={() =>
                onSave({
                  id: isCreate ? undefined : initial.id,
                  customer_name: name.trim(),
                  content: content.trim(),
                  rating,
                })
              }
              className="bg-accent px-4 py-2 text-[11px] tracking-luxe uppercase text-asc-ink hover:bg-accent/90"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
