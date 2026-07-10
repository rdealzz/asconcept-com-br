import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  shippingCost: number;
  discount: number;
  couponCode: string | null;
  paymentMethod: "pix" | "credit_card" | "boleto";
};

type CheckoutResult = {
  orderNumber: string;
  total: number;
  subtotal: number;
  status: string;
};

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
    shippingCost: Math.max(0, Number(d.shippingCost) || 0),
    discount: Math.max(0, Number(d.discount) || 0),
    couponCode: d.couponCode ? sanitize(d.couponCode, 40).toUpperCase() : null,
    paymentMethod: method,
  };
}

export const placeSecureOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId } = context;

    // Blindagem: buscar preços REAIS do banco — o valor enviado pelo cliente
    // é descartado para evitar fraude por inspeção de rede/DevTools.
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
      priceMap.set(r.id, {
        name: r.name,
        price: Number(r.price),
        image: r.image,
      });
    }

    // Reconstruir itens do pedido com preços canônicos vindos do banco.
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
    const discount = Math.min(data.discount, subtotal); // nunca deixa negativo
    const total = Math.max(0, subtotal - discount + data.shippingCost);

    // Gera o order_number no servidor.
    const rand = Math.floor(100000 + Math.random() * 900000);
    const orderNumber = `AS-${rand}`;

    const insertPayload = {
      order_number: orderNumber,
      user_id: userId,
      customer_email: data.customerEmail,
      customer_name: data.customerName || null,
      items: orderItems,
      address: data.address,
      shipping_cost: data.shippingCost,
      subtotal,
      total,
      payment_method: data.paymentMethod,
      status: "Preparando pedido",
      coupon_code: data.couponCode,
      discount,
    };

    const { data: inserted, error: insertErr } = await supabase
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
