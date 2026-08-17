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

/** Teto de cadastros manuais por admin: pedido gravado é linha em `orders`. */
const LIMITE_PEDIDO_MANUAL = { limite: 30, janelaMs: 5 * 60_000 };

/**
 * Registra uma venda feita fora da loja.
 *
 * Saiu do navegador e veio para cá por causa do estoque. O cadastro manual
 * gravava o pedido direto pelo cliente do Supabase, com a chave publicável: dava
 * para conferir o estoque antes, mas não para baixá-lo — a baixa é do service
 * role — e menos ainda para fazer as duas coisas numa transação só. Resultado:
 * a venda de balcão só saía do estoque quando alguém lembrava de avançar o
 * status no painel, e até lá a loja seguia oferecendo peça já vendida.
 *
 * Aqui o pedido nasce "Finalizado" e o estoque cai junto. Falta peça? Nada é
 * gravado, e a recusa volta com o motivo (ver `manual-order.server`).
 */
export const adminCreateManualOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      customerEmail: string;
      customerName?: string;
      items: { id: string; size: string; quantity: number; valor: number }[];
    }) => {
      const items = Array.isArray(input?.items) ? input.items : [];
      if (!items.length) throw new Error("O pedido precisa de ao menos uma peça.");
      if (items.length > 40) throw new Error("Pedido com peças demais.");
      return {
        customerEmail: String(input?.customerEmail ?? "")
          .trim()
          .toLowerCase()
          .slice(0, 254),
        customerName: String(input?.customerName ?? "")
          .replace(/[<>]/g, "")
          .trim()
          .slice(0, 120),
        items: items.map((i) => {
          if (!i?.id || typeof i.id !== "string") throw new Error("Peça inválida no pedido.");
          const size = String(i?.size ?? "").slice(0, 20);
          if (!size) throw new Error("Informe o tamanho de cada peça.");
          // Tetos largos, só para que um valor absurdo não vire pedido: quem
          // decide preço no balcão é o admin, e a negociação é o ponto do
          // cadastro manual.
          const quantity = Math.max(1, Math.min(99, Math.floor(Number(i?.quantity) || 0)));
          const valor = Math.max(0, Math.min(1_000_000, Number(i?.valor) || 0));
          return { id: i.id, size, quantity, valor };
        }),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado.");

    const { exigirLimitePorUsuario } = await import("@/lib/rate-limit.server");
    exigirLimitePorUsuario("pedido-manual", context.userId, LIMITE_PEDIDO_MANUAL);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createManualOrderCore } = await import("@/lib/manual-order.server");
    return createManualOrderCore(supabaseAdmin, data);
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
