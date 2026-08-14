import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import heroAsset from "../assets/hero-amalfi-men.jpg.asset.json";
import { SITE_URL } from "../lib/site";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../lib/auth-context";
import { CartProvider } from "../lib/cart-context";
import { CatalogProvider } from "../lib/catalog-context";
import { OrdersProvider } from "../lib/orders-context";
import { WhatsAppFab } from "../components/WhatsAppFab";
import { CartDrawer } from "../components/CartDrawer";
import { AuthModal } from "../components/AuthModal";
import { THEME_INIT_SCRIPT } from "../components/ThemeToggle";

/**
 * A capa que sai na prévia do link.
 *
 * Antes era uma captura de tela do preview do Lovable, hospedada num domínio
 * `r2.dev` que não é da loja e que existe enquanto aquele preview existir. Agora
 * é a mesma foto de abertura da home, servida pelo domínio da loja.
 */
const OG_IMAGE = `${SITE_URL}${heroAsset.url}`;

const TITULO_PADRAO = "A&S Conccept — Alfaiataria de herança para uma nova era";

/**
 * A frase que aparece embaixo do link no Google e no WhatsApp. Em português,
 * porque a loja é brasileira, e dizendo o que se vende — a anterior descrevia a
 * plataforma ("luxury e-commerce platform for affluent young consumers"), que é
 * texto de apresentação de projeto, não de vitrine.
 */
const DESCRICAO_PADRAO =
  "Peças de alfaiataria e streetwear de luxo, em edição limitada. Envio para todo o Brasil, " +
  "pagamento em até 12x ou Pix com desconto.";

/** Origem das fotos (o Storage do Supabase), para o `preconnect` do <head>. */
const FOTOS_ORIGIN = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
})();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-[11px] tracking-luxe uppercase text-accent">Erro 404</p>
        <h1 className="mt-3 font-serif text-3xl text-foreground">Esta página não existe</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          O endereço pode ter mudado, ou a peça que você procurava saiu da vitrine.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="asc-btn-primary inline-flex items-center justify-center px-6 py-3 text-[11px] tracking-luxe uppercase"
          >
            Ver a coleção
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-[11px] tracking-luxe uppercase text-accent">Falha ao carregar</p>
        <h1 className="mt-3 font-serif text-3xl text-foreground">Esta página não abriu</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          O problema foi do nosso lado. Tente de novo — se continuar, fale com a gente pelo
          WhatsApp.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="asc-btn-primary inline-flex items-center justify-center px-6 py-3 text-[11px] tracking-luxe uppercase"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center border border-border px-6 py-3 text-[11px] tracking-luxe uppercase text-foreground transition-colors hover:bg-secondary"
          >
            Ir para a home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // Uma descrição só, em português, e escrita para quem vai comprar — não
    // para investidor. A lista tinha `name="description"` duas vezes, com
    // textos diferentes: o buscador escolhe um dos dois e ninguém sabe qual.
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITULO_PADRAO },
      { name: "description", content: DESCRICAO_PADRAO },
      { property: "og:site_name", content: "A&S Conccept" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:url", content: SITE_URL },
      { property: "og:title", content: TITULO_PADRAO },
      { property: "og:description", content: DESCRICAO_PADRAO },
      { property: "og:type", content: "website" },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITULO_PADRAO },
      { name: "twitter:description", content: DESCRICAO_PADRAO },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Cada um no seu tamanho. O favicon era o PNG de 1024×1024 (802 KB) e
      // servia às duas tags, então toda visita gastava quase um megabyte de
      // banda — disputada com as fotos das peças — para desenhar um ícone de
      // 16 pixels na aba.
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "64x64" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      // As fotos das peças vivem noutro domínio (o Storage). Sem isto, a
      // primeira foto da vitrine só começa a baixar depois de DNS, TCP e TLS
      // com aquele host — trabalho que dá para adiantar enquanto o HTML ainda
      // está sendo lido.
      ...(FOTOS_ORIGIN
        ? [{ rel: "preconnect", href: FOTOS_ORIGIN, crossOrigin: "anonymous" } as const]
        : []),
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Cinzel:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Aplica o tema salvo antes da primeira pintura, para a página não
            piscar do escuro para o claro na hidratação. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
        {/*
          Carregado diretamente no HTML (em vez de depender só do
          initMercadoPago() do pacote @mercadopago/sdk-react) porque em
          alguns ambientes o wrapper React falha em injetar esse script
          sozinho, deixando window.MercadoPago undefined e quebrando o
          formulário de cartão com "Cannot read properties of null
          (reading 'onReady')". Ver: https://github.com/mercadopago/sdk-js
        */}
        <script src="https://sdk.mercadopago.com/js/v2" async></script>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          {/* CatalogProvider vive aqui, e não dentro da home, para que a
              rota de produto também alcance produtos e estoque. */}
          <CatalogProvider>
            <OrdersProvider>
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
              {/* Sacola e login ficam aqui, fora do <Outlet />, para abrirem
                  sobre qualquer rota — inclusive a página de produto. */}
              <CartDrawer />
              <AuthModal />
              <WhatsAppFab />
            </OrdersProvider>
          </CatalogProvider>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
