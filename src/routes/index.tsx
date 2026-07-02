import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Search, User, ShoppingBag, X } from "lucide-react";
import { CartProvider, useCart, formatUSD, type Product } from "@/lib/cart-context";

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

const PRODUCTS: Product[] = [
  { id: "1", name: "Cornwall Linen Shirt", description: "Hand-finished Italian linen. Relaxed fit.", price: 290, image: p1 },
  { id: "2", name: "Kensington Cashmere Crewneck", description: "Pure Mongolian cashmere in midnight navy.", price: 620, image: p2 },
  { id: "3", name: "Mayfair Double-Breasted Blazer", description: "Peak-lapel wool, tailored in Naples.", price: 1450, image: p3 },
  { id: "4", name: "Windsor Pleated Trouser", description: "High-rise wool crêpe in ivory.", price: 480, image: p4 },
  { id: "5", name: "Saint-Tropez Silk Scarf", description: "Hand-rolled twill, printed in Como.", price: 340, image: p5 },
  { id: "6", name: "Belgrave Penny Loafer", description: "Blake-stitched calf leather, cognac.", price: 780, image: p6 },
  { id: "7", name: "Hampton Cable Knit Polo", description: "Egyptian cotton, hand-linked seams.", price: 395, image: p7 },
  { id: "8", name: "Belgravia Silk Pocket Square", description: "Twelve-fold silk, ivory selvedge.", price: 145, image: p8 },
];

function Index() {
  return (
    <CartProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Nav />
        <Hero />
        <Products />
        <Concept />
        <Newsletter />
        <Footer />
        <CartDrawer />
      </div>
    </CartProvider>
  );
}

