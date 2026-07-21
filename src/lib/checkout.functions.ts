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
      if (!coupon) {
        throw new Error(
          "Cupom inválido. Remova o cupom aplicado e refaça o cálculo do pedido.",
        );
      }
      const { data: prior } = await supabase
        .from("coupon_uses")
        .select("id")
        .eq("user_id", userId)
        .eq("code", coupon.code.toUpperCase())
        .maybeSingle();
      if (prior) {
        throw new Error(
          "Este cupom já foi utilizado. Remova o cupom aplicado para prosseguir com o pedido.",
        );
      }
      couponDiscount = calcDiscount(coupon, subtotal);
      acceptedCoupon = coupon.code.toUpperCase();
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

// ============================================================================
// Stripe Embedded Checkout — pagamento com cartão
// ============================================================================

type StripeCheckoutInput = {
  items: CheckoutItemInput[];
  customerName: string;
  customerEmail: string;
  address: Record<string, unknown>;
  couponCode: string | null;
  environment: "sandbox" | "live";
  returnUrl: string;
};

type StripeCheckoutResult =
  | { clientSecret: string; orderNumber: string; total: number }
  | { error: string };

function validateStripeInput(raw: unknown): StripeCheckoutInput {
  const d = raw as Partial<StripeCheckoutInput>;
  if (!d || typeof d !== "object") throw new Error("Payload inválido.");
  if (!Array.isArray(d.items) || d.items.length === 0) throw new Error("Sua sacola está vazia.");
  const items: CheckoutItemInput[] = d.items.map((it) => {
    const size = it?.size;
    if (size !== "P" && size !== "M" && size !== "G" && size !== "GG") {
      throw new Error("Tamanho inválido em um dos itens.");
    }
    const quantity = Math.max(1, Math.min(20, Math.floor(Number(it?.quantity) || 0)));
    if (!it?.id || typeof it.id !== "string") throw new Error("Produto inválido no carrinho.");
    return { id: it.id, quantity, size };
  });
  if (d.environment !== "sandbox" && d.environment !== "live") {
    throw new Error("Ambiente de pagamento inválido.");
  }
  const returnUrl = typeof d.returnUrl === "string" ? d.returnUrl : "";
  if (!returnUrl.startsWith("http")) throw new Error("URL de retorno inválida.");
  return {
    items,
    customerName: sanitize(d.customerName, 120),
    customerEmail: sanitize(d.customerEmail, 254).toLowerCase(),
    address: (d.address ?? {}) as Record<string, unknown>,
    couponCode: d.couponCode ? sanitize(d.couponCode, 40).toUpperCase() : null,
    environment: d.environment,
    returnUrl,
  };
}

