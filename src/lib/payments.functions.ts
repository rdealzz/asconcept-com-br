import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AVAILABLE_COUPONS, calcDiscount } from "@/lib/coupons";
import { quoteShipping } from "@/lib/shipping";

const PIX_DISCOUNT_RATE = 0.05;
const MAX_INSTALLMENTS = 12;

type Size = "P" | "M" | "G" | "GG";
type ItemInput = { id: string; quantity: number; size: Size };

type CustomerInput = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type PendingOrderInput = {
  items: ItemInput[];
  couponCode: string | null;
  method: "card" | "pix";
  customer: CustomerInput;
};

const UF_SET = new Set([
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
]);

function sanitize(v: unknown, max = 200): string {
  const s = typeof v === "string" ? v : "";
  return s
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim()
    .slice(0, max);
}

function validItems(raw: unknown): ItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Sua sacola está vazia.");
  return raw.map((it) => {
    const size = (it as ItemInput)?.size;
    if (size !== "P" && size !== "M" && size !== "G" && size !== "GG") {
      throw new Error("Tamanho inválido em um dos itens.");
    }
    const id = (it as ItemInput)?.id;
    if (!id || typeof id !== "string") throw new Error("Produto inválido no carrinho.");
    const quantity = Math.max(1, Math.min(20, Math.floor(Number((it as ItemInput)?.quantity) || 0)));
    return { id, quantity, size };
  });
}

function validCustomer(raw: unknown): CustomerInput {
  const c = (raw ?? {}) as Partial<CustomerInput>;
  const out: CustomerInput = {
    name: sanitize(c.name, 120),
    email: sanitize(c.email, 254).toLowerCase(),
    phone: sanitize(c.phone, 20).replace(/\D/g, ""),
    cpf: sanitize(c.cpf, 20).replace(/\D/g, ""),
    cep: sanitize(c.cep, 9).replace(/\D/g, ""),
    logradouro: sanitize(c.logradouro, 160),
    numero: sanitize(c.numero, 20),
    complemento: sanitize(c.complemento ?? "", 80),
    bairro: sanitize(c.bairro, 120),
    cidade: sanitize(c.cidade, 120),
    uf: sanitize(c.uf, 2).toUpperCase(),
  };
  if (out.name.length < 3) throw new Error("Nome completo é obrigatório.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Error("E-mail inválido.");
  if (out.phone.length < 10 || out.phone.length > 11) throw new Error("Telefone inválido.");
  if (out.cpf.length !== 11) throw new Error("CPF inválido.");
  if (out.cep.length !== 8) throw new Error("CEP inválido.");
  if (!out.logradouro) throw new Error("Endereço é obrigatório.");
  if (!out.numero) throw new Error("Número é obrigatório.");
  if (!out.bairro) throw new Error("Bairro é obrigatório.");
  if (!out.cidade) throw new Error("Cidade é obrigatória.");
  if (!UF_SET.has(out.uf)) throw new Error("UF inválida.");
  return out;
}

function validPendingInput(raw: unknown): PendingOrderInput {
  const d = (raw ?? {}) as Partial<PendingOrderInput>;
  if (d.method !== "card" && d.method !== "pix") throw new Error("Forma de pagamento inválida.");
  return {
    items: validItems(d.items),
    couponCode: d.couponCode ? sanitize(d.couponCode, 40).toUpperCase() : null,
    method: d.method,
    customer: validCustomer(d.customer),
  };
}

/**
 * Etapa 1 do pagamento: recalcula tudo no servidor e grava o pedido pendente.
 * O valor cobrado no Mercado Pago SEMPRE vem daqui (nunca do cliente).
 */
export const createPendingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validPendingInput)
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { orderNumber: string; total: number; subtotal: number; shippingCost: number; discount: number }
      | { error: string }
    > => {
      const { supabase, userId } = context;

      const ids = Array.from(new Set(data.items.map((i) => i.id)));
      const { data: rows, error: fetchErr } = await supabase
        .from("products")
        .select("id, name, price, image")
        .in("id", ids);
      if (fetchErr) return { error: "Falha ao validar preços dos produtos." };
      if (!rows || rows.length !== ids.length) {
        return { error: "Um ou mais produtos não foram encontrados." };
      }

      const priceMap = new Map(
        rows.map((r) => [r.id, { name: r.name, price: Number(r.price), image: r.image }]),
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
        return { error: "Não foi possível registrar o pedido." };
      }

      return { orderNumber, total, subtotal, shippingCost, discount };
    },
  );

// ---------------------------------------------------------------------------
// Pagamento
// ---------------------------------------------------------------------------

type OrderRow = {
  order_number: string;
  total: number | string;
  status: string;
  user_id: string | null;
  customer_email: string;
  customer_name: string | null;
  mp_payment_id: string | null;
};

