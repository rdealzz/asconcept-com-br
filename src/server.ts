import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Cabeçalhos de segurança, aplicados a toda página HTML.
 *
 * Ficam aqui, e não num `_headers` de plataforma, porque o build do Nitro
 * gera o seu próprio `_headers` e sobrescreveria o nosso. Aqui valem em
 * qualquer hospedagem.
 *
 * O que cada um evita:
 *  - nosniff: o navegador parar de "adivinhar" o tipo de um arquivo e executar
 *    como script algo que subimos como imagem.
 *  - Referrer-Policy: vazar o caminho completo (com número de pedido) para
 *    sites de terceiros no cabeçalho Referer.
 *  - frame-ancestors / X-Frame-Options: o site ser embutido num iframe alheio
 *    para roubo de clique. Não afeta os iframes que NÓS embutimos (o do
 *    Mercado Pago continua funcionando).
 *  - form-action / base-uri: um XSS injetar um <form> que posta credenciais
 *    para fora, ou reescrever a base das URLs relativas.
 *  - HSTS: downgrade para HTTP em rede hostil.
 *
 * O cabeçalho que BLOQUEIA segue com as três diretivas que não dependem de
 * inventário de domínio. A política completa vai à parte, em modo de relatório
 * — ver `cspRelatorio()`.
 */
const CABECALHOS_SEGURANCA: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "permissions-policy": "geolocation=(), microphone=(), camera=(), interest-cohort=()",
  "strict-transport-security": "max-age=15552000",
};

/**
 * CSP completa, em modo de RELATÓRIO — ela não bloqueia nada.
 *
 * Por que não bloquear já: a política precisa listar todo domínio que a loja
 * usa de verdade, e errar por omissão aqui não dá erro visível — dá cartão que
 * não processa, foto que não carrega, fonte que não chega. Num ambiente onde
 * não dá para subir a aplicação e clicar no checkout, publicar isso bloqueando
 * seria apostar a receita da loja num inventário feito à mão.
 *
 * `Report-Only` é o passo que falta antes disso: o navegador aplica a política,
 * anota tudo que ELA teria bloqueado e não impede nada. A lista abaixo saiu do
 * código (SDK e API do Mercado Pago, Storage do Supabase, ViaCEP, fontes do
 * Google), então deve estar completa — e o modo de relatório é o que prova
 * isso sem custo.
 *
 * Como promover para bloqueio, quando quiser: navegue pelo site com o console
 * do navegador aberto — home, produto, carrinho e um checkout inteiro, com
 * cartão e com Pix. Cada aviso "[Report Only]" no console é um domínio que
 * falta. Sem nenhum aviso depois desse passeio, troque a chave
 * `content-security-policy-report-only` por `content-security-policy` e a
 * política passa a valer.
 *
 * Sobre `'unsafe-inline'` em script-src: é obrigatório aqui, não desleixo. O
 * script de tema roda inline (é ele que evita a piscada na hidratação) e o
 * TanStack Start injeta os próprios scripts inline de hidratação. Mesmo assim
 * a política tem valor: ela barra script de domínio estranho, barra o envio de
 * dados para fora por `fetch` (connect-src) e barra iframe alheio — que é por
 * onde um XSS roubaria a sessão ou os dados do cartão.
 */
function cspRelatorio(): string {
  const supabase = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  let supabaseOrigin = "";
  try {
    if (supabase) supabaseOrigin = new URL(supabase).origin;
  } catch {
    /* URL malformada: melhor uma diretiva a menos do que um cabeçalho quebrado */
  }

  const mercadoPago = "https://*.mercadopago.com https://*.mercadolibre.com";

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com ${mercadoPago}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${supabaseOrigin} https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev ${mercadoPago}`,
    `connect-src 'self' ${supabaseOrigin} https://api.mercadopago.com https://viacep.com.br ${mercadoPago}`,
    `frame-src 'self' ${mercadoPago}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
    .map((d) => d.replace(/\s+/g, " ").trim())
    .join("; ");
}

function comSeguranca(response: Response): Response {
  const tipo = response.headers.get("content-type") ?? "";
  // Só documentos: aplicar em cada imagem e chunk de JS é ruído sem ganho.
  if (!tipo.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CABECALHOS_SEGURANCA)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  if (!headers.has("content-security-policy-report-only")) {
    headers.set("content-security-policy-report-only", cspRelatorio());
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return comSeguranca(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return comSeguranca(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