function Nav() {
  const { open, count } = useCart();
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
        <nav className={`hidden items-center gap-8 text-[11px] tracking-luxe uppercase md:flex ${scrolled ? "text-foreground" : "text-ivory"}`}>
          <a href="#collections" className="hover:text-accent transition-colors">Collections</a>
          <a href="#edit" className="hover:text-accent transition-colors">The Edit</a>
          <a href="#about" className="hover:text-accent transition-colors">About</a>
        </nav>
        <a href="#" className={`font-serif text-xl md:text-2xl tracking-wider text-center whitespace-nowrap ${scrolled ? "text-foreground" : "text-ivory"}`}>
          A<span className="text-accent">&amp;</span>S Concept
        </a>
        <div className={`flex items-center justify-end gap-5 ${scrolled ? "text-foreground" : "text-ivory"}`}>
          <button aria-label="Search" className="hover:text-accent transition-colors">
            <Search className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button aria-label="Account" className="hidden hover:text-accent transition-colors sm:block">
            <User className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button aria-label="Shopping bag" onClick={open} className="relative hover:text-accent transition-colors">
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

function Hero() {
  return (
    <section className="relative h-[100svh] w-full overflow-hidden">
      <img
        src={hero}
        alt="A&S Concept editorial"
        width={1920}
        height={1280}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-charcoal/40 via-charcoal/20 to-charcoal/70" />
      <div className="relative z-10 flex h-full items-end pb-20 md:items-center md:pb-0">
        <div className="mx-auto max-w-[1600px] w-full px-6 md:px-12">
          <div className="max-w-2xl animate-fade-up text-ivory">
            <p className="mb-6 text-[11px] tracking-luxe uppercase text-accent">— Autumn / Winter Collection</p>
            <h1 className="font-serif text-5xl leading-[1.02] md:text-7xl lg:text-[6rem]">
              The New Era<br />of Heritage.
            </h1>
            <p className="mt-8 max-w-md text-base md:text-lg font-light text-ivory/85">
              Curated luxury for the next generation.
            </p>
            <a
              href="#collections"
              className="group mt-12 inline-flex items-center gap-4 border border-ivory/70 px-10 py-4 text-[11px] tracking-luxe uppercase text-ivory transition-all duration-500 hover:border-accent hover:text-accent"
            >
              Explore the Collection
              <span className="inline-block h-px w-8 bg-current transition-all duration-500 group-hover:w-12" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Products() {
  return (
    <section id="collections" className="py-28 md:py-40">
      <div className="mx-auto max-w-[1600px] px-6 md:px-12">
        <div className="mb-16 flex flex-col items-center text-center md:mb-24">
          <p className="mb-4 text-[11px] tracking-luxe uppercase text-accent">The Collection</p>
          <h2 className="font-serif text-4xl md:text-6xl">Considered Essentials</h2>
          <p className="mt-6 max-w-xl text-sm md:text-base text-muted-foreground font-light">
            Timeless pieces, made in limited quantities by heritage ateliers across Europe.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-16 md:grid-cols-3 md:gap-x-8 lg:grid-cols-4">
          {PRODUCTS.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  return (
    <article className="group flex flex-col">
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-secondary">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          width={900}
          height={1200}
          className="h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06]"
        />
        <button
          onClick={() => add(product)}
          className="absolute inset-x-4 bottom-4 translate-y-6 border border-ivory/80 bg-charcoal/70 py-3 text-[10px] tracking-luxe uppercase text-ivory opacity-0 backdrop-blur-sm transition-all duration-500 hover:border-accent hover:bg-charcoal hover:text-accent group-hover:translate-y-0 group-hover:opacity-100"
        >
          Add to Bag
        </button>
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-serif text-base md:text-lg leading-tight">{product.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground font-light line-clamp-1">{product.description}</p>
        </div>
        <span className="shrink-0 text-xs md:text-sm tabular-nums">{formatUSD(product.price)}</span>
      </div>
    </article>
  );
}

function Concept() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { threshold: 0.15 }
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
            alt="A&S Concept editorial"
            loading="lazy"
            width={1200}
            height={1500}
            className={`h-full min-h-[60vh] w-full object-cover transition-all duration-[1600ms] ${visible ? "scale-100 opacity-100" : "scale-105 opacity-80"}`}
          />
        </div>
        <div className="flex items-center px-8 py-24 md:px-16 lg:px-24">
          <div className={`max-w-md transition-all duration-[1200ms] ${visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}>
            <p className="mb-6 text-[11px] tracking-luxe uppercase text-accent">The Concept</p>
            <h2 className="font-serif text-4xl md:text-5xl leading-[1.1]">
              A quiet elegance, inherited & rewritten.
            </h2>
            <p className="mt-8 text-sm md:text-base leading-relaxed text-ivory/75 font-light">
              A&amp;S Concept is a study in restraint — a modern wardrobe drawn from the codes of old money,
              tailored for a generation that values discretion over display. Each piece is crafted in
              partnership with family-owned ateliers in Italy, Scotland, and the South of France, using
              cloths woven for those who intend to keep them.
            </p>
            <p className="mt-6 text-sm md:text-base leading-relaxed text-ivory/75 font-light">
              We do not chase seasons. We build a library.
            </p>
            <a href="#about" className="group mt-12 inline-flex items-center gap-4 text-[11px] tracking-luxe uppercase text-ivory hover:text-accent transition-colors">
              The Philosophy
              <span className="inline-block h-px w-8 bg-current transition-all duration-500 group-hover:w-12" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <section id="about" className="py-32 md:py-44">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <p className="mb-6 text-[11px] tracking-luxe uppercase text-accent">Membership</p>
        <h2 className="font-serif text-4xl md:text-6xl leading-tight">
          Join the Club<br />
          <em className="font-normal not-italic text-accent md:italic">(By Invitation Only)</em>
        </h2>
        <p className="mx-auto mt-8 max-w-md text-sm md:text-base text-muted-foreground font-light">
          Private previews, atelier stories, and first access to limited releases. Delivered with intention.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); setSent(true); }}
          className="mx-auto mt-12 flex max-w-md items-center border-b border-foreground/40 pb-2 transition-colors focus-within:border-accent"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <button className="text-[11px] tracking-luxe uppercase hover:text-accent transition-colors">
            {sent ? "Received" : "Request Invitation"}
          </button>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { title: "Maison", links: ["Our Story", "Ateliers", "Craftsmanship", "Sustainability"] },
    { title: "Service", links: ["Concierge", "Shipping", "Returns", "Alterations"] },
    { title: "Discover", links: ["The Edit", "Journal", "Lookbook", "Stockists"] },
    { title: "Connect", links: ["Instagram", "Contact", "Careers", "Press"] },
  ];
  return (
    <footer className="border-t border-border bg-charcoal text-ivory">
      <div className="mx-auto max-w-[1600px] px-6 py-20 md:px-12">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="font-serif text-2xl">A<span className="text-accent">&amp;</span>S</div>
            <p className="mt-4 max-w-[220px] text-xs font-light leading-relaxed text-ivory/60">
              Curated luxury for the next generation. Established with intention.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="mb-5 text-[11px] tracking-luxe uppercase text-accent">{c.title}</h4>
              <ul className="space-y-3">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-xs font-light text-ivory/70 transition-colors hover:text-ivory">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col justify-between gap-4 border-t border-ivory/10 pt-8 text-[11px] text-ivory/50 md:flex-row">
          <p>© {new Date().getFullYear()} A&amp;S Concept. All rights reserved.</p>
          <p className="tracking-luxe uppercase">Made with intention · Prices in USD</p>
        </div>
      </div>
    </footer>
  );
}

function CartDrawer() {
  const { isOpen, close, items, remove, subtotal, count } = useCart();
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
            <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">Your Bag</p>
            <h3 className="font-serif text-xl">{count} {count === 1 ? "Piece" : "Pieces"}</h3>
          </div>
          <button onClick={close} aria-label="Close" className="hover:text-accent">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" strokeWidth={1} />
              <p className="mt-6 font-serif text-xl">Your bag is empty.</p>
              <p className="mt-2 text-xs font-light text-muted-foreground">A curated selection awaits.</p>
              <button
                onClick={close}
                className="mt-8 border border-foreground px-8 py-3 text-[11px] tracking-luxe uppercase transition-colors hover:bg-foreground hover:text-ivory"
              >
                Continue Browsing
              </button>
            </div>
          ) : (
            <ul className="space-y-6">
              {items.map((i) => (
                <li key={i.id} className="flex gap-4 border-b border-border pb-6 last:border-0">
                  <img src={i.image} alt={i.name} className="h-28 w-20 object-cover" />
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-serif text-base leading-tight">{i.name}</h4>
                      <button onClick={() => remove(i.id)} aria-label="Remove" className="text-muted-foreground hover:text-accent">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{i.description}</p>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">Qty {i.qty}</span>
                      <span className="text-sm tabular-nums">{formatUSD(i.price * i.qty)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="space-y-4 border-t border-border px-6 py-6">
            <div className="flex items-center justify-between">
              <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">Subtotal</span>
              <span className="font-serif text-xl tabular-nums">{formatUSD(subtotal)}</span>
            </div>
            <p className="text-[11px] font-light text-muted-foreground">
              Shipping & duties calculated at checkout. Complimentary express delivery on orders above $500 USD.
            </p>
            <button className="w-full bg-charcoal py-4 text-[11px] tracking-luxe uppercase text-ivory transition-colors hover:bg-navy">
              Proceed to Checkout
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
