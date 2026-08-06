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
 * Não há `default-src` de propósito: uma CSP completa precisa listar Supabase,
 * Mercado Pago, ViaCEP e fontes do Google, e uma lista incompleta quebraria o
 * pagamento em produção sem aviso. As diretivas acima já são as que dispensam
 * inventário de domínios.
 */
const CABECALHOS_SEGURANCA: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "permissions-policy": "geolocation=(), microphone=(), camera=(), interest-cohort=()",
  "strict-transport-security": "max-age=15552000",
};

function comSeguranca(response: Response): Response {
  const tipo = response.headers.get("content-type") ?? "";
  // Só documentos: aplicar em cada imagem e chunk de JS é ruído sem ganho.
  if (!tipo.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CABECALHOS_SEGURANCA)) {
    if (!headers.has(k)) headers.set(k, v);
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
