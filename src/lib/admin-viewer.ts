import type { TabelaDoPainel } from "./admin-access";

/**
 * Lê uma tabela do painel pelo servidor, no formato `{ data, error }` do
 * cliente do Supabase — assim quem chama troca a consulta direta por esta sem
 * mexer no resto. Usado só pelo admin de visualização.
 *
 * O import é tardio para não puxar a server function para quem nunca vai usá-la.
 */
export async function lerTabelaDoPainel<T = Record<string, unknown>>(
  table: TabelaDoPainel,
): Promise<{ data: T[] | null; error: { message: string; code?: string } | null }> {
  try {
    const { viewerReadAdminTable } = await import("./admin-viewer.functions");
    const r = await viewerReadAdminTable({ data: { table } });
    if (r.error) return { data: null, error: { message: r.error, code: r.code } };
    return { data: r.rows as T[], error: null };
  } catch (e) {
    console.error("[admin-viewer] leitura falhou", table, e);
    return { data: null, error: { message: e instanceof Error ? e.message : "erro" } };
  }
}
