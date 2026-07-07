import { supabase } from "@/integrations/supabase/client";

export type Coupon = {
  code: string;
  discountType: "percent" | "fixed";
  value: number;
  label: string;
  description: string;
};

export const AVAILABLE_COUPONS: Coupon[] = [
  {
    code: "10%OFFF",
    discountType: "percent",
    value: 10,
    label: "Boas-vindas · 10% OFF",
    description: "Cupom exclusivo de estreia. Válido uma única vez por cliente.",
  },
];

export function findCoupon(code: string): Coupon | null {
  const norm = code.trim().toUpperCase();
  return AVAILABLE_COUPONS.find((c) => c.code.toUpperCase() === norm) ?? null;
}

export function calcDiscount(coupon: Coupon, subtotal: number): number {
  if (coupon.discountType === "percent") {
    return Math.max(0, Math.round(subtotal * (coupon.value / 100) * 100) / 100);
  }
  return Math.min(subtotal, coupon.value);
}

export async function hasUsedCoupon(userId: string, code: string): Promise<boolean> {
  const { data } = await supabase
    .from("coupon_uses")
    .select("id")
    .eq("user_id", userId)
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  return !!data;
}

export async function markCouponUsed(userId: string, code: string, orderId?: string) {
  await supabase.from("coupon_uses").insert({
    user_id: userId,
    code: code.trim().toUpperCase(),
    order_id: orderId ?? null,
  } as never);
}
