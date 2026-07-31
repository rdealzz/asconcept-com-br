import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OrderStatus } from "@/lib/types";

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderNumber: string; status: OrderStatus; trackingCode?: string }) => {
    if (!/^AS-\d{6}$/.test(input?.orderNumber ?? "")) throw new Error("Pedido inválido.");
    if (!["Aguardando Aprovação", "Preparando pedido", "Em trânsito", "Entregue"].includes(input?.status)) {
      throw new Error("Status inválido.");
    }
    return {
      orderNumber: input.orderNumber,
      status: input.status,
      trackingCode: typeof input.trackingCode === "string" ? input.trackingCode.slice(0, 80) : undefined,
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
      const { error } = await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("email", data.email);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // Remove do Auth — cascata via FK apaga profile e user_roles
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(profile.id);
    if (authErr) {
      // Se falhar (por algum motivo), remove ao menos o profile
      const { error } = await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", profile.id);
      if (error) throw new Error(authErr.message);
    }
    return { ok: true };
  });
