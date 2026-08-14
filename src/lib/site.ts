/**
 * O endereço público da loja.
 *
 * Fica numa constante porque três lugares precisam da URL absoluta e nenhum
 * deles conhece o domínio da requisição: o `head` do root (og:image e og:url,
 * que o WhatsApp não resolve em caminho relativo), o sitemap (onde `loc` é
 * absoluto por especificação) e o robots.txt. É o mesmo endereço que
 * `public/robots.txt` já declara.
 */
export const SITE_URL = "https://asconccept.com.br";

/** Caminho relativo → URL absoluta, sem barra dobrada no meio. */
export function urlAbsoluta(caminho: string): string {
  return `${SITE_URL}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}
