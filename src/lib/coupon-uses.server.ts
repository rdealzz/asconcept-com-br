/**
 * Registro atômico de uso de cupom (server-only).
 *
 * A tabela public.coupon_uses tem UNIQUE (user_id, code), então o INSERT é o
 * ponto de verdade contra corridas: se dois pedidos simultâneos tentarem usar
 * o mesmo cupom, apenas um consegue reservar.
 */

const UNIQUE_VIOLATION = "23505";

/**
 * Reserva o cupom para o usuário. Retorna false se já havia sido usado.
 */
export async function claimCouponUse(
  userId: string,
  code: string,
  orderId?: string | null,
): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("coupon_uses")
    .insert({ user_id: userId, code: code.toUpperCase(), order_id: orderId ?? null } as never);

  if (!error) return true;
  if ((error as { code?: string }).code === UNIQUE_VIOLATION) return false;
  console.error("[coupons] falha ao registrar uso do cupom:", error);
  return false;
}

/**
 * Libera a reserva caso a criação do pedido falhe depois do claim.
 */
export async function releaseCouponUse(userId: string, code: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("coupon_uses")
      .delete()
      .eq("user_id", userId)
      .eq("code", code.toUpperCase());
  } catch (err) {
    console.error("[coupons] falha ao liberar cupom:", err);
  }
}

/**
 * Vincula o uso já reservado ao pedido criado (best-effort).
 */
export async function attachCouponOrder(
  userId: string,
  code: string,
  orderId: string,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("coupon_uses")
      .update({ order_id: orderId } as never)
      .eq("user_id", userId)
      .eq("code", code.toUpperCase());
  } catch (err) {
    console.error("[coupons] falha ao vincular pedido ao cupom:", err);
  }
}
