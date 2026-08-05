import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ShoppingBag } from "lucide-react";
import { useCart, formatBRL, type Product } from "@/lib/cart-context";
import {
  useCatalog,
  SIZES,
  emptyStock,
  totalStock,
  hasLastSize,
  type Size,
  type SizeStock,
} from "@/lib/catalog-context";
import { getProductById } from "@/lib/catalog.functions";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { ProductInfoAccordion } from "@/components/ProductInfoAccordion";
import { ShippingCalculator } from "@/components/ShippingCalculator";
import { InstallmentsNote } from "@/components/InstallmentsNote";
import { FavoriteButton, ShareButton } from "@/components/ProductActions";
import { SizeGuideModal } from "@/components/SizeGuide";
import { RelatedProducts } from "@/components/RelatedProducts";
import { TrustSeals } from "@/components/TrustSeals";
import { StitchDivider } from "@/components/StitchDivider";
import { ContactStrip } from "@/components/ContactStrip";

export const Route = createFileRoute("/produto/$id")({
  // O loader é best-effort: serve para o HTML do servidor já sair com título e
  // og:image (prévia do link). Se falhar, a página ainda abre com o catálogo
  // que o cliente carrega — por isso não lança aqui.
  loader: ({ params }) => getProductById({ data: { id: params.id } }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { product } = loaderData;
    const title = `${product.name} — A&S Conccept`;
    const description = product.description || `${product.name}, por ${formatBRL(product.price)}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        ...(product.image ? [{ property: "og:image", content: product.image }] : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(product.image ? [{ name: "twitter:image", content: product.image }] : []),
      ],
    };
  },
  component: ProductPage,
  notFoundComponent: ProductNotFound,
});

function ProductPage() {
  const { id } = Route.useParams();
  const loaded = Route.useLoaderData();
  const { add, count, open: openCart } = useCart();
  const { products, stock: liveStock, loading: catalogLoading, decrementStock } = useCatalog();

  // O loader entrega o produto no HTML do servidor (título, og:image). Depois
  // que o catálogo do cliente hidrata, ele passa a ser a fonte de verdade —
  // é o que reflete uma edição do admin ou um decremento de estoque local.
  const product: Product | null = products.find((p) => p.id === id) ?? loaded?.product ?? null;
  const sizeStock: SizeStock = liveStock[id] ?? loaded?.stock ?? emptyStock();

  const [size, setSize] = useState<Size | null>(null);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  // Seleciona o primeiro tamanho com estoque — mesma regra que o catálogo já usava.
  useEffect(() => {
    setSize(SIZES.find((s) => (sizeStock[s] ?? 0) > 0) ?? null);
  }, [id, sizeStock]);

  // Sem produto: ou o catálogo ainda está carregando, ou a peça não existe.
  if (!product) {
    return catalogLoading ? <ProductLoading /> : <ProductNotFound />;
  }

  return (
    <ProductView
      product={product}
      sizeStock={sizeStock}
      size={size}
      setSize={setSize}
      sizeGuideOpen={sizeGuideOpen}
      setSizeGuideOpen={setSizeGuideOpen}
      products={products}
      cartCount={count}
      onCartClick={openCart}
      onAdd={(s) => {
        add(product, s);
        decrementStock(product.id, s, 1);
      }}
    />
  );
}

function ProductView({
  product,
  sizeStock,
  size,
  setSize,
  sizeGuideOpen,
  setSizeGuideOpen,
  products,
  cartCount,
  onCartClick,
  onAdd,
}: {
  product: Product;
  sizeStock: SizeStock;
  size: Size | null;
  setSize: (s: Size) => void;
  sizeGuideOpen: boolean;
  setSizeGuideOpen: (v: boolean) => void;
  products: Product[];
  cartCount: number;
  onCartClick: () => void;
  onAdd: (size: Size) => void;
}) {
  const total = totalStock(sizeStock);
  const soldOut = total === 0;
  const lastItem =
    !soldOut && (product.forceLastItem === true || hasLastSize(sizeStock) || total === 1);
  const availableQty = size ? (sizeStock[size] ?? 0) : 0;
  const canAdd = !soldOut && size !== null && availableQty > 0;

  const gallery = product.gallery?.length ? product.gallery : product.image ? [product.image] : [];
  const related = products
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 10);

  function handleAdd() {
    if (!canAdd || !size) return;
    onAdd(size);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ProductHeader cartCount={cartCount} onCartClick={onCartClick} />

      {/* Breadcrumb */}
      <nav aria-label="Trilha de navegação" className="border-b border-asc-line">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-6 py-4 md:px-12">
          <Link
            to="/"
            className="text-xs text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-ink"
          >
            Início
          </Link>
          <span className="text-xs text-asc-ink-muted">/</span>
          <Link
            to="/"
            hash="collections"
            className="text-xs text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-ink"
          >
            {product.category === "sneakers" ? "Sneakers" : "Roupas"}
          </Link>
          <span className="text-xs text-asc-ink-muted">/</span>
          <span className="text-xs text-asc-ink">{product.name}</span>
        </div>
      </nav>

      <div className="mx-auto max-w-[1600px] px-6 py-10 md:px-12 md:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.65fr_1fr] lg:gap-16">
          {/* Coluna esquerda — pilha contínua de imagens, rola com a página */}
          <div className="flex flex-col gap-3 md:gap-4">
            {gallery.map((src, i) => (
              <div
                key={i}
                className="w-full overflow-hidden border border-asc-line bg-asc-bg-raised"
              >
                <img
                  src={src}
                  alt={`${product.name} — imagem ${i + 1}`}
                  className="h-auto w-full object-cover"
                  loading={i === 0 ? "eager" : "lazy"}
                />
              </div>
            ))}
          </div>

          {/* Coluna direita — painel de compra que acompanha a rolagem.
              `self-start` impede que o painel estique e invada o rodapé. */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[11px] tracking-luxe uppercase text-accent">A&amp;S Conccept</p>
              <div className="flex shrink-0 gap-2">
                <FavoriteButton productId={product.id} />
                <ShareButton productId={product.id} productName={product.name} />
              </div>
            </div>

            <h1 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">{product.name}</h1>
            <p className="mt-3 text-lg tabular-nums">{formatBRL(product.price)}</p>
            <InstallmentsNote amount={product.price} className="mt-1" />

            {(soldOut || lastItem) && (
              <div className="mt-3">
                {soldOut ? (
                  <span className="inline-flex items-center border border-destructive/60 bg-destructive/10 px-2 py-1 text-[10px] tracking-luxe uppercase text-destructive">
                    Sold Out
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 border border-[color:var(--gold)]/70 bg-[color:var(--gold)]/10 px-2 py-1 text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
                    ✦ Último Item
                  </span>
                )}
              </div>
            )}

            {product.description && (
              <p className="mt-5 text-sm font-light leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            )}

            <StitchDivider className="mt-8" />

            {/* Tamanho */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] tracking-luxe uppercase text-muted-foreground">Tamanho</p>
                <button
                  onClick={() => setSizeGuideOpen(true)}
                  className="text-[11px] uppercase tracking-luxe text-asc-ink underline decoration-asc-line underline-offset-4 transition-colors duration-ascfast ease-asc hover:decoration-asc-gold"
                >
                  Guia de tamanhos
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((s) => {
                  const q = sizeStock[s] ?? 0;
                  const isOut = q === 0;
                  return (
                    <button
                      key={s}
                      onClick={() => !isOut && setSize(s)}
                      disabled={isOut}
                      title={isOut ? "Tamanho esgotado" : `${q} em estoque`}
                      className={`relative h-12 w-16 border text-sm transition-all duration-ascfast ease-asc md:h-11 md:w-14 ${
                        size === s
                          ? "border-foreground bg-foreground text-asc-bg"
                          : "border-asc-line hover:border-foreground"
                      } ${isOut ? "cursor-not-allowed line-through opacity-40" : ""}`}
                    >
                      {s}
                      {q === 1 && !isOut && (
                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[color:var(--gold)]" />
                      )}
                    </button>
                  );
                })}
              </div>
              {size !== null &&
                (availableQty === 0 || availableQty === 1 || availableQty === 2) && (
                  <p className="mt-2 text-[10px] tracking-luxe uppercase text-muted-foreground">
                    {availableQty === 0
                      ? "Tamanho selecionado sem disponibilidade."
                      : availableQty === 1
                        ? "Última peça em estoque neste tamanho."
                        : `${availableQty} unidades disponíveis no tamanho ${size}.`}
                  </p>
                )}
            </div>

            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="asc-btn-primary mt-8 hidden w-full py-4 text-[11px] tracking-luxe uppercase disabled:cursor-not-allowed disabled:opacity-40 md:block"
            >
              {soldOut
                ? "Produto Esgotado"
                : size === null
                  ? "Selecione um tamanho"
                  : availableQty === 0
                    ? `Tamanho ${size} esgotado`
                    : "Adicionar à Sacola"}
            </button>

            <ProductInfoAccordion
              productId={product.id}
              productName={product.name}
              description={product.longDescription ?? product.description}
            />

            <div className="mt-8">
              <ShippingCalculator subtotal={product.price} />
            </div>

            <div className="mt-8 border-t border-asc-line pt-6 text-xs font-light text-muted-foreground">
              <p>Frete grátis em pedidos acima de {formatBRL(FREE_SHIPPING_THRESHOLD)}.</p>
            </div>

            <TrustSeals className="mt-8" />
          </div>
        </div>
      </div>

      <RelatedProducts products={related} />
      <ContactStrip />

      {/* CTA fixo no mobile — o painel sticky só existe a partir de lg.
          O pr-20 abre espaço para o botão flutuante do WhatsApp, que é fixo
          no canto inferior direito e ficaria por cima do CTA. */}
      <div className="sticky bottom-0 z-30 border-t border-asc-line bg-background/95 py-3 pl-4 pr-20 backdrop-blur md:hidden">
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className="asc-btn-primary w-full py-4 text-[11px] tracking-luxe uppercase disabled:cursor-not-allowed disabled:opacity-40"
        >
          {soldOut
            ? "Produto Esgotado"
            : size === null
              ? "Selecione um tamanho"
              : availableQty === 0
                ? `Tamanho ${size} esgotado`
                : `Adicionar — ${formatBRL(product.price)}`}
        </button>
      </div>

      <SizeGuideModal open={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} />
    </div>
  );
}

/** Cabeçalho enxuto: o Nav da home depende do SearchProvider, que é local dela. */
function ProductHeader({ cartCount, onCartClick }: { cartCount: number; onCartClick: () => void }) {
  return (
    <header className="border-b border-asc-line bg-asc-bg-raised/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5 md:px-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[11px] tracking-luxe uppercase text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-gold"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Voltar à loja
        </Link>

        <Link to="/" className="flex flex-col items-center leading-none">
          <span className="asc-heading-tracked text-base text-asc-gold md:text-lg">
            A&amp;S Conccept
          </span>
          <span className="asc-tagline mt-1 hidden text-[0.55rem] md:block">
            Curadoria de Herança
          </span>
        </Link>

        <button
          onClick={onCartClick}
          aria-label="Abrir sacola"
          className="relative text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-gold"
        >
          <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
          {cartCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-asc-gold text-[10px] font-medium text-asc-bg">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

function ProductLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md">
        <p className="asc-tagline">A&amp;S Conccept</p>
        <p className="mt-4 font-serif text-2xl text-asc-ink">Trazendo a peça do ateliê…</p>
        <StitchDivider className="mt-8" />
      </div>
    </div>
  );
}

function ProductNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md">
        <p className="asc-tagline">A&amp;S Conccept</p>
        <h1 className="mt-4 font-serif text-3xl text-asc-ink">
          Esta peça não está mais no ateliê.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          O produto que você procura saiu de catálogo ou o endereço está incorreto.
        </p>
        <StitchDivider className="my-8" />
        <Link
          to="/"
          className="asc-btn-primary inline-block px-8 py-3 text-[11px] tracking-luxe uppercase"
        >
          Ver a coleção
        </Link>
      </div>
    </div>
  );
}
