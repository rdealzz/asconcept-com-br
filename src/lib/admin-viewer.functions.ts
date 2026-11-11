import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isViewerAdminEmail, TABELAS_DO_PAINEL, type TabelaDoPainel } from "@/lib/admin-access";

/** O que cada tabela devolve — as mesmas colunas que o painel pede direto ao banco. */
const CONSULTAS: Record<TabelaDoPainel, { colunas: string; limite?: number }> = {
  orders: { colunas: "*" },
  profiles: { colunas: "email, name, phone, created_at" },
  newsletter_subscribers: { colunas: "id, email, created_at" },
  manual_customers: { colunas: "*" },
  admin_notifications: {
    colunas:
      "id,kind,product_id,product_name,color_label,size,sku,previous_qty,requested_qty,order_number,message,read_at,created_at",
    limite: 200,
  },
};

/**
 * Leitura do painel para o admin de visualização.
 *
 * Ele não tem o papel `admin` no banco (é isso que o impede de gravar), então a
 * RLS esconderia pedidos, clientes e leads. Aqui a leitura roda com a chave de
 * serviço — por isso só SELECT, só as tabelas da lista, e só depois de
 * conferir no Auth que o e-mail da conta é um dos liberados e está confirmado.
 * O e-mail vem do Auth, não do token nem do corpo da requisição.
 */
export const viewerReadAdminTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { table: TabelaDoPainel }) => {
    if (!(TABELAS_DO_PAINEL as readonly string[]).includes(input?.table)) {
      throw new Error("Tabela inválida.");
    }
    return { table: input.table };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: auth, error: authErr } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    const conta = auth?.user;
    if (authErr || !conta?.email || !conta.email_confirmed_at || !isViewerAdminEmail(conta.email)) {
      throw new Error("Acesso negado.");
    }

    const tabela: TabelaDoPainel = data.table;
    const { colunas, limite } = CONSULTAS[tabela];
    let consulta = supabaseAdmin
      .from(tabela)
      .select(colunas)
      .order("created_at", { ascending: false });
    if (limite) consulta = consulta.limit(limite);

    const { data: rows, error } = await consulta;
    if (error) {
      console.error("[admin-viewer] leitura falhou", data.table, error);
      return { rows: [] as unknown[], error: error.message ?? "erro", code: error.code ?? "" };
    }
    return { rows: (rows ?? []) as unknown[], error: null, code: "" };
  });
