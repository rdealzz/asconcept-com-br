import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, ShoppingBag, X } from "lucide-react";
import { useCart, formatBRL, type Product } from "@/lib/cart-context";
import { categoryLabel } from "@/lib/categories";
import { useCatalog, totalStock, type Size, type SizeStock } from "@/lib/catalog-context";
import { gridForProduct, sizesForProduct } from "@/lib/sizes";
import { getProductById } from "@/lib/catalog.functions";
import { isRemoteImage, productImageSrc } from "@/lib/product-images";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { ProductInfoAccordion } from "@/components/ProductInfoAccordion";
import { ShippingCalculator } from "@/components/ShippingCalculator";
import { InstallmentsNote } from "@/components/InstallmentsNote";
import { FavoriteButton, ShareButton } from "@/components/ProductActions";
import { SizeGuideModal } from "@/components/SizeGuide";
import { sizeGuideFor } from "@/lib/size-guide";
import { RelatedProducts } from "@/components/RelatedProducts";
import { TrustSeals } from "@/components/TrustSeals";
import { StitchDivider } from "@/components/StitchDivider";
import { ContactStrip } from "@/components/ContactStrip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Wordmark } from "@/components/Wordmark";
import { Eyebrow } from "@/components/ui-kit";
import { ProductGallery } from "@/components/ProductGallery";
import { Inview, StackedLines } from "@/lib/motion";
import { useVisualShell } from "@/lib/visual-shell";
import { noOcioso } from "@/lib/near-viewport";
import { ColorSwatches } from "@/components/ColorSwatches";
import {
  collapseVariants,
  groupOf,
  colorName,
  productIdFromParam,
  productParam,
} from "@/lib/variants";

/** Estoque desconhecido. Constante para não virar objeto novo a cada render. */
const SEM_ESTOQUE: SizeStock = {};

export const Route = createFileRoute("/produto/$id")({
  // O loader existe só para o HTML do servidor sair com título e og:image
  // (prévia do link ao compartilhar). No navegador ele é puro atraso: o
  // catálogo já está em memória, então buscar o mesmo produto no servidor
  // antes de pintar a tela era o que fazia o clique demorar. Aqui ele é
  // pulado, e a navegação fica instantânea.
  loader: ({ params }) => {
    if (typeof window !== "undefined") return null;
    // A URL agora é `nome-da-peca--<uuid>`; o que o banco conhece é o uuid.
    return getProductById({ data: { id: productIdFromParam(params.id) } });
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { product } = loaderData;
    const title = `${product.name} — A&S Conccept`;
    const description = product.description || `${product.name}, por ${formatBRL(product.price)}.`;

    // Só entra em meta tag foto que seja URL de verdade. Enquanto as fotos eram
    // data URL base64, a capa inteira saía duas vezes dentro do <head> do HTML
    // — og:image e twitter:image — e o navegador tinha de engolir tudo isso
    // antes de chegar ao <body>. Nenhum robô de prévia lê data URL, então era
    // peso puro. Foto antiga ainda em base64 simplesmente não gera a tag.
    const foto = isRemoteImage(product.image) ? product.image : null;
    const preview = foto ? productImageSrc(foto, 1600) : null;
    const lcp = foto ? productImageSrc(foto, 1000) : null;

    // Cada cor é uma página própria, e o canônico dela é ela mesma: são
    // produtos distintos, com SKU, estoque e preço distintos — apontar as
    // outras cores para uma "página pai" apagaria da busca justamente o que o
    // cliente procura ("camisa preta"). O caminho é relativo de propósito: o
    // `head` roda sem conhecer o domínio, e um canônico com host errado é pior
    // do que nenhum.
    const caminho = `/produto/${productParam(product)}`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        ...(preview ? [{ property: "og:image", content: preview }] : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(preview ? [{ name: "twitter:image", content: preview }] : []),
      ],
      links: [
        { rel: "canonical", href: caminho },
        // A capa é o LCP desta página. Pedir cedo evita que ela espere o
        // JavaScript hidratar para só então descobrir que precisa da foto.
        ...(lcp
          ? [{ rel: "preload", as: "image", href: lcp, fetchpriority: "high" } as const]
          : []),
      ],
    };
  },
  component: ProductPage,
  notFoundComponent: ProductNotFound,
});

