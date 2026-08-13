/**
 * A conferência de estoque contra o banco.
 *
 * A conta mora em `@/lib/stock` (pura, testável); aqui fica só a leitura. É
 * chamada em três momentos do checkout, e os três existem por um motivo
 * diferente:
 *
 *   1. **ao gravar o pedido pendente** — o carrinho vive no navegador e pode
 *      carregar um tamanho que a peça deixou de ter. Até esta correção, o
 *      checkout do Mercado Pago não conferia nada: o pedido nascia, o cliente
 *      pagava, e a recusa só aparecia na baixa de estoque, em silêncio, no log
 *      do servidor;
 *   2. **antes de cobrar no cartão** — entre gravar o pedido e o cliente
 *      terminar de digitar o cartão passa tempo, e a última peça pode ter ido
 *      embora nesse intervalo;
 *   3. **antes de gerar o Pix** — mesma coisa, e aqui o intervalo é maior: a
 *      cobrança vale quinze minutos.
 *
 * Nada disto reserva peça. Reservar no carrinho faria a peça sumir da vitrine
 * sem ninguém ter pago — a regra da loja é que o estoque só cai na aprovação
 * do pagamento. O que sobra é conferir o mais tarde possível e, quando duas
 * compras simultâneas levarem a mesma última peça, a baixa no banco grava o
 * aviso de venda a descoberto para o admin resolver (ver a migração
 * 20260813120000).
 */
import {
  faltasDeEstoque,
  mensagemDasFaltas,
  normalizarGrade,
  type ItemPedido,
  type PecaEmEstoque,
} from "@/lib/stock";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

type LinhaProduto = { id: string; name: string; sizes?: unknown };

/** As peças de um pedido, com a grade já normalizada, por id. */
export function indexarPecas(rows: readonly LinhaProduto[]): Map<string, PecaEmEstoque> {
  return new Map(
    rows.map((r) => [r.id, { id: r.id, name: r.name, sizes: normalizarGrade(r.sizes) }]),
  );
}

/**
 * Conferência a partir de linhas já lidas. Serve a quem acabou de buscar os
 * produtos por outro motivo (preço, por exemplo) e não quer uma segunda ida ao
 * banco.
 *
 * Devolve a mensagem pronta para a tela, ou `null` quando está tudo em ordem.
 */
export function conferirComPecas(
  items: readonly ItemPedido[],
  rows: readonly LinhaProduto[],
): string | null {
  return mensagemDasFaltas(faltasDeEstoque(items, indexarPecas(rows)));
}

/**
 * Conferência com ida ao banco. Lê só o necessário — id, nome e grade.
 *
 * Falha de leitura não inventa disponibilidade: devolve a mensagem de erro, e
 * quem chama para o pagamento. Deixar passar "porque o banco não respondeu"
 * seria justamente a venda sem estoque que isto existe para impedir.
 */
export async function conferirEstoque(
  supabase: AnySupabase,
  items: readonly ItemPedido[],
): Promise<string | null> {
  const ids = Array.from(new Set(items.map((i) => i.id)));
  if (!ids.length) return null;

  const { data, error } = await supabase.from("products").select("id, name, sizes").in("id", ids);
  if (error) {
    console.error("[stock] falha ao conferir estoque", error);
    return "Não foi possível conferir a disponibilidade das peças. Tente novamente.";
  }
  return conferirComPecas(items, (data ?? []) as LinhaProduto[]);
}

/**
 * Os itens de um pedido gravado, no formato que a conferência entende.
 *
 * O JSONB de `orders.items` mudou de nome de campo ao longo do tempo (`qty` nos
 * pedidos antigos, `quantity` nos de hoje) — a baixa no banco aceita os dois, e
 * aqui é o mesmo cuidado.
 */
export function itensDoPedido(items: unknown): ItemPedido[] {
  if (!Array.isArray(items)) return [];
  const out: ItemPedido[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const id = typeof it.id === "string" ? it.id : "";
    const size = typeof it.size === "string" ? it.size : "";
    const quantity = Math.floor(Number(it.quantity ?? it.qty) || 0);
    if (!id || !size || quantity <= 0) continue;
    out.push({ id, size, quantity });
  }
  return out;
}
