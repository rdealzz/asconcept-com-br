// Lógica server-only do checkout Mercado Pago.
import { AVAILABLE_COUPONS, calcDiscount } from "@/lib/coupons";
import { quoteShipping } from "@/lib/shipping";
import {
  cardErrorMessage,
  mapMpStatus,
  mpCreatePayment,
  mpGetPayment,
} from "@/lib/mercadopago.server";
import {
  PIX_DISCOUNT_RATE,
  type CardInput,
  type PendingOrderInput,
} from "@/lib/payments-validators";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type PendingOrderResult =
  | {
      orderNumber: string;
      total: number;
      subtotal: number;
      shippingCost: number;
      discount: number;
    }
  | { error: string };

type OrderRow = {
  order_number: string;
  total: number | string;
  status: string;
  user_id: string | null;
  customer_email: string;
  customer_name: string | null;
  mp_payment_id: string | null;
  coupon_code: string | null;

};

const PAID_STATUSES = new Set(["Preparando pedido", "Em trânsito", "Entregue"]);

async function loadOwnOrder(
  supabase: AnySupabase,
  orderNumber: string,
  userId: string,
): Promise<OrderRow> {
  const { data, error } = await supabase
    .from("orders")
    .select("order_number, total, status, user_id, customer_email, customer_name, mp_payment_id")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error || !data) throw new Error("Pedido não encontrado.");
  const row = data as OrderRow;
  if (row.user_id !== userId) throw new Error("Pedido não pertence a este usuário.");
  return row;
}

async function notificationUrl(): Promise<string> {
  try {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    return `${getRequestUrl().origin}/api/public/payments/mercadopago`;
  } catch {
    return "";
  }
}

