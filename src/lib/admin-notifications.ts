import { supabase } from "@/integrations/supabase/client";
import { detectarCores } from "@/lib/variants";

/**
 * Avisos do administrador.
 *
 * Quem escreve é o banco, na hora da baixa de estoque (ver a migração
 * 20260813120000): esgotou a última M da camiseta preta, entra uma linha. Aqui
 * é só a leitura — o painel mostra a lista e marca como lido.
 *
 * A leitura é feita com a chave publicável e apanha na RLS se quem pedir não
 * for admin, que é a tranca de verdade; o painel só abrir para admin é
 * conveniência.
 */

export type AdminNotificationKind =
  /** A última unidade de um tamanho saiu — a variação deixou o catálogo. */
  | "variacao_esgotada"
  /** Vendeu mais do que havia. O estoque foi a zero e o pedido segue de pé. */
  | "venda_sem_estoque"
  /** O item do pedido não pôde ser baixado (peça apagada, tamanho fora da grade). */
  | "baixa_ignorada";

export type AdminNotification = {
  id: string;
  kind: AdminNotificationKind;
  productId: string | null;
  productName: string;
  colorLabel: string | null;
  size: string | null;
  sku: string | null;
  previousQty: number | null;
  requestedQty: number | null;
  orderNumber: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  kind: string;
  product_id: string | null;
  product_name: string | null;
  color_label: string | null;
  size: string | null;
  sku: string | null;
  previous_qty: number | null;
  requested_qty: number | null;
  order_number: string | null;
  message: string | null;
  read_at: string | null;
  created_at: string;
};

const COLUNAS =
  "id,kind,product_id,product_name,color_label,size,sku,previous_qty,requested_qty,order_number,message,read_at,created_at";

/** Quantos avisos o painel carrega de uma vez. */
const LIMITE = 200;

const KINDS: readonly AdminNotificationKind[] = [
  "variacao_esgotada",
  "venda_sem_estoque",
  "baixa_ignorada",
];

function coerceKind(v: string): AdminNotificationKind {
  return (KINDS as readonly string[]).includes(v)
    ? (v as AdminNotificationKind)
    : // Tipo novo gravado por uma versão mais recente do banco: aparece como
      // aviso genérico em vez de sumir da lista.
      "baixa_ignorada";
}

/**
 * A cor da variação, para a tela.
 *
 * O banco grava o `colorLabel` do álbum quando ele existe. Peça fora de álbum
 * não tem — e aí o nome costuma trazer a cor ("… – Preta com Logo Vermelho"),
 * que é o mesmo palpite que os seletores da vitrine usam.
 */
export function corDoAviso(n: AdminNotification): string | null {
  return n.colorLabel ?? detectarCores(n.productName).colorLabel ?? null;
}

function rowToNotification(r: Row): AdminNotification {
  return {
    id: r.id,
    kind: coerceKind(r.kind),
    productId: r.product_id,
    productName: r.product_name ?? "",
    colorLabel: r.color_label,
    size: r.size,
    sku: r.sku,
    previousQty: r.previous_qty,
    requestedQty: r.requested_qty,
    orderNumber: r.order_number,
    message: r.message ?? "",
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

/**
 * Erro de "esta tabela não existe" — nas duas formas em que ele chega.
 *
 * `42P01` é o código do próprio Postgres (`undefined_table`), e era o único
 * que estava aqui. Só que a leitura não fala com o Postgres direto: fala com o
 * PostgREST, que responde à sua maneira. Quando a tabela não está no cache de
 * esquema dele, a resposta é `PGRST205`, com a mensagem "Could not find the
 * table 'public.admin_notifications' in the schema cache" — que não casa com o
 * código antigo NEM com o regex de "relation ... does not exist".
 *
 * O efeito de não reconhecer isso: a aba caía no ramo de erro genérico e
 * mostrava um "Não foi possível carregar os avisos" vermelho, em vez do aviso
 * explicando que a parte do banco ainda não foi criada. Um susto no lugar de
 * uma informação.
 */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return (
    /relation .* does not exist/i.test(message) ||
    /could not find the table/i.test(message) ||
    /in the schema cache/i.test(message)
  );
}

export type ListaDeAvisos = {
  avisos: AdminNotification[];
  /** `true` quando a migração dos avisos ainda não rodou no banco. */
  semTabela: boolean;
  erro: string | null;
};

export async function fetchAdminNotifications(): Promise<ListaDeAvisos> {
  const { data, error } = await supabase
    .from("admin_notifications")
    .select(COLUNAS)
    .order("created_at", { ascending: false })
    .limit(LIMITE);

  if (error) {
    // A tabela ausente não é falha: o código sobe antes de a migração rodar, e
    // o painel prefere pedir o SQL a mostrar um erro vermelho.
    if (isMissingTable(error)) return { avisos: [], semTabela: true, erro: null };
    console.error("[avisos] leitura falhou", error);
    return { avisos: [], semTabela: false, erro: "Não foi possível carregar os avisos." };
  }

  return {
    avisos: ((data ?? []) as unknown as Row[]).map(rowToNotification),
    semTabela: false,
    erro: null,
  };
}

/** Marca um aviso como lido. Devolve `false` se o banco recusou. */
export async function markNotificationRead(id: string): Promise<boolean> {
  const { error } = await supabase
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) console.error("[avisos] marcar como lido falhou", error);
  return !error;
}

/** Marca todos os avisos ainda não lidos. */
export async function markAllNotificationsRead(): Promise<boolean> {
  const { error } = await supabase
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() } as never)
    .is("read_at", null);
  if (error) console.error("[avisos] marcar tudo como lido falhou", error);
  return !error;
}

/** Quantos avisos ainda não foram lidos. Zero também quando a tabela não existe. */
export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await supabase
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}
