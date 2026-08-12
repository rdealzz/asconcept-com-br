import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AVAILABLE_COUPONS, calcDiscount } from "@/lib/coupons";
import { quoteShipping, normalizeCep } from "@/lib/shipping";
import { PIX_DISCOUNT_RATE, validSize } from "@/lib/payments-validators";

type CheckoutItemInput = {
  id: string;
  quantity: number;
  /** "M", "42", "Único" — a grade depende da peça (ver `@/lib/sizes`). */
  size: string;
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

/**
 * Todo pedido nasce aqui: seja o manual do admin, seja o do cliente depois que
 * o pagamento é confirmado. Quem tira o pedido deste estado é o administrador,
 * clicando em avançar no painel — nunca o gateway de pagamento sozinho.
 */
const INITIAL_STATUS = "Aguardando Aprovação";

/** O `sizes` do banco é JSONB: chega como objeto solto e sai daqui inteiro. */
function normalizarEstoque(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [tamanho, qtd] of Object.entries(v as Record<string, unknown>)) {
      if (!tamanho) continue;
      out[tamanho] = Math.max(0, Math.floor(Number(qtd) || 0));
    }
  }
  return out;
}

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
    const size = validSize(it?.size);
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

/**
 * Registro de pedido com preços recalculados no servidor.
 *
 * Fluxo legado, mantido para cadastros manuais: nenhuma tela do site o chama
 * hoje — o checkout do cliente passa inteiro pelo Mercado Pago
 * (`payments.functions` → `payments-core.server`). Como todo pedido, este
 * nasce em "Aguardando Aprovação" e não mexe em estoque.
 */
export const placeSecureOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId } = context;

    const ids = Array.from(new Set(data.items.map((i) => i.id)));
    const { data: rows, error: fetchErr } = await supabase
      .from("products")
      .select("id, name, price, image, sizes")
      .in("id", ids);

    if (fetchErr) throw new Error("Falha ao validar preços dos produtos.");
    if (!rows || rows.length !== ids.length) {
      throw new Error("Um ou mais produtos não foram encontrados.");
    }

    const priceMap = new Map<
      string,
      { name: string; price: number; image: string | null; sizes: Record<string, number> }
    >();
    for (const r of rows) {
      priceMap.set(r.id, {
        name: r.name,
        price: Number(r.price),
        image: r.image,
        sizes: normalizarEstoque((r as { sizes?: unknown }).sizes),
      });
    }

    /**
     * O tamanho pedido existe e tem peça?
     *
     * O carrinho vive no navegador: ele pode carregar um tamanho que a peça
     * deixou de ter (o admin trocou a grade, alguém levou a última) e, até
     * aqui, o pedido nascia assim mesmo — a recusa só aparecia lá na frente,
     * quando o pagamento aprovado tentava baixar o estoque e não conseguia. O
     * cliente pagava por um tamanho que não existe.
     *
     * Peça sem nenhum tamanho gravado passa: não há o que conferir, e barrar
     * seria impedir a venda de um cadastro antigo que ainda funciona.
     */
    for (const it of data.items) {
      const p = priceMap.get(it.id)!;
      const cadastrados = Object.keys(p.sizes);
      if (!cadastrados.length) continue;
      const disponivel = p.sizes[it.size] ?? 0;
      if (disponivel <= 0) {
        throw new Error(`${p.name}: o tamanho ${it.size} não está mais disponível.`);
      }
      if (disponivel < it.quantity) {
        throw new Error(
          `${p.name}: restam ${disponivel} no tamanho ${it.size}, menos do que o pedido.`,
        );
      }
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
      const coupon = AVAILABLE_COUPONS.find((c) => c.code.toUpperCase() === data.couponCode);
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
      data.paymentMethod === "pix" ? Math.round(netAfterCoupon * PIX_DISCOUNT_RATE * 100) / 100 : 0;
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