export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateStripeInput)
  .handler(async ({ data, context }): Promise<StripeCheckoutResult> => {
    const { supabase, userId } = context;

    const ids = Array.from(new Set(data.items.map((i) => i.id)));
    const { data: rows, error: fetchErr } = await supabase
      .from("products")
      .select("id, name, price, image")
      .in("id", ids);
    if (fetchErr) throw new Error("Falha ao validar preços dos produtos.");
    if (!rows || rows.length !== ids.length) throw new Error("Um ou mais produtos não foram encontrados.");

    const priceMap = new Map<string, { name: string; price: number; image: string | null }>();
    for (const r of rows) priceMap.set(r.id, { name: r.name, price: Number(r.price), image: r.image });

    const orderItems = data.items.map((it) => {
      const p = priceMap.get(it.id)!;
      return { id: it.id, name: p.name, price: p.price, image: p.image ?? "", quantity: it.quantity, size: it.size };
    });

    const subtotal = orderItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

    const rawCep = (data.address as { cep?: unknown }).cep;
    const cep = typeof rawCep === "string" ? normalizeCep(rawCep) : "";
    const quote = quoteShipping(cep, subtotal);
    if (!quote) throw new Error("CEP inválido para cálculo de frete.");
    const shippingCost = quote.displayCost;

    let couponDiscount = 0;
    let acceptedCoupon: string | null = null;
    if (data.couponCode) {
      const coupon = AVAILABLE_COUPONS.find((c) => c.code.toUpperCase() === data.couponCode);
      if (!coupon) throw new Error("Cupom inválido. Remova o cupom para continuar.");
      const { data: prior } = await supabase
        .from("coupon_uses")
        .select("id")
        .eq("user_id", userId)
        .eq("code", coupon.code.toUpperCase())
        .maybeSingle();
      if (prior) throw new Error("Este cupom já foi utilizado. Remova o cupom para continuar.");
      couponDiscount = calcDiscount(coupon, subtotal);
      acceptedCoupon = coupon.code.toUpperCase();
    }

    const discount = Math.min(subtotal, couponDiscount);
    const total = Math.max(0, subtotal - discount + shippingCost);
    if (total < 1) throw new Error("Valor do pedido é inválido.");

    const rand = Math.floor(100000 + Math.random() * 900000);
    const orderNumber = `AS-${rand}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        user_id: userId,
        customer_email: data.customerEmail,
        customer_name: data.customerName || null,
        items: orderItems,
        address: data.address,
        shipping_cost: shippingCost,
        subtotal,
        total,
        payment_method: "credit_card",
        status: "Aguardando Pagamento",
        coupon_code: acceptedCoupon,
        discount,
      } as never);
    if (insertErr) throw new Error(insertErr.message);

    try {
      const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer_email: data.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "brl",
              unit_amount: Math.round(total * 100),
              product_data: {
                name: `Pedido ${orderNumber} — A&S Conccept`,
                description: orderItems
                  .map((i) => `${i.quantity}× ${i.name} (${i.size})`)
                  .join(" · ")
                  .slice(0, 500),
              },
            },
          },
        ],
        payment_intent_data: {
          description: `A&S Conccept · Pedido ${orderNumber}`,
        },
        metadata: { orderNumber, userId: userId },
      });

      await supabaseAdmin
        .from("orders")
        .update({ stripe_session_id: session.id } as never)
        .eq("order_number", orderNumber);

      return {
        clientSecret: session.client_secret ?? "",
        orderNumber,
        total,
      };
    } catch (error) {
      // Se o Stripe falhar, marca o pedido como cancelado para não bloquear cupom/estoque.
      await supabaseAdmin
        .from("orders")
        .update({ status: "Falha no pagamento" } as never)
        .eq("order_number", orderNumber);
      const { getStripeErrorMessage } = await import("@/lib/stripe.server");
      return { error: getStripeErrorMessage(error) };
    }
  });

// Confirma o pagamento no retorno do Stripe (fallback ao webhook).
export const confirmStripePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { sessionId?: string; environment?: "sandbox" | "live" };
    if (!d?.sessionId || typeof d.sessionId !== "string") throw new Error("Sessão inválida.");
    if (d.environment !== "sandbox" && d.environment !== "live") throw new Error("Ambiente inválido.");
    return { sessionId: d.sessionId, environment: d.environment };
  })
  .handler(async ({ data, context }): Promise<{ orderNumber: string; status: string; paid: boolean }> => {
    const { supabase, userId } = context;
    const { data: order, error } = await supabase
      .from("orders")
      .select("order_number, status, stock_decremented, user_id")
      .eq("stripe_session_id", data.sessionId)
      .maybeSingle();
    if (error || !order) throw new Error("Pedido não encontrado para essa sessão.");
    if (order.user_id !== userId) throw new Error("Pedido não pertence a este usuário.");

    if (order.status !== "Aguardando Pagamento") {
      return { orderNumber: order.order_number, status: order.status, paid: true };
    }

    const { createStripeClient } = await import("@/lib/stripe.server");
    const stripe = createStripeClient(data.environment);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    const paid = session.payment_status === "paid" || session.status === "complete";
    if (!paid) return { orderNumber: order.order_number, status: order.status, paid: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("orders")
      .update({ status: "Preparando pedido", updated_at: new Date().toISOString() } as never)
      .eq("order_number", order.order_number);
    if (!order.stock_decremented) {
      try {
        await (supabaseAdmin.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<unknown>)(
          "consume_order_stock",
          { _order_number: order.order_number },
        );
      } catch (e) {
        console.error("consume_order_stock failed:", e);
      }
    }
    return { orderNumber: order.order_number, status: "Preparando pedido", paid: true };
  });
