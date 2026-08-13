import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FLOW_STATUSES, type OrderStatus } from "@/lib/types";

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderNumber: string; status: OrderStatus; trackingCode?: string }) => {
    if (!/^AS-\d{6}$/.test(input?.orderNumber ?? "")) throw new Error("Pedido inválido.");
    // Só as etapas do ateliê: o painel nunca devolve um pedido para um estado
    // anterior ao pagamento.
    if (!(FLOW_STATUSES as readonly string[]).includes(input?.status)) {
      throw new Error("Status inválido.");
    }
    return {
      orderNumber: input.orderNumber,
      status: input.status,
      trackingCode:
        typeof input.trackingCode === "string" ? input.trackingCode.slice(0, 80) : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { updateAdminOrderStatusCore } = await import("@/lib/admin-orders.server");
    return updateAdminOrderStatusCore(supabaseAdmin, data);
  });

/**
 * Completa a baixa de estoque de pedidos pagos que ficaram para trás.
 *
 * A baixa acontece dentro do tratamento da notificação do Mercado Pago. Quando
 * aquela chamada falha (banco fora do ar por um instante, deploy no meio do
 * caminho), o pedido fica pago com `stock_decremented = false` e a peça
 * continua à venda — o buraco que já apareceu na loja antes e que o log do
 * servidor era o único a registrar.
 *
 * Roda com a chave de serviço porque é ela que executa `consume_order_stock`;
 * a rotina é idempotente e o painel a dispara ao abrir a aba de avisos.
 */
export const adminReconcileStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Server function é endpoint HTTP: sem esta conferência, qualquer visitante
    // dispararia uma rotina que roda com a chave de serviço.
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const { data, error } = (await (
        supabaseAdmin.rpc as unknown as (
          n: string,
        ) => Promise<{ data: unknown; error: { message?: string } | null }>
      )("reconcile_order_stock")) ?? { data: null, error: null };
      if (error) {
        console.error("[admin] reconcile_order_stock recusado", error);
        // A rotina só existe depois da migração dos avisos. Enquanto ela não
        // roda, isto não é falha: é uma função que ainda não nasceu.
        return { ok: false, reconciled: 0, message: error.message ?? "" };
      }
      return { ok: true, reconciled: Number(data ?? 0), message: "" };
    } catch (e) {
      console.error("[admin] reconcile_order_stock falhou", e);
      return { ok: false, reconciled: 0, message: e instanceof Error ? e.message : "" };
    }
  });

/**
 * Exclui um pedido pelo order_number. Requer que o chamador tenha role 'admin'.
 * RLS já bloqueia, mas validamos duas vezes por defesa em profundidade.
 */
export const adminDeleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderNumber: string }) => {
    if (!input?.orderNumber || typeof input.orderNumber !== "string") {
      throw new Error("orderNumber inválido");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("orders")
      .delete()
      .eq("order_number", data.orderNumber);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Exclui o cadastro de um cliente por e-mail:
 * - Remove o usuário do Auth (cascata para profile e user_roles)
 * - Ou, se for apenas um cadastro manual, remove de manual_customers
 */
export const adminDeleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; kind?: "auth" | "manual" }) => {
    if (!input?.email || typeof input.email !== "string") {
      throw new Error("email inválido");
    }
    return { email: input.email.trim().toLowerCase(), kind: input.kind ?? "auth" };
  })
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.kind === "manual") {
      const { error } = await supabaseAdmin
        .from("manual_customers")
        .delete()
        .eq("email", data.email);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // Localiza o usuário no Auth pelo e-mail
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();

    if (!profile?.id) {
      // fallback: tenta remover apenas por e-mail (perfil pode ter sido removido)
      const { error } = await supabaseAdmin.from("profiles").delete().eq("email", data.email);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // Remove do Auth — cascata via FK apaga profile e user_roles
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(profile.id);
    if (authErr) {
      // Se falhar (por algum motivo), remove ao menos o profile
      const { error } = await supabaseAdmin.from("profiles").delete().eq("id", profile.id);
      if (error) throw new Error(authErr.message);
    }
    return { ok: true };
  });
