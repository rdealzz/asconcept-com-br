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
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../lib/auth-context";
import { CartProvider } from "../lib/cart-context";
import { CatalogProvider } from "../lib/catalog-context";
import { OrdersProvider } from "../lib/orders-context";
import { WhatsAppFab } from "../components/WhatsAppFab";
import { CartDrawer } from "../components/CartDrawer";
import { AuthModal } from "../components/AuthModal";
import { THEME_INIT_SCRIPT } from "../components/ThemeToggle";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "A&S Conccept — The New Era of Heritage" },
      {
        name: "description",
        content:
          "A&S Conccept — curated luxury apparel for the next generation. Timeless heritage tailoring, reimagined for the modern connoisseur.",
      },
      { property: "og:title", content: "A&S Conccept — The New Era of Heritage" },
      {
        property: "og:description",
        content:
          "A&S Conccept Storefront is a luxury e-commerce platform for affluent young consumers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "A&S Conccept — The New Era of Heritage" },
      {
        name: "description",
        content:
          "A&S Conccept Storefront is a luxury e-commerce platform for affluent young consumers.",
      },
      {
        name: "twitter:description",
        content:
          "A&S Conccept Storefront is a luxury e-commerce platform for affluent young consumers.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d116b85a-c6c7-4e6d-856c-fad14c27579f/id-preview-a11de409--4a1b6264-e4f2-4bd0-beae-666af6c1801f.lovable.app-1782999840259.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d116b85a-c6c7-4e6d-856c-fad14c27579f/id-preview-a11de409--4a1b6264-e4f2-4bd0-beae-666af6c1801f.lovable.app-1782999840259.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
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
    <html lang="en">
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
