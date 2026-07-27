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

// Alterar para `true` quando o Pix for aprovado pela Stripe.
const PIX_ENABLED = false;

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

// Fluxo legado (Pix/Boleto manual e cadastros administrativos).
export const placeSecureOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId } = context;

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

    const rawCep = (data.address as { cep?: unknown }).cep;
    const cep = typeof rawCep === "string" ? normalizeCep(rawCep) : "";
    const quote = quoteShipping(cep, subtotal);
    if (!quote) throw new Error("CEP inválido para cálculo de frete.");
    const shippingCost = quote.displayCost;

    let couponDiscount = 0;
    let acceptedCoupon: string | null = null;
    if (data.couponCode) {
      const coupon = AVAILABLE_COUPONS.find(
        (c) => c.code.toUpperCase() === data.couponCode,
      );
      if (!coupon) throw new Error("Cupom inválido.");
      const { data: prior } = await supabase
        .from("coupon_uses")
        .select("id")
        .eq("user_id", userId)
        .eq("code", coupon.code.toUpperCase())
        .maybeSingle();
      if (prior) throw new Error("Este cupom já foi utilizado.");
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

    // Reserva o cupom antes de gravar o pedido (UNIQUE (user_id, code) evita corrida).
    if (acceptedCoupon) {
      const { claimCouponUse } = await import("@/lib/coupon-uses.server");
      const claimed = await claimCouponUse(userId, acceptedCoupon, orderNumber);
      if (!claimed) throw new Error("Este cupom já foi utilizado.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert(insertPayload as never)
      .select("order_number, total, subtotal, status")
      .single();

    if (insertErr || !inserted) {
      if (acceptedCoupon) {
        const { releaseCouponUse } = await import("@/lib/coupon-uses.server");
        await releaseCouponUse(userId, acceptedCoupon);
      }
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
// Stripe Hosted Checkout — redireciona direto para a página segura do Stripe.
// ============================================================================

type CustomerPayload = {
  name: string;
  email: string;
  phone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type HostedCheckoutInput = {
  items: CheckoutItemInput[];
  couponCode: string | null;
  environment: "sandbox" | "live";
  successUrl: string;
  cancelUrl: string;
  origin: string;
  customer: CustomerPayload;
};

type HostedCheckoutResult =
  | { url: string; orderNumber: string }
  | { error: string };

const UF_SET = new Set([
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
]);

function validateCustomer(raw: unknown): CustomerPayload {
  const c = (raw ?? {}) as Partial<CustomerPayload>;
  const name = sanitize(c.name, 120);
  const email = sanitize(c.email, 254).toLowerCase();
  const phone = sanitize(c.phone, 20).replace(/\D/g, "");
  const cep = sanitize(c.cep, 9).replace(/\D/g, "");
  const logradouro = sanitize(c.logradouro, 160);
  const numero = sanitize(c.numero, 20);
  const complemento = sanitize(c.complemento ?? "", 80);
  const bairro = sanitize(c.bairro, 120);
  const cidade = sanitize(c.cidade, 120);
  const uf = sanitize(c.uf, 2).toUpperCase();

  if (name.length < 3) throw new Error("Nome completo é obrigatório.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.");
  if (phone.length < 10 || phone.length > 11) throw new Error("Telefone inválido.");
  if (cep.length !== 8) throw new Error("CEP inválido.");
  if (!logradouro) throw new Error("Endereço é obrigatório.");
  if (!numero) throw new Error("Número é obrigatório.");
  if (!bairro) throw new Error("Bairro é obrigatório.");
  if (!cidade) throw new Error("Cidade é obrigatória.");
  if (!UF_SET.has(uf)) throw new Error("UF inválida.");

  return { name, email, phone, cep, logradouro, numero, complemento, bairro, cidade, uf };
}

function validateHostedInput(raw: unknown): HostedCheckoutInput {
  const d = raw as Partial<HostedCheckoutInput>;
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
  const origin = typeof d.origin === "string" ? d.origin : "";
  const successUrl = typeof d.successUrl === "string" ? d.successUrl : "";
  const cancelUrl = typeof d.cancelUrl === "string" ? d.cancelUrl : "";
  if (!/^https?:\/\//.test(successUrl) || !/^https?:\/\//.test(cancelUrl)) {
    throw new Error("URLs de retorno inválidas.");
  }
  return {
    items,
    couponCode: d.couponCode ? sanitize(d.couponCode, 40).toUpperCase() : null,
    environment: d.environment,
    successUrl,
    cancelUrl,
    origin: /^https?:\/\//.test(origin) ? origin.replace(/\/$/, "") : "",
    customer: validateCustomer(d.customer),
  };
}

// Converte URL de imagem em URL pública absoluta; descarta se não for válida.
function toPublicImageUrl(image: string | null | undefined, origin: string): string | null {
  if (!image) return null;
  const s = image.trim();
  if (!s || s.startsWith("data:")) return null;
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) return null; // Stripe exige HTTPS.
  if (s.startsWith("/") && origin) return `${origin}${s}`;
  return null;
}

export const createStripeHostedSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateHostedInput)
  .handler(async ({ data, context }): Promise<HostedCheckoutResult> => {
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

    // Validação estrita antes de chamar Stripe (evita erro genérico do provedor).
    for (const i of orderItems) {
      if (!i.name || typeof i.name !== "string") {
        console.error("[checkout] item sem nome:", i);
        return { error: `Produto "${i.id}" está sem nome. Contate o suporte.` };
      }
      if (!Number.isFinite(i.price) || i.price <= 0) {
        console.error("[checkout] preço inválido:", i);
        return { error: `Preço inválido para "${i.name}".` };
      }
      if (!Number.isInteger(i.quantity) || i.quantity < 1) {
        console.error("[checkout] quantidade inválida:", i);
        return { error: `Quantidade inválida para "${i.name}".` };
      }
    }

    const subtotal = orderItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

    // Frete calculado a partir do CEP informado na Etapa 1.
    const quote = quoteShipping(data.customer.cep, subtotal);
    if (!quote) return { error: "CEP inválido para cálculo de frete." };
    const shippingCost = quote.displayCost;

    let couponDiscount = 0;
    let acceptedCoupon: string | null = null;
    if (data.couponCode) {
      const coupon = AVAILABLE_COUPONS.find((c) => c.code.toUpperCase() === data.couponCode);
      if (!coupon) return { error: "Cupom inválido. Remova o cupom para continuar." };
      const { data: prior } = await supabase
        .from("coupon_uses")
        .select("id")
        .eq("user_id", userId)
        .eq("code", coupon.code.toUpperCase())
        .maybeSingle();
      if (prior) return { error: "Este cupom já foi utilizado. Remova o cupom para continuar." };
      couponDiscount = calcDiscount(coupon, subtotal);
      acceptedCoupon = coupon.code.toUpperCase();
    }

    const discount = Math.min(subtotal, couponDiscount);
    const netProducts = Math.max(0, subtotal - discount);
    if (netProducts < 1) return { error: "Valor do pedido é inválido." };

    const rand = Math.floor(100000 + Math.random() * 900000);
    const orderNumber = `AS-${rand}`;

    const addressPayload = {
      cep: data.customer.cep,
      logradouro: data.customer.logradouro,
      numero: data.customer.numero,
      complemento: data.customer.complemento ?? "",
      bairro: data.customer.bairro,
      cidade: data.customer.cidade,
      uf: data.customer.uf,
    };

    // Reserva o cupom antes de gravar o pedido (UNIQUE (user_id, code) evita corrida).
    if (acceptedCoupon) {
      const { claimCouponUse } = await import("@/lib/coupon-uses.server");
      const claimed = await claimCouponUse(userId, acceptedCoupon, orderNumber);
      if (!claimed) {
        return { error: "Este cupom já foi utilizado. Remova o cupom para continuar." };
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const baseInsert = {
      order_number: orderNumber,
      user_id: userId,
      customer_email: data.customer.email,
      customer_name: data.customer.name,
      items: orderItems,
      address: addressPayload,
      shipping_cost: shippingCost,
      subtotal,
      total: netProducts + shippingCost,
      payment_method: "stripe",
      status: "Aguardando Pagamento",
      coupon_code: acceptedCoupon,
      discount,
    };
    const { error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert({ ...baseInsert, customer_phone: data.customer.phone } as never);
    if (insertErr) {
      // Fallback caso a coluna customer_phone ainda não exista no schema.
      const { error: retryErr } = await supabaseAdmin
        .from("orders")
        .insert(baseInsert as never);
      if (retryErr) {
        console.error("[checkout] insert order failed:", insertErr, retryErr);
        if (acceptedCoupon) {
          const { releaseCouponUse } = await import("@/lib/coupon-uses.server");
          await releaseCouponUse(userId, acceptedCoupon);
        }
        return { error: retryErr.message };
      }
    }


    try {
      const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
      const stripe = createStripeClient(data.environment);

      const lineItems = orderItems.map((i) => {
        const publicImage = toPublicImageUrl(i.image, data.origin);
        const product_data: { name: string; images?: string[] } = {
          name: `${i.name} — Tam. ${i.size}`,
        };
        if (publicImage) product_data.images = [publicImage];
        return {
          quantity: i.quantity,
          price_data: {
            currency: "brl",
            unit_amount: Math.round(i.price * 100),
            product_data,
          },
        };
      });

      const shippingOptions = [
        {
          shipping_rate_data: {
            type: "fixed_amount" as const,
            display_name: quote.free ? "Frete grátis — envio nacional" : "Envio nacional",
            fixed_amount: { amount: Math.round(shippingCost * 100), currency: "brl" },
            delivery_estimate: {
              minimum: { unit: "business_day" as const, value: quote.etaDays[0] },
              maximum: { unit: "business_day" as const, value: quote.etaDays[1] },
            },
          },
        },
      ];

      const successUrl = `${data.successUrl}${data.successUrl.includes("?") ? "&" : "?"}order=${orderNumber}&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = data.cancelUrl;

      const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
        mode: "payment",
        payment_method_types: PIX_ENABLED ? ["card", "pix"] : ["card"],
        currency: "brl",
        locale: "pt-BR",
        customer_email: data.customer.email,
        line_items: lineItems,
        shipping_options: shippingOptions,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          orderNumber,
          userId,
          customerName: data.customer.name,
          customerPhone: data.customer.phone,
        },
        payment_intent_data: {
          description: `A&S Conccept · Pedido ${orderNumber}`,
          metadata: { orderNumber, userId },
        },
      };

      if (discount > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: Math.round(discount * 100),
          currency: "brl",
          duration: "once",
          name: acceptedCoupon ? `Cupom ${acceptedCoupon}` : "Desconto",
        });
        sessionParams.discounts = [{ coupon: coupon.id }];
      }

      console.log("[checkout] creating Stripe session", {
        orderNumber,
        environment: data.environment,
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: lineItems.map((l) => ({
          quantity: l.quantity,
          name: l.price_data.product_data.name,
          unit_amount: l.price_data.unit_amount,
          images: l.price_data.product_data.images,
        })),
        shipping_amount_cents: Math.round(shippingCost * 100),
      });

      const session = await stripe.checkout.sessions.create(sessionParams);

      await supabaseAdmin
        .from("orders")
        .update({ stripe_session_id: session.id } as never)
        .eq("order_number", orderNumber);

      if (!session.url) return { error: "Stripe não retornou URL de checkout." };
      return { url: session.url, orderNumber };
    } catch (error) {
      console.error("[checkout] Stripe error:", error);
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
    const session = await stripe.checkout.sessions.retrieve(data.sessionId, {
      expand: ["customer_details", "shipping_details", "total_details"],
    });
    const paid = session.payment_status === "paid" || session.status === "complete";
    if (!paid) return { orderNumber: order.order_number, status: order.status, paid: false };

    const shippingCost = ((session.total_details?.amount_shipping ?? 0) as number) / 100;
    const totalPaid = ((session.amount_total ?? 0) as number) / 100;

    // Endereço e nome já foram capturados na Etapa 1 do checkout; aqui apenas
    // atualizamos status, frete e total confirmados pelo Stripe.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("orders")
      .update({
        status: "Preparando pedido",
        shipping_cost: shippingCost,
        total: totalPaid,
        updated_at: new Date().toISOString(),
      } as never)
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
