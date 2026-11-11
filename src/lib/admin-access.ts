/**
 * Admins só de visualização.
 *
 * Enxergam o painel inteiro — pedidos, clientes, leads, estoque, avisos —
 * mas não gravam nada. Não ganham o papel `admin` no banco: as escritas
 * continuam barradas pela RLS e pelas server functions, que exigem esse papel.
 * A leitura do que a RLS esconderia vem por `viewerReadAdminTable`, que
 * confere o e-mail no servidor.
 *
 * Para dar ou tirar o acesso, basta mexer nesta lista.
 */
export const VIEWER_ADMIN_EMAILS: readonly string[] = ["gui.santos.work@gmail.com"];

export const isViewerAdminEmail = (email?: string | null) =>
  !!email && VIEWER_ADMIN_EMAILS.includes(email.trim().toLowerCase());

/** Mensagem única para qualquer tentativa de gravar com acesso de visualização. */
export const SOMENTE_LEITURA =
  "Seu acesso ao painel é só de visualização — alterações ficam com o administrador.";

/** Tabelas do painel que o admin de visualização lê pelo servidor. */
export const TABELAS_DO_PAINEL = [
  "orders",
  "profiles",
  "newsletter_subscribers",
  "manual_customers",
  "admin_notifications",
] as const;
export type TabelaDoPainel = (typeof TABELAS_DO_PAINEL)[number];

const EVENTO_SOMENTE_LEITURA = "asconcept:somente-leitura";

/**
 * Trava de escrita para o admin de visualização.
 *
 * Devolve `true` (e avisa na tela) quando quem está logado só pode olhar —
 * quem grava chama isto antes e para ali. A RLS e as server functions já
 * recusariam a gravação, mas um UPDATE barrado pela RLS volta sem erro e o
 * painel mostraria a mudança como salva; aqui ela nem começa.
 */
export function bloquearSeSomenteLeitura(user?: { readOnly?: boolean } | null): boolean {
  if (!user?.readOnly) return false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENTO_SOMENTE_LEITURA));
  }
  return true;
}

/** Assina o aviso de "só visualização" (ver `SomenteLeituraAviso`). */
export function aoBloquearEscrita(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_SOMENTE_LEITURA, fn);
  return () => window.removeEventListener(EVENTO_SOMENTE_LEITURA, fn);
}