function ProductPage() {
  useVisualShell();
  // A URL é `nome-da-peca--<uuid>`; o catálogo conhece o uuid. Link antigo,
  // só com o uuid, continua caindo aqui do mesmo jeito.
  const { id: param } = Route.useParams();
  const id = productIdFromParam(param);
  const loaded = Route.useLoaderData();
  const { add, count, open: openCart } = useCart();
  const { products, stock: liveStock, groups, loading: catalogLoading, loadGallery } = useCatalog();

  // A vitrine traz só a foto de capa; aqui buscamos o resto da galeria.
  // Se o cliente passou o mouse pelo card antes de clicar, já veio.
  useEffect(() => {
    void loadGallery(id);
  }, [id, loadGallery]);

  // O loader entrega o produto no HTML do servidor (título, og:image). Depois
  // que o catálogo do cliente hidrata, ele passa a ser a fonte de verdade —
  // é o que reflete uma edição feita no painel do admin.
  const product: Product | null = products.find((p) => p.id === id) ?? loaded?.product ?? null;

  // As outras cores da peça. A troca entre elas é navegação do roteador com o
  // catálogo já em memória — nada recarrega. O que poderia demorar são as
  // fotos, então as galerias das irmãs são pedidas em lote assim que esta
  // página abre (uma requisição só, ver `loadGallery`), e a capa de cada uma é
  // baixada em prioridade baixa. Quando o clique vem, já está tudo em cache.
  const album = groupOf(product, groups);

  /**
   * As cores irmãs que ainda dá para comprar.
   *
   * Cor esgotada sai da fileira de seletores — é a mesma regra da vitrine
   * (`index.tsx`), e aqui ela faltava: a bolinha continuava na página da peça e
   * levava a uma tela "Produto Esgotado", caminho para lugar nenhum. O álbum
   * não some por isso; some a cor. Se todas esgotarem, não sobra seletor —
   * e nesse caso a própria peça já saiu da vitrine.
   *
   * A cor aberta permanece mesmo esgotada: quem chegou aqui por um link antigo
   * precisa ver onde está, e a página dela já diz "Produto Esgotado".
   */
  const irmas = useMemo(
    () => (album?.members ?? []).filter((m) => m.id === id || totalStock(liveStock[m.id]) > 0),
    [album, id, liveStock],
  );

  useEffect(() => {
    if (irmas.length < 2) return;
    return noOcioso(() => {
      for (const m of irmas) {
        if (m.id === id) continue;
        void loadGallery(m.id);
        if (!m.image) continue;
        const img = new Image();
        img.decoding = "async";
        img.fetchPriority = "low";
        img.src = productImageSrc(m.image, 1000);
      }
    });
  }, [irmas, id, loadGallery]);

  // "Complete o Look": mesma categoria, sem as cores irmãs (elas já estão nos
  // seletores, logo acima) e com uma cor por álbum — o carrossel não repete a
  // mesma peça em quatro tons.
  const related = useMemo(
    () =>
      collapseVariants(
        products.filter(
          (p) =>
            p.id !== product?.id &&
            p.category === product?.category &&
            (!album || p.variant?.group !== album.id) &&
            // Peça esgotada não entra: o carrossel é convite para comprar, e
            // levar a uma tela "Produto Esgotado" é o contrário disso.
            totalStock(liveStock[p.id]) > 0,
        ),
        groups,
      ).slice(0, 10),
    [products, product?.id, product?.category, album, groups, liveStock],
  );

  // `emptyStock()` devolvia um objeto novo a cada render, e ele é dependência
  // do memo da grade e do efeito que escolhe o tamanho — os dois refaziam
  // trabalho a cada quadro enquanto o catálogo não chegava.
  // Sem estoque conhecido, um objeto vazio — e não `emptyStock()`, que devolve
  // a grade de letras zerada e faria uma calça exibir P/M/G/GG esgotados
  // enquanto o catálogo não chega.
  const sizeStock: SizeStock = useMemo(
    () => liveStock[id] ?? loaded?.stock ?? SEM_ESTOQUE,
    [liveStock, id, loaded?.stock],
  );

  const [size, setSize] = useState<Size | null>(null);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  // A grade da peça: letras para roupa, número para calça e sneaker, único
  // para acessório.
  const sizes = useMemo(
    () => sizesForProduct(product?.category, product?.name ?? "", sizeStock),
    [product?.category, product?.name, sizeStock],
  );

  // Seleciona o primeiro tamanho com estoque — mesma regra que o catálogo já usava.
  useEffect(() => {
    setSize(sizes.find((s) => (sizeStock[s] ?? 0) > 0) ?? null);
  }, [id, sizes, sizeStock]);

  // Sem produto: ou o catálogo ainda está carregando, ou a peça não existe.
  if (!product) {
    return catalogLoading ? <ProductLoading /> : <ProductNotFound />;
  }

  return (
    <ProductView
      product={product}
      irmas={irmas}
      sizeStock={sizeStock}
      sizes={sizes}
      size={size}
      setSize={setSize}
      sizeGuideOpen={sizeGuideOpen}
      setSizeGuideOpen={setSizeGuideOpen}
      related={related}
      cartCount={count}
      onCartClick={openCart}
      // Só põe na sacola. O estoque não se mexe aqui: reservar peça na hora
      // de adicionar fazia a peça aparecer como esgotada sem ninguém ter
      // pago. A baixa acontece no servidor, quando o pagamento é aprovado.
      onAdd={(s) => add(product, s)}
    />
  );
}