async function persistPayment(
  orderNumber: string,
  payment: { id: number | string; status: string; installments?: number | null },
  status: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("orders")
    .update({
      mp_payment_id: String(payment.id),
      mp_status: payment.status,
      installments: payment.installments ?? null,
      status,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("order_number", orderNumber);

  if (status === "Preparando pedido") {
    const { data: row } = await supabaseAdmin
      .from("orders")
      .select("stock_decremented")
      .eq("order_number", orderNumber)
      .maybeSingle();
    if (row && !(row as { stock_decremented: boolean }).stock_decremented) {
      try {
        await (
          supabaseAdmin.rpc as unknown as (
            n: string,
            a: Record<string, unknown>,
          ) => Promise<unknown>
        )("consume_order_stock", { _order_number: orderNumber });
      } catch (e) {
        console.error("[mp] consume_order_stock failed", e);
      }
    }
  }
}

/** Recalcula preços/frete/cupom no servidor e grava o pedido pendente. */
export async function createPendingOrderCore(
  supabase: AnySupabase,
  userId: string,
  data: PendingOrderInput,
): Promise<PendingOrderResult> {
  const ids = Array.from(new Set(data.items.map((i) => i.id)));
  const { data: rows, error: fetchErr } = await supabase
    .from("products")
    .select("id, name, price, image")
    .in("id", ids);
  if (fetchErr) return { error: "Falha ao validar preços dos produtos." };
  if (!rows || rows.length !== ids.length) {
    return { error: "Um ou mais produtos não foram encontrados." };
  }

  const priceMap = new Map<string, { name: string; price: number; image: string | null }>(
    (rows as { id: string; name: string; price: number | string; image: string | null }[]).map(
      (r) => [r.id, { name: r.name, price: Number(r.price), image: r.image }],
    ),
  );

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
  for (const i of orderItems) {
    if (!Number.isFinite(i.price) || i.price <= 0) {
      return { error: `Preço inválido para "${i.name}".` };
    }
  }

  const subtotal = orderItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

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

  const netAfterCoupon = Math.max(0, subtotal - couponDiscount);
  const pixDiscount =
    data.method === "pix" ? Math.round(netAfterCoupon * PIX_DISCOUNT_RATE * 100) / 100 : 0;
  const discount = Math.min(subtotal, couponDiscount + pixDiscount);
  const total = Math.round((Math.max(0, subtotal - discount) + shippingCost) * 100) / 100;
  if (total < 1) return { error: "Valor do pedido é inválido." };

  const orderNumber = `AS-${Math.floor(100000 + Math.random() * 900000)}`;
  const address = {
    cep: data.customer.cep,
    logradouro: data.customer.logradouro,
    numero: data.customer.numero,
    complemento: data.customer.complemento,
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
  const { error: insertErr } = await supabaseAdmin.from("orders").insert({
    order_number: orderNumber,
    user_id: userId,
    customer_email: data.customer.email,
    customer_name: data.customer.name,
    customer_phone: data.customer.phone,
    items: orderItems,
    address,
    shipping_cost: shippingCost,
    subtotal,
    total,
    payment_method: data.method === "pix" ? "mp_pix" : "mp_card",
    status: "Aguardando Pagamento",
    coupon_code: acceptedCoupon,
    discount,
  } as never);
  if (insertErr) {
    console.error("[mp] insert pending order failed:", insertErr);
    if (acceptedCoupon) {
      const { releaseCouponUse } = await import("@/lib/coupon-uses.server");
      await releaseCouponUse(userId, acceptedCoupon);
    }
    return { error: "Não foi possível registrar o pedido." };
  }


  return { orderNumber, total, subtotal, shippingCost, discount };
}

export type CardResult = {
  orderNumber: string;
  status: string;
  approved: boolean;
  message?: string;
};

export async function payWithCardCore(
  supabase: AnySupabase,
  userId: string,
  data: CardInput,
): Promise<CardResult> {
  const order = await loadOwnOrder(supabase, data.orderNumber, userId);
  if (PAID_STATUSES.has(order.status)) {
    return { orderNumber: order.order_number, status: order.status, approved: true };
  }

  const body: Record<string, unknown> = {
    transaction_amount: Number(order.total),
    token: data.token,
    description: `A&S Conccept · Pedido ${order.order_number}`,
    installments: data.installments,
    payment_method_id: data.paymentMethodId,
    external_reference: order.order_number,
    statement_descriptor: "ASCONCCEPT",
    payer: {
      email: data.payerEmail || order.customer_email,
      first_name: (order.customer_name ?? "").split(" ")[0] || undefined,
      identification: data.cpf ? { type: "CPF", number: data.cpf } : undefined,
    },
  };
  if (data.issuerId) body.issuer_id = data.issuerId;
  const notify = await notificationUrl();
  if (notify.startsWith("https://")) body.notification_url = notify;

  let payment;
  try {
    payment = await mpCreatePayment(body, `${order.order_number}-card-${Date.now()}`);
  } catch (e) {
    console.error("[mp] card payment error", e);
    return {
      orderNumber: order.order_number,
      status: order.status,
      approved: false,
      message: e instanceof Error ? e.message : "Falha ao processar o cartão.",
    };
  }

  const internal = mapMpStatus(payment.status);
  await persistPayment(order.order_number, payment, internal);

  if (payment.status === "approved") {
    return { orderNumber: order.order_number, status: internal, approved: true };
  }
  if (payment.status === "in_process" || payment.status === "pending") {
    return {
      orderNumber: order.order_number,
      status: internal,
      approved: false,
      message: "Pagamento em análise. Avisaremos por e-mail assim que for aprovado.",
    };
  }
  return {
    orderNumber: order.order_number,
    status: internal,
    approved: false,
    message: cardErrorMessage(payment.status_detail),
  };
}

export type PixResult =
  | {
      orderNumber: string;
      paymentId: string;
      qrCode: string;
      qrCodeBase64: string;
      expiresAt: string | null;
      amount: number;
    }
  | { error: string };

export async function createPixCore(
  supabase: AnySupabase,
  userId: string,
  data: { orderNumber: string; cpf: string },
): Promise<PixResult> {
  const order = await loadOwnOrder(supabase, data.orderNumber, userId);

  const [firstName, ...rest] = (order.customer_name ?? "").split(" ");
  const body: Record<string, unknown> = {
    transaction_amount: Number(order.total),
    description: `A&S Conccept · Pedido ${order.order_number}`,
    payment_method_id: "pix",
    external_reference: order.order_number,
    payer: {
      email: order.customer_email,
      first_name: firstName || undefined,
      last_name: rest.join(" ") || undefined,
      identification: { type: "CPF", number: data.cpf },
    },
  };
  const notify = await notificationUrl();
  if (notify.startsWith("https://")) body.notification_url = notify;

  let payment;
  try {
    payment = await mpCreatePayment(body, `${order.order_number}-pix`);
  } catch (e) {
    console.error("[mp] pix error", e);
    return { error: e instanceof Error ? e.message : "Falha ao gerar cobrança Pix." };
  }

  await persistPayment(order.order_number, payment, "Aguardando Pagamento");

  const td = payment.point_of_interaction?.transaction_data;
  if (!td?.qr_code) return { error: "Mercado Pago não retornou o QR Code do Pix." };

  return {
    orderNumber: order.order_number,
    paymentId: String(payment.id),
    qrCode: td.qr_code,
    qrCodeBase64: td.qr_code_base64 ?? "",
    expiresAt: payment.date_of_expiration ?? null,
    amount: Number(order.total),
  };
}

export async function paymentStatusCore(
  supabase: AnySupabase,
  userId: string,
  orderNumber: string,
): Promise<{ orderNumber: string; status: string; paid: boolean }> {
  const order = await loadOwnOrder(supabase, orderNumber, userId);
  if (PAID_STATUSES.has(order.status)) {
    return { orderNumber: order.order_number, status: order.status, paid: true };
  }

  if (order.mp_payment_id) {
    const payment = await mpGetPayment(order.mp_payment_id);
    if (payment) {
      const internal = mapMpStatus(payment.status);
      if (internal !== order.status) await persistPayment(order.order_number, payment, internal);
      return {
        orderNumber: order.order_number,
        status: internal,
        paid: payment.status === "approved",
      };
    }
  }
  return { orderNumber: order.order_number, status: order.status, paid: false };
}
