import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AVAILABLE_COUPONS, calcDiscount } from "@/lib/coupons";
import { quoteShipping, normalizeCep } from "@/lib/shipping";

type CheckoutItemInput = {
  id: string;
  quantity: number;
  size: "P" | "M" | "G" | "GG";
};

type CheckoutInput = {
  items: CheckoutItemInput[];
  customerName: string;
  customerEmail: string;
  address: Record<string, unknown>;
  couponCode: string | null;
  paymentMethod: "pix" | "credit_card" | "boleto";
};

type CheckoutResult = {
  orderNumber: string;
  total: number;
  subtotal: number;
  status: string;
};

const PIX_DISCOUNT_RATE = 0.05;
const INITIAL_STATUS = "Aguardando Aprovação";

function sanitize(v: unknown, max = 200): string {
  const s = typeof v === "string" ? v : "";
  return s
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim()
    .slice(0, max);
}

function validateInput(raw: unknown): CheckoutInput {
  const d = raw as Partial<CheckoutInput>;
  if (!d || typeof d !== "object") throw new Error("Payload inválido.");
  if (!Array.isArray(d.items) || d.items.length === 0) {
    throw new Error("Sua sacola está vazia.");
  }
  const items: CheckoutItemInput[] = d.items.map((it) => {
    const size = it?.size;
    if (size !== "P" && size !== "M" && size !== "G" && size !== "GG") {
      throw new Error("Tamanho inválido em um dos itens.");
    }
    const quantity = Math.max(1, Math.min(20, Math.floor(Number(it?.quantity) || 0)));
    if (!it?.id || typeof it.id !== "string") throw new Error("Produto inválido no carrinho.");
    return { id: it.id, quantity, size };
  });
  const method = d.paymentMethod;
  if (method !== "pix" && method !== "credit_card" && method !== "boleto") {
    throw new Error("Método de pagamento inválido.");
  }
  return {
    items,
    customerName: sanitize(d.customerName, 120),
    customerEmail: sanitize(d.customerEmail, 254).toLowerCase(),
    address: (d.address ?? {}) as Record<string, unknown>,
    couponCode: d.couponCode ? sanitize(d.couponCode, 40).toUpperCase() : null,
    paymentMethod: method,
  };
}

export const placeSecureOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId } = context;

    // Preços canônicos vindos do banco — o cliente não influencia o valor.
    const ids = Array.from(new Set(data.items.map((i) => i.id)));
    const { data: rows, error: fetchErr } = await supabase
      .from("products")
      .select("id, name, price, image")
      .in("id", ids);

    if (fetchErr) throw new Error("Falha ao validar preços dos produtos.");
    if (!rows || rows.length !== ids.length) {
      throw new Error("Um ou mais produtos não foram encontrados.");
    }

    const priceMap = new Map<string, { name: string; price: number; image: string | null }>();
    for (const r of rows) {
      priceMap.set(r.id, { name: r.name, price: Number(r.price), image: r.image });
    }

    const orderItems = data.items.map((it) => {
      const p = priceMap.get(it.id)!;
      return {
        id: it.id,
        name: p.name,
        price: p.price,
        image: p.image ?? "",
        quantity: it.quantity,
        size: it.size,
      };
    });

    const subtotal = orderItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

    // Frete recomputado a partir do CEP validado — nunca aceita valor do cliente.
    const rawCep = (data.address as { cep?: unknown }).cep;
    const cep = typeof rawCep === "string" ? normalizeCep(rawCep) : "";
    const quote = quoteShipping(cep, subtotal);
    if (!quote) throw new Error("CEP inválido para cálculo de frete.");
    const shippingCost = quote.displayCost;

    // Desconto recomputado a partir da lista canônica de cupons + regra PIX.
    let couponDiscount = 0;
    let acceptedCoupon: string | null = null;
    if (data.couponCode) {
      const coupon = AVAILABLE_COUPONS.find(
        (c) => c.code.toUpperCase() === data.couponCode,
      );
      if (coupon) {
        const { data: prior } = await supabase
          .from("coupon_uses")
          .select("id")
          .eq("user_id", userId)
          .eq("code", coupon.code.toUpperCase())
          .maybeSingle();
        if (!prior) {
          couponDiscount = calcDiscount(coupon, subtotal);
          acceptedCoupon = coupon.code.toUpperCase();
        }
      }
    }
    const netAfterCoupon = Math.max(0, subtotal - couponDiscount);
    const pixDiscount =
      data.paymentMethod === "pix"
        ? Math.round(netAfterCoupon * PIX_DISCOUNT_RATE * 100) / 100
        : 0;
    const discount = Math.min(subtotal, couponDiscount + pixDiscount);
    const total = Math.max(0, subtotal - discount + shippingCost);

    const rand = Math.floor(100000 + Math.random() * 900000);
    const orderNumber = `AS-${rand}`;

    const insertPayload = {
      order_number: orderNumber,
      user_id: userId,
      customer_email: data.customerEmail,
      customer_name: data.customerName || null,
      items: orderItems,
      address: data.address,
      shipping_cost: shippingCost,
      subtotal,
      total,
      payment_method: data.paymentMethod,
      status: INITIAL_STATUS,
      coupon_code: acceptedCoupon,
      discount,
    };

    // Inserção privilegiada: a política RLS de INSERT foi removida em orders,
    // forçando todo cadastro de pedido a passar por esta função autenticada.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert(insertPayload as never)
      .select("order_number, total, subtotal, status")
      .single();

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message ?? "Não foi possível registrar o pedido.");
    }

    return {
      orderNumber: (inserted as { order_number: string }).order_number,
      total: Number((inserted as { total: number | string }).total),
      subtotal: Number((inserted as { subtotal: number | string }).subtotal),
      status: (inserted as { status: string }).status,
    };
  });