function ProductView({
  product,
  irmas,
  sizeStock,
  sizes,
  size,
  setSize,
  sizeGuideOpen,
  setSizeGuideOpen,
  related,
  cartCount,
  onCartClick,
  onAdd,
}: {
  product: Product;
  /** As cores irmãs desta peça, na ordem dos seletores. Vazio fora de um álbum. */
  irmas: readonly Product[];
  sizeStock: SizeStock;
  /** A grade da peça — o que a lista de botões de tamanho mostra. */
  sizes: string[];
  size: Size | null;
  setSize: (s: Size) => void;
  sizeGuideOpen: boolean;
  setSizeGuideOpen: (v: boolean) => void;
  /** "Complete o Look": peças da mesma categoria, uma cor por álbum. */
  related: Product[];
  cartCount: number;
  onCartClick: () => void;
  onAdd: (size: Size) => void;
}) {
  const total = totalStock(sizeStock);
  const soldOut = total === 0;
  // Tag por curadoria, não por dedução: estoque em 1 não faz a peça virar
  // "Último Item" sozinha — quem decide isso é o admin, no formulário.
  const lastItem = !soldOut && product.forceLastItem === true;
  const novidade = !soldOut && product.forceNew === true;
  const availableQty = size ? (sizeStock[size] ?? 0) : 0;
  const canAdd = !soldOut && size !== null && availableQty > 0;

  // Memorizado: é a lista que alimenta o palco giratório, e uma identidade
  // nova a cada render faria o palco recarregar as fotos sem necessidade.
  const gallery = useMemo(
    () => (product.gallery?.length ? product.gallery : product.image ? [product.image] : []),
    [product.gallery, product.image],
  );

  // A grade que a peça realmente usa: a dos tamanhos cadastrados. O palpite
  // pelo nome ("shorts" sugere numeração) não passa por cima do cadastro.
  const grade = gridForProduct(product.category, product.name, sizes);
  const tamanhoUnico = grade === "unico" && sizes.length <= 1;
  // A tabela de medidas da peça — `null` em acessório, que é tamanho único.
  // Sai dos tamanhos que a peça oferece, e não da grade genérica.
  const guide = sizeGuideFor(product.category, product.name, sizes);

  const [activeImg, setActiveImg] = useState(0);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  // Clique curto sobre a peça (sem arrasto) abre a foto que está de frente.
  const abrirZoom = useCallback(() => setZoomIndex(activeImg), [activeImg]);

  /**
   * Peça nova (outra cor do álbum, ou o "Complete o Look") começa na primeira
   * foto — e o ajuste é no próprio render, não num efeito.
   *
   * Num efeito ele só rodaria depois de pintar: quem estivesse na terceira
   * foto da camiseta branca e clicasse no seletor da preta veria, por um
   * quadro, a TERCEIRA foto da preta antes de a galeria voltar para a
   * primeira. A cor até estaria certa, mas a foto de abertura, não. Ajustar
   * durante o render (o padrão de estado derivado do React) descarta o quadro
   * errado antes de ele existir.
   */
  const [pecaMostrada, setPecaMostrada] = useState(product.id);
  if (pecaMostrada !== product.id) {
    setPecaMostrada(product.id);
    setActiveImg(0);
    setZoomIndex(null);
  }

  // Como o loader não roda no navegador, o `head` da rota não tem dados para
  // montar o título numa navegação interna — então ele é ajustado aqui. No
  // carregamento direto e para os robôs, quem manda continua sendo o `head`.
  useEffect(() => {
    document.title = `${product.name} — A&S Conccept`;
  }, [product.name]);

  // Pelo mesmo motivo, o canônico: trocar de cor é navegação do roteador, e o
  // `<link rel="canonical">` que veio do servidor continuaria apontando para a
  // cor anterior. Cada variação é uma página própria e canônica de si mesma.
  useEffect(() => {
    const href = `/produto/${productParam(product)}`;
    let tag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!tag) {
      tag = document.createElement("link");
      tag.rel = "canonical";
      document.head.appendChild(tag);
    }
    tag.setAttribute("href", new URL(href, window.location.origin).toString());
  }, [product]);

  function handleAdd() {
    if (!canAdd || !size) return;
    onAdd(size);
  }

  return (
    <div className="min-h-screen bg-background p-2 text-foreground sm:p-3">
      <ProductHeader cartCount={cartCount} onCartClick={onCartClick} />

      {/* Breadcrumb */}
      <nav aria-label="Trilha de navegação" className="border-b border-asc-line">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-3 sm:px-6 sm:py-4 md:px-12">
          <Link
            to="/"
            className="text-xs text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-ink"
          >
            Início
          </Link>
          <span className="text-xs text-asc-ink-muted">/</span>
          <Link
            to="/"
            hash="produtos"
            className="text-xs text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-ink"
          >
            {categoryLabel(product.category)}
          </Link>
          <span className="text-xs text-asc-ink-muted">/</span>
          <span className="max-w-[60vw] truncate text-xs text-asc-ink sm:max-w-none">
            {product.name}
          </span>
        </div>
      </nav>

      <div className="mx-auto max-w-[1600px] rounded-[2rem] px-4 py-8 sm:px-6 sm:py-10 md:px-12 md:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.65fr_1fr] lg:gap-16">
          {/* Coluna esquerda — foto principal contida na altura da tela, com
              miniaturas abaixo. Antes era uma pilha de fotos em tamanho cheio,
              que empurrava preço, tamanho e botão para muito abaixo da dobra.
              Clicar abre a foto em tela cheia. */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            {/* A galeria da peça: foto parada, com uma seta de cada lado para
                passar para a próxima. O arraste lateral continua valendo no
                celular e o clique curto amplia; as miniaturas abaixo saltam
                direto para a foto escolhida. */}
            <div className="relative isolate overflow-hidden rounded-[1.5rem] border border-asc-line">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                  background:
                    "radial-gradient(circle at 50% 42%, rgba(197,160,89,0.14) 0%, rgba(5,7,11,0.85) 62%, #05070B 100%)",
                }}
              />
              <ProductGallery
                images={gallery}
                alt={product.name}
                index={activeImg}
                onIndex={setActiveImg}
                onOpen={abrirZoom}
                // No celular a moldura toma a proporção da própria peça (3/4):
                // com altura em vh sobrava faixa preta dos dois lados, porque
                // a foto é retrato e o quadro, largo.
                className="mx-auto aspect-[3/4] w-full max-w-[24rem] sm:max-w-[26rem] md:aspect-auto md:h-[62vh] md:max-w-[38rem]"
                imageClassName="drop-shadow-[0_24px_48px_rgba(0,0,0,0.5)]"
              />

              {/* O arraste é gesto de ponteiro; este botão dá o mesmo caminho
                  a quem navega pelo teclado. */}
              <button
                type="button"
                onClick={() => setZoomIndex(activeImg)}
                className="asc-label absolute right-3 top-3 rounded-full border border-asc-line bg-asc-bg-dark/70 px-3 py-1.5 text-[10px] text-asc-ink backdrop-blur transition-colors duration-ascfast ease-asc hover:border-asc-gold hover:text-asc-gold"
              >
                Ampliar
              </button>
            </div>

            {gallery.length > 1 && (
              <div className="scrollbar-hide mt-3 flex gap-3 overflow-x-auto">
                {gallery.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveImg(i)}
                    aria-label={`Ver foto ${i + 1}`}
                    aria-current={activeImg === i}
                    className={`h-24 w-[68px] shrink-0 overflow-hidden border transition-all duration-ascfast ease-asc ${
                      activeImg === i
                        ? "border-asc-gold opacity-100"
                        : "border-asc-line opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={productImageSrc(src, 480)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      // Miniatura não disputa banda com a foto grande, que é o
                      // LCP da página.
                      fetchPriority="low"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Coluna direita — painel de compra que acompanha a rolagem.
              `self-start` impede que o painel estique e invada o rodapé. */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="flex items-start justify-between gap-4">
              <Eyebrow>A&amp;S Conccept</Eyebrow>
              <div className="flex shrink-0 gap-2">
                <FavoriteButton productId={product.id} />
                <ShareButton productId={product.id} productName={product.name} />
              </div>
            </div>

            {/* O nome sobe de trás de uma máscara, como os títulos da home.
                A chave força a revelação a rodar de novo ao trocar de peça
                pelo "Complete o Look". */}
            <h1 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">
              <StackedLines key={product.id} lines={[product.name]} duration={800} />
            </h1>
            <p className="mt-3 text-lg tabular-nums">{formatBRL(product.price)}</p>
            <InstallmentsNote amount={product.price} className="mt-1" />

            {(soldOut || lastItem || novidade) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {soldOut ? (
                  <span className="inline-flex items-center border border-destructive/60 bg-destructive/10 px-2 py-1 text-[10px] tracking-luxe uppercase text-destructive">
                    Sold Out
                  </span>
                ) : (
                  <>
                    {lastItem && (
                      <span className="inline-flex items-center gap-1 border border-[color:var(--gold)]/70 bg-[color:var(--gold)]/10 px-2 py-1 text-[10px] tracking-luxe uppercase text-[color:var(--gold)]">
                        ✦ Último Item
                      </span>
                    )}
                    {novidade && (
                      <span className="inline-flex items-center border border-border px-2 py-1 text-[10px] tracking-luxe uppercase text-muted-foreground">
                        Novidade
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {product.description && (
              <p className="mt-5 text-sm font-light leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            )}

            <StitchDivider className="mt-8" />

            {/* Cor — os seletores do álbum. Cada bolinha é a página daquela
                cor: o clique troca a peça inteira (fotos, nome, preço, SKU,
                estoque e URL) numa navegação do roteador, sem recarregar a
                página, porque o catálogo inteiro já está em memória e as fotos
                das irmãs foram pré-carregadas ao abrir esta. */}
            {irmas.length > 1 && (
              <div className="mt-8">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <p className="text-[11px] tracking-luxe uppercase text-muted-foreground">Cor</p>
                  {/* O nome da cor só aparece quando existe: repetir o nome da
                      peça ao lado do título não informa nada. */}
                  {colorName(product) && (
                    <p className="truncate text-[11px] text-asc-ink">{colorName(product)}</p>
                  )}
                </div>
                <ColorSwatches members={irmas} activeId={product.id} size="md" />
              </div>
            )}

            {/* Tamanho — a grade muda com a espécie da peça: letras na roupa,
                número na calça e no sneaker, único no acessório. */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] tracking-luxe uppercase text-muted-foreground">
                  {grade === "unico" ? "Tamanho único" : "Tamanho"}
                </p>
                {/* Acessório não tem tabela — nada a abrir. */}
                {guide && (
                  <button
                    onClick={() => setSizeGuideOpen(true)}
                    className="text-[11px] uppercase tracking-luxe text-asc-ink underline decoration-asc-line underline-offset-4 transition-colors duration-ascfast ease-asc hover:decoration-asc-gold"
                  >
                    Guia de tamanhos
                  </button>
                )}
              </div>
              {/* Peça de tamanho único não ganha seletor: um botão "Único"
                  embaixo do rótulo "Tamanho único" é a mesma informação duas
                  vezes, e não há escolha a fazer. */}
              <div className={`flex flex-wrap gap-2 ${tamanhoUnico ? "hidden" : ""}`}>
                {sizes.map((s) => {
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

            {/* Pílula com seta, como os CTAs da home. */}
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="group mt-8 hidden w-full items-center justify-center gap-2 rounded-full bg-asc-ink py-4 text-[11px] font-medium uppercase tracking-wide text-asc-bg transition-colors duration-asc ease-asc hover:bg-asc-gold disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-asc-ink md:inline-flex"
            >
              {soldOut
                ? "Produto Esgotado"
                : size === null
                  ? "Selecione um tamanho"
                  : availableQty === 0
                    ? `Tamanho ${size} esgotado`
                    : "Adicionar à Sacola"}
              {canAdd && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="h-4 w-4 transition-transform duration-ascfast ease-asc group-hover:translate-x-1"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>

            <ProductInfoAccordion
              productName={product.name}
              description={product.longDescription ?? product.description}
              category={product.category}
              sizes={sizes}
              selectedSize={size}
            />

            <div className="mt-8">
              <ShippingCalculator subtotal={product.price} />
            </div>

            <div className="mt-8 border-t border-asc-line pt-6 text-xs font-light text-muted-foreground">
              <p>Frete grátis em pedidos acima de {formatBRL(FREE_SHIPPING_THRESHOLD)}.</p>
            </div>

            <Inview delayIn={120} y={20}>
              <TrustSeals className="mt-8" />
            </Inview>
          </div>
        </div>
      </div>

      <RelatedProducts products={related} />
      <ContactStrip />

      {/* CTA fixo no mobile — o painel sticky só existe a partir de lg.
          O pr-20 abre espaço para o botão flutuante do WhatsApp, que é fixo
          no canto inferior direito e ficaria por cima do CTA. */}
      <div className="sticky bottom-0 z-30 border-t border-asc-line bg-background/95 pl-4 pr-20 pt-3 backdrop-blur md:hidden [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className="w-full rounded-full bg-asc-ink py-4 text-[11px] font-medium uppercase tracking-wide text-asc-bg transition-colors duration-asc ease-asc hover:bg-asc-gold disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-asc-ink"
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

      <SizeGuideModal
        open={sizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
        guide={guide}
        selected={size}
      />

      {/* Ficha da peça para o robô de busca — desta cor, não do álbum: nome,
          foto, SKU, preço e disponibilidade da variação aberta. Vai no corpo, e
          não no `head`, porque o `head` da rota só é montado no servidor: numa
          troca de cor sem recarregar a página ele ficaria falando da cor
          anterior. As demais cores entram como `isSimilarTo`, que é o que
          conta ao buscador que elas são a mesma peça em outro tom. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdSeguro(fichaJsonLd(product, sizeStock, irmas)) }}
      />

      {zoomIndex !== null && (
        <Lightbox
          images={gallery}
          index={zoomIndex}
          alt={product.name}
          onIndex={setZoomIndex}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </div>
  );
}

/**
 * JSON pronto para ir dentro de uma `<script>`.
 *
 * O conteúdo é montado a partir do cadastro, e um nome de peça que contivesse
 * `</script>` fecharia a tag ali no meio — o resto viraria HTML da página. É o
 * caminho clássico de injeção por dentro de dado "confiável". Escapar `<`
 * fecha isso, e não muda nada para quem lê o JSON: `<` é o mesmo
 * caractere.
 */
function jsonLdSeguro(ficha: unknown): string {
  return JSON.stringify(ficha).replace(/</g, "\\u003c");
}

/**
 * Schema.org Product da variação aberta.
 *
 * O `sku` é o id da peça — é ele que vai para o carrinho, para o pedido e para
 * o e-mail, então é o mesmo identificador de ponta a ponta. Preço e
 * disponibilidade saem do que está gravado agora; sem estoque, `OutOfStock`.
 */
function fichaJsonLd(product: Product, sizeStock: SizeStock, irmas: readonly Product[]) {
  const caminho = `/produto/${productParam(product)}`;
  const emEstoque = totalStock(sizeStock) > 0;
  const cor = product.variant?.colorLabel;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(isRemoteImage(product.image) ? { image: [productImageSrc(product.image, 1600)] } : {}),
    ...(cor ? { color: cor } : {}),
    sku: product.id,
    brand: { "@type": "Brand", name: "A&S Conccept" },
    url: caminho,
    offers: {
      "@type": "Offer",
      price: product.price.toFixed(2),
      priceCurrency: "BRL",
      availability: emEstoque ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: caminho,
    },
    ...(irmas.length > 1
      ? {
          isSimilarTo: irmas
            .filter((m) => m.id !== product.id)
            .map((m) => ({
              "@type": "Product",
              name: m.name,
              sku: m.id,
              url: `/produto/${productParam(m)}`,
            })),
        }
      : {}),
  };
}

/** Cabeçalho enxuto: o Nav da home depende do SearchProvider, que é local dela. */
function ProductHeader({ cartCount, onCartClick }: { cartCount: number; onCartClick: () => void }) {
  return (
    <header className="rounded-[2rem] border border-asc-line bg-asc-bg-raised/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5 md:px-12">
        <Link
          to="/"
          aria-label="Voltar à loja"
          className="inline-flex shrink-0 items-center gap-2 text-[11px] tracking-luxe uppercase text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-gold"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          {/* Só o ícone no celular: o texto empurrava o wordmark para duas linhas. */}
          <span className="hidden sm:inline">Voltar à loja</span>
        </Link>

        <Wordmark className="flex flex-col items-center leading-none">
          <span className="asc-heading-tracked whitespace-nowrap text-sm text-asc-gold sm:text-base md:text-lg">
            A&amp;S Conccept
          </span>
          <span className="asc-tagline mt-1 hidden text-[0.55rem] md:block">
            Curadoria de Herança
          </span>
        </Wordmark>

        <div className="flex items-center gap-4 text-asc-ink-muted">
          <ThemeToggle />
          <button
            onClick={onCartClick}
            aria-label="Abrir sacola"
            className="relative transition-colors duration-ascfast ease-asc hover:text-asc-gold"
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
            {cartCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-asc-gold text-[10px] font-medium text-asc-bg">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const trava = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Lightbox — a foto em tela cheia, com lupa de verdade.
 *
 * Antes era só a foto grande: o cursor virava lupa, mas nada ampliava — clicar
 * apenas fechava. Agora a roda do mouse, a pinça, o duplo clique e os botões
 * ampliam de fato, e com a foto ampliada o arrasto passeia por ela. Voltar a
 * 100% devolve o gesto de arrastar para a troca de foto.
 */
function Lightbox({
  images,
  index,
  alt,
  onIndex,
  onClose,
}: {
  images: string[];
  index: number;
  alt: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const area = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Enquanto a variante grande não chega, a lupa mostra a que já está em cache.
  const [nitida, setNitida] = useState(false);
  useEffect(() => {
    setNitida(false);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => setNitida(true);
    img.src = productImageSrc(images[index], 1600);
    if (img.complete) setNitida(true);
  }, [images, index]);

  // O laço de ponteiros lê e escreve zoom/posição fora do ciclo do React —
  // um espelho em ref evita depender de estado defasado no meio do gesto.
  const atual = useRef({ zoom, pos });
  atual.current = { zoom, pos };

  const total = images.length;
  const trocar = useCallback(
    (passo: number) => {
      if (total < 2) return;
      onIndex((((index + passo) % total) + total) % total);
    },
    [index, total, onIndex],
  );

  /** Amplia mantendo fixo o ponto (px, py) da área — o que está sob o cursor. */
  const ampliarEm = useCallback((alvo: number, px: number, py: number) => {
    const { zoom: z, pos: o } = atual.current;
    const novo = trava(alvo, ZOOM_MIN, ZOOM_MAX);
    const k = novo / z;
    setZoom(novo);
    setPos(novo === ZOOM_MIN ? { x: 0, y: 0 } : { x: px - (px - o.x) * k, y: py - (py - o.y) * k });
  }, []);

  const ampliarEmRef = useRef(ampliarEm);
  ampliarEmRef.current = ampliarEm;

  const passoZoom = useCallback(
    (fator: number) => {
      const r = area.current?.getBoundingClientRect();
      if (!r) return;
      ampliarEm(atual.current.zoom * fator, r.width / 2, r.height / 2);
    },
    [ampliarEm],
  );

  // Trocar de foto recomeça do zero: continuar ampliado numa foto que a pessoa
  // ainda não viu inteira é desorientador.
  useEffect(() => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowRight") return trocar(1);
      if (e.key === "ArrowLeft") return trocar(-1);
      if (e.key === "+" || e.key === "=") return passoZoom(1.4);
      if (e.key === "-") return passoZoom(1 / 1.4);
      if (e.key === "0") {
        setZoom(1);
        setPos({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    // trava a rolagem do fundo enquanto a foto está aberta
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [trocar, passoZoom, onClose]);

  // A roda precisa de listener não passivo para poder cancelar a rolagem da
  // página — e o React só registra os passivos.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      ampliarEmRef.current(
        atual.current.zoom * Math.exp(-dy * 0.0018),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ── ponteiros: arrasto, pinça e troca de foto ───────────────────── */
  const pontos = useRef(new Map<number, { x: number; y: number }>());
  const arrasto = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinca = useRef<{ dist: number; zoom: number } | null>(null);
  const inicio = useRef<{ x: number; y: number; t: number } | null>(null);

  const distancia = () => {
    const [a, b] = [...pontos.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pontos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pontos.current.size === 2) {
      pinca.current = { dist: distancia(), zoom: atual.current.zoom };
      arrasto.current = null;
      return;
    }
    inicio.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (atual.current.zoom > 1) {
      arrasto.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pontos.current.has(e.pointerId)) return;
    pontos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinca.current && pontos.current.size === 2) {
      const r = area.current?.getBoundingClientRect();
      if (!r) return;
      const [a, b] = [...pontos.current.values()];
      const d = distancia();
      if (d > 0) {
        ampliarEm(
          (pinca.current.zoom * d) / pinca.current.dist,
          (a.x + b.x) / 2 - r.left,
          (a.y + b.y) / 2 - r.top,
        );
      }
      return;
    }

    const d = arrasto.current;
    if (d) setPos({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  };

  const onUp = (e: React.PointerEvent) => {
    const inicial = inicio.current;
    pontos.current.delete(e.pointerId);
    if (pontos.current.size < 2) pinca.current = null;
    arrasto.current = null;
    inicio.current = null;
    if (!inicial || atual.current.zoom > 1) return;

    // Sem zoom, o arrasto lateral troca de foto — e o toque curto fecha, que é
    // o que se espera de uma foto aberta em tela cheia.
    const dx = e.clientX - inicial.x;
    const dy = e.clientY - inicial.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return trocar(dx < 0 ? 1 : -1);
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && performance.now() - inicial.t < 400) onClose();
  };

  const ampliado = zoom > 1;

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-asc-bg-dark/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — foto ampliada`}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="asc-label text-[10px] text-asc-ink-muted">
          {alt}
          {total > 1 && (
            <span className="ml-2 tabular-nums">
              {index + 1} / {total}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1 text-asc-ink">
          <button
            onClick={() => passoZoom(1 / 1.4)}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Diminuir zoom"
            className="rounded-full p-2 transition-colors duration-ascfast ease-asc hover:text-asc-gold disabled:opacity-30"
          >
            <Minus className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <span className="w-12 text-center text-[11px] tabular-nums text-asc-ink-muted">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => passoZoom(1.4)}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Aumentar zoom"
            className="rounded-full p-2 transition-colors duration-ascfast ease-asc hover:text-asc-gold disabled:opacity-30"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPos({ x: 0, y: 0 });
            }}
            aria-label="Redefinir zoom"
            className="rounded-full p-2 transition-colors duration-ascfast ease-asc hover:text-asc-gold"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-2 transition-colors duration-ascfast ease-asc hover:text-asc-gold"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div
        ref={area}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          ampliarEm(ampliado ? 1 : 2.5, e.clientX - r.left, e.clientY - r.top);
        }}
        className="relative flex-1 touch-none select-none overflow-hidden"
        style={{ cursor: ampliado ? "grab" : "zoom-in" }}
      >
        <img
          // A de 1000 acabou de ser exibida na página, então está em cache e
          // pinta no mesmo quadro em que a lupa abre. A de 1600 entra por cima
          // quando termina de baixar — abrir o zoom deixa de ser uma espera.
          src={productImageSrc(images[index], nitida ? 1600 : 1000)}
          alt={`${alt} — foto ${index + 1}`}
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: arrasto.current || pinca.current ? "none" : "transform 0.12s ease-out",
          }}
        />

        {total > 1 && !ampliado && (
          <>
            <button
              onClick={() => trocar(-1)}
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-asc-line bg-asc-bg-dark/70 text-asc-ink backdrop-blur transition-colors duration-ascfast ease-asc hover:border-asc-gold hover:text-asc-gold"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => trocar(1)}
              aria-label="Próxima foto"
              className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-asc-line bg-asc-bg-dark/70 text-asc-ink backdrop-blur transition-colors duration-ascfast ease-asc hover:border-asc-gold hover:text-asc-gold"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      <p className="asc-label pb-4 text-center text-[10px] text-asc-ink-muted">
        {ampliado
          ? "Arraste para mover · duplo clique volta ao tamanho normal"
          : "Role, pince ou dê duplo clique para ampliar · setas trocam de foto"}
      </p>
    </div>
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