async function loadOwnOrder(
  supabase: { from: (t: string) => any },
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

function notificationUrl(): string {
  try {
    const url = getRequestUrl();
    return `${url.origin}/api/public/payments/mercadopago`;
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
          supabaseAdmin.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<unknown>
        )("consume_order_stock", { _order_number: orderNumber });
      } catch (e) {
        console.error("[mp] consume_order_stock failed", e);
      }
    }
  }
}

type CardInput = {
  orderNumber: string;
  token: string;
  paymentMethodId: string;
  issuerId?: string | null;
  installments: number;
  payerEmail: string;
  cpf: string;
};

export const payWithCardToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown): CardInput => {
    const d = (raw ?? {}) as Partial<CardInput>;
    const orderNumber = sanitize(d.orderNumber, 20);
    const token = sanitize(d.token, 120);
    const paymentMethodId = sanitize(d.paymentMethodId, 40);
    const installments = Math.max(1, Math.min(MAX_INSTALLMENTS, Math.floor(Number(d.installments) || 1)));
    if (!/^AS-\d{6}$/.test(orderNumber)) throw new Error("Pedido inválido.");
    if (!token) throw new Error("Token do cartão ausente.");
    if (!paymentMethodId) throw new Error("Bandeira do cartão não identificada.");
    return {
      orderNumber,
      token,
      paymentMethodId,
      issuerId: d.issuerId ? sanitize(d.issuerId, 20) : null,
      installments,
      payerEmail: sanitize(d.payerEmail, 254).toLowerCase(),
      cpf: sanitize(d.cpf, 20).replace(/\D/g, ""),
    };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ orderNumber: string; status: string; approved: boolean; message?: string }> => {
      const { supabase, userId } = context;
      const order = await loadOwnOrder(supabase as never, data.orderNumber, userId);
      if (order.status !== "Aguardando Pagamento") {
        return { orderNumber: order.order_number, status: order.status, approved: true };
      }

      const { mpCreatePayment, mapMpStatus, cardErrorMessage } = await import(
        "@/lib/mercadopago.server"
      );

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
      const notify = notificationUrl();
      if (notify.startsWith("https://")) body.notification_url = notify;

      let payment;
      try {
        payment = await mpCreatePayment(body, `${order.order_number}-card`);
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
    },
  );

export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = (raw ?? {}) as { orderNumber?: string; cpf?: string };
    const orderNumber = sanitize(d.orderNumber, 20);
    if (!/^AS-\d{6}$/.test(orderNumber)) throw new Error("Pedido inválido.");
    const cpf = sanitize(d.cpf, 20).replace(/\D/g, "");
    if (cpf.length !== 11) throw new Error("CPF é obrigatório para pagamento via Pix.");
    return { orderNumber, cpf };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | {
          orderNumber: string;
          paymentId: string;
          qrCode: string;
          qrCodeBase64: string;
          expiresAt: string | null;
          amount: number;
        }
      | { error: string }
    > => {
      const { supabase, userId } = context;
      const order = await loadOwnOrder(supabase as never, data.orderNumber, userId);
      const { mpCreatePayment } = await import("@/lib/mercadopago.server");

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
      const notify = notificationUrl();
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
    },
  );

export const getPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = (raw ?? {}) as { orderNumber?: string };
    const orderNumber = sanitize(d.orderNumber, 20);
    if (!/^AS-\d{6}$/.test(orderNumber)) throw new Error("Pedido inválido.");
    return { orderNumber };
  })
  .handler(
    async ({ data, context }): Promise<{ orderNumber: string; status: string; paid: boolean }> => {
      const { supabase, userId } = context;
      const order = await loadOwnOrder(supabase as never, data.orderNumber, userId);

      if (order.status === "Preparando pedido" || order.status === "Em trânsito" || order.status === "Entregue") {
        return { orderNumber: order.order_number, status: order.status, paid: true };
      }

      // Consulta o Mercado Pago como fallback do webhook.
      if (order.mp_payment_id) {
        const { mpGetPayment, mapMpStatus } = await import("@/lib/mercadopago.server");
        const payment = await mpGetPayment(order.mp_payment_id);
        if (payment) {
          const internal = mapMpStatus(payment.status);
          if (internal !== order.status) {
            await persistPayment(order.order_number, payment, internal);
          }
          return {
            orderNumber: order.order_number,
            status: internal,
            paid: payment.status === "approved",
          };
        }
      }
      return { orderNumber: order.order_number, status: order.status, paid: false };
    },
  );

export const getMpPublicKey = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publicKey: string | null }> => {
    return { publicKey: process.env.MP_PUBLIC_KEY ?? null };
  },
);
