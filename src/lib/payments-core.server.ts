// Lógica server-only do checkout Mercado Pago.
import { AVAILABLE_COUPONS, calcDiscount } from "@/lib/coupons";
import { pixExpirationDate } from "@/lib/mercadopago";
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
import { MANUAL_SALE_STATUS } from "@/lib/types";

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
  mp_status: string | null;
  coupon_code: string | null;
  items: unknown;
};

// Etapas que só existem depois do pagamento confirmado. "Finalizado" entra
// aqui porque a venda de balcão é registrada depois de o dinheiro ter entrado:
// oferecer cobrança para ela seria cobrar duas vezes pela mesma peça.
const PAID_STATUSES = new Set(["Preparando pedido", "Em trânsito", "Entregue", MANUAL_SALE_STATUS]);

/**
 * Um pedido está pago quando já avançou no fluxo do ateliê, quando é venda de
 * balcão já registrada, ou quando está em "Aguardando Aprovação" com um
 * pagamento aprovado no Mercado Pago (só o "Aguardando Aprovação" seco, sem
 * pagamento, não conta).
 */
function isOrderPaid(order: { status: string; mp_status: string | null }): boolean {
  if (PAID_STATUSES.has(order.status)) return true;
  return order.status === "Aguardando Aprovação" && order.mp_status === "approved";
}

async function loadOwnOrder(
  supabase: AnySupabase,
  orderNumber: string,
  userId: string,
): Promise<OrderRow> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_number, total, status, user_id, customer_email, customer_name, mp_payment_id, mp_status, coupon_code, items",
    )

    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error || !data) throw new Error("Pedido não encontrado.");
  const row = data as OrderRow;
  if (row.user_id !== userId) throw new Error("Pedido não pertence a este usuário.");
  return row;
}

/**
 * O pedido ainda pode ser cobrado?
 *
 * Entre gravar o pedido pendente e a cobrança sair passa tempo — o cliente
 * digita o cartão, ou olha o QR do Pix por quinze minutos — e nesse intervalo
 * outra pessoa pode ter levado a última peça. Cobrar sem reconferir é vender o
 * que não existe, e depois da aprovação não há como voltar atrás: a baixa
 * grampeia em zero e o pedido segue de pé.
 *
 * Devolve a mensagem pronta para a tela, ou `null` quando dá para cobrar.
 */
async function conferirAntesDeCobrar(
  supabase: AnySupabase,
  order: OrderRow,
): Promise<string | null> {
  const { conferirEstoque, itensDoPedido } = await import("@/lib/stock.server");
  const itens = itensDoPedido(order.items);
  if (!itens.length) return null;
  return conferirEstoque(supabase, itens);
}

async function notificationUrl(): Promise<string> {
  try {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    return `${getRequestUrl().origin}/api/public/payments/mercadopago`;
  } catch {
    return "";
  }
}

export async function persistPayment(
  orderNumber: string,
  payment: { id: number | string; status: string; installments?: number | null },
  status: string,
) {
  // O gatilho de "pagamento aprovado" depende do status do Mercado Pago, e não
  // do nome do status interno — assim a renomeação das etapas do ateliê não
  // afeta baixa de estoque nem envio de e-mail.
  const approved = payment.status === "approved";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // O Mercado Pago reenvia a mesma notificação várias vezes. Se o admin já
  // avançou o pedido no painel, reescrever o status aqui rebobinaria o fluxo —
  // um pedido "Em trânsito" voltaria para "Aguardando Aprovação" a cada
  // reenvio. Só mexemos no status enquanto o pedido não entrou no ateliê.
  const { data: atual } = await supabaseAdmin
    .from("orders")
    .select("status")
    .eq("order_number", orderNumber)
    .maybeSingle();
  const statusAtual = (atual as { status?: string } | null)?.status;
  const jaNoAtelie =
    statusAtual === "Preparando pedido" ||
    statusAtual === "Em trânsito" ||
    statusAtual === "Entregue" ||
    // Venda de balcão: fechada de nascença, e nenhuma notificação de pagamento
    // tem o direito de reabri-la.
    statusAtual === MANUAL_SALE_STATUS;

  const patch: Record<string, unknown> = {
    mp_payment_id: String(payment.id),
    mp_status: payment.status,
    installments: payment.installments ?? null,
    updated_at: new Date().toISOString(),
  };
  if (!jaNoAtelie) patch.status = status;

  await supabaseAdmin
    .from("orders")
    .update(patch as never)
    .eq("order_number", orderNumber);

  if (approved) {
    const { data: row } = await supabaseAdmin
      .from("orders")
      .select(
        "stock_decremented, customer_email, customer_name, total, items, mail_sent, preparation_mail_sent, user_id",
      )
      .eq("order_number", orderNumber)
      .maybeSingle();
    // `!row` também entra: quando a leitura acima falha, o que se sabe do
    // pedido é nada — e o lado seguro de "não sei se já baixou" é chamar a
    // rotina, que é idempotente pelo próprio `stock_decremented`. Pular a
    // baixa por causa de uma leitura que não voltou deixaria a peça à venda
    // depois de vendida, que é o pior dos dois erros.
    if (!row || !(row as { stock_decremented: boolean }).stock_decremented) {
      // Atenção: .rpc() não lança quando o Postgres recusa — devolve { error }.
      // Ignorar esse retorno foi o que deixou a baixa de estoque falhar em
      // silêncio. O erro não pode derrubar o pagamento (que já foi aprovado),
      // mas precisa aparecer no log com o número do pedido para ser corrigido.
      try {
        const { error: stockError } = (await (
          supabaseAdmin.rpc as unknown as (
            n: string,
            a: Record<string, unknown>,
          ) => Promise<{ error: unknown }>
        )("consume_order_stock", { _order_number: orderNumber })) ?? { error: null };
        if (stockError) {
          console.error(
            `[mp] consume_order_stock recusado para o pedido ${orderNumber} — estoque NÃO baixou`,
            stockError,
          );
        }
      } catch (e) {
        console.error(`[mp] consume_order_stock falhou para o pedido ${orderNumber}`, e);
      }
    }

    // Comprou sem cadastro? A conta anônima vira conta de verdade agora, com o
    // e-mail do checkout — e o pedido, que já está amarrado nela, aparece no
    // histórico assim que a pessoa definir a senha.
    if (row) {
      const dono = row as {
        user_id?: string | null;
        customer_email?: string;
        customer_name?: string | null;
      };
      await promoverConvidado(supabaseAdmin, {
        user_id: dono.user_id ?? null,
        customer_email: dono.customer_email ?? null,
        customer_name: dono.customer_name ?? null,
      });
    }

    // Dispara o e-mail de "pedido confirmado" uma única vez por pedido.
    // Evita reenvio caso a webhook do Mercado Pago confirme o mesmo
    // pagamento novamente depois (é comum receber a notificação mais de
    // uma vez).
    const mailRow = row as {
      customer_email?: string;
      customer_name?: string | null;
      total?: number | string;
      items?: unknown;
      mail_sent?: boolean;
      preparation_mail_sent?: boolean;
    } | null;
    if (mailRow && !mailRow.mail_sent && mailRow.customer_email) {
      try {
        const { enqueueOrderEmail } = await import("@/lib/order-email.server");
        await enqueueOrderEmail(supabaseAdmin, "pedido-confirmado", mailRow.customer_email, {
          orderNumber,
          customerName: mailRow.customer_name ?? undefined,
          total: Number(mailRow.total ?? 0),
          items: Array.isArray(mailRow.items) ? mailRow.items : [],
        });
        await supabaseAdmin
          .from("orders")
          .update({ mail_sent: true } as never)
          .eq("order_number", orderNumber);
      } catch (e) {
        console.error("[mail] falha ao enviar e-mail de pedido confirmado", e);
      }
    }
  }
}

/**
 * O convidado vira cliente.
 *
 * Quem comprou sem cadastro está numa sessão anônima do Supabase Auth: usuário
 * de verdade, com id e JWT, mas sem e-mail e sem senha. O pedido já nasceu
 * amarrado nesse id — então basta pôr o e-mail que a pessoa digitou no checkout
 * para a conta virar permanente, com o histórico inteiro dentro dela.
 *
 * Roda uma vez, no momento em que o pagamento é aprovado, e serve aos dois
 * caminhos: o cartão (que aprova na hora) e o Pix (que aprova pela notificação
 * do Mercado Pago, quando o navegador do cliente já pode ter ido embora).
 *
 * Nada aqui pode derrubar o pagamento — ele já foi aprovado, e o dinheiro
 * entrou. Toda falha é registrada e engolida: no pior caso a pessoa fica sem
 * conta e com o pedido em pé, que é o estado de antes desta funcionalidade.
 *
 * A senha não é definida aqui, e isso é de propósito: senha gerada pelo
 * servidor viaja por e-mail, e e-mail não é lugar de senha. A conta nasce sem
 * senha e a pessoa define a dela pelo "esqueci minha senha" — o convite para
 * isso está na tela de pedido concluído.
 */
async function promoverConvidado(
  admin: AnySupabase,
  pedido: { user_id: string | null; customer_email: string | null; customer_name: string | null },
): Promise<void> {
  if (!pedido.user_id || !pedido.customer_email) return;

  try {
    const { data, error } = await admin.auth.admin.getUserById(pedido.user_id);
    if (error || !data?.user) return;

    const usuario = data.user as { email?: string | null; is_anonymous?: boolean };
    // Conta de verdade não se mexe: quem já tinha login comprou logado.
    if (usuario.is_anonymous !== true && usuario.email) return;

    const nome = pedido.customer_name?.trim() || undefined;
    const { error: erroPromocao } = await admin.auth.admin.updateUserById(pedido.user_id, {
      email: pedido.customer_email,
      // Sem isto o Supabase manda um e-mail de confirmação e só grava o
      // endereço depois do clique — e a conta ficaria pela metade justamente
      // para quem não quis se cadastrar.
      email_confirm: true,
      ...(nome ? { user_metadata: { name: nome, full_name: nome } } : {}),
    });

    if (erroPromocao) {
      // O caso comum não é falha: é o e-mail já pertencer a uma conta. Quem
      // comprou como convidado usando o e-mail que já tem cadastro continua com
      // o pedido em pé — ele só não entra no histórico daquela conta, porque
      // amarrar pedido a uma conta que ninguém provou ser sua seria entregar o
      // endereço de quem comprou para quem tem o e-mail.
      console.error(
        `[auth] não foi possível promover a conta de convidado do pedido — segue sem conta`,
        erroPromocao,
      );
    }
  } catch (e) {
    console.error("[auth] promoção de convidado falhou", e);
  }
}

/** Recalcula preços/frete/cupom no servidor e grava o pedido pendente. */
export async function createPendingOrderCore(
  supabase: AnySupabase,
  userId: string,
  data: PendingOrderInput,
): Promise<PendingOrderResult> {
  const ids = Array.from(new Set(data.items.map((i) => i.id)));
  // `sizes` entra no mesmo SELECT que já buscava o preço: a conferência de
  // estoque não custa uma segunda ida ao banco.
  const { data: rows, error: fetchErr } = await supabase
    .from("products")
    .select("id, name, price, image, sizes")
    .in("id", ids);
  if (fetchErr) return { error: "Falha ao validar preços dos produtos." };
  if (!rows || rows.length !== ids.length) {
    return { error: "Um ou mais produtos não foram encontrados." };
  }

  /**
   * O tamanho pedido existe e tem peça?
   *
   * Esta é a porta de entrada do checkout do site, e até aqui ela não conferia
   * nada: o carrinho vive no navegador, pode carregar um tamanho que a peça
   * deixou de ter (o admin trocou a grade, alguém levou a última) e o pedido
   * nascia assim mesmo. O cliente pagava, e a recusa só aparecia lá na frente,
   * quando o pagamento aprovado tentava baixar estoque que não existia — em
   * silêncio, num log de servidor.
   */
  const { conferirComPecas } = await import("@/lib/stock.server");
  const semEstoque = conferirComPecas(
    data.items.map((i) => ({ id: i.id, size: i.size, quantity: i.quantity })),
    rows as { id: string; name: string; sizes?: unknown }[],
  );
  if (semEstoque) return { error: semEstoque };

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

  const address = {
    cep: data.customer.cep,
    logradouro: data.customer.logradouro,
    numero: data.customer.numero,
    complemento: data.customer.complemento,
    bairro: data.customer.bairro,
    cidade: data.customer.cidade,
    uf: data.customer.uf,
  };

  // Reserva o cupom antes de gravar o pedido (UNIQUE (user_id, code) evita
  // corrida). O vínculo com o pedido é acertado depois, quando o número final
  // já é conhecido — ele pode mudar se houver colisão na gravação.
  if (acceptedCoupon) {
    const { claimCouponUse } = await import("@/lib/coupon-uses.server");
    const claimed = await claimCouponUse(userId, acceptedCoupon, null);
    if (!claimed) {
      return { error: "Este cupom já foi utilizado. Remova o cupom para continuar." };
    }
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { gravarComNumeroUnico } = await import("@/lib/order-number.server");

  const gravacao = await gravarComNumeroUnico(async (orderNumber) => {
    const { error } = await supabaseAdmin.from("orders").insert({
      order_number: orderNumber,
      user_id: userId,
      customer_email: data.customer.email.trim().toLowerCase(),
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
    return error;
  });

  if (!gravacao.ok) {
    console.error("[mp] insert pending order failed:", gravacao.erro);
    if (acceptedCoupon) {
      const { releaseCouponUse } = await import("@/lib/coupon-uses.server");
      await releaseCouponUse(userId, acceptedCoupon);
    }
    return { error: "Não foi possível registrar o pedido." };
  }

  const { orderNumber } = gravacao;

  if (acceptedCoupon) {
    const { attachCouponOrder } = await import("@/lib/coupon-uses.server");
    await attachCouponOrder(userId, acceptedCoupon, orderNumber);
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
  if (isOrderPaid(order)) {
    return { orderNumber: order.order_number, status: order.status, approved: true };
  }

  const indisponivel = await conferirAntesDeCobrar(supabase, order);
  if (indisponivel) {
    return {
      orderNumber: order.order_number,
      status: order.status,
      approved: false,
      message: indisponivel,
    };
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
    // Garante que o cupom fique registrado como consumido (caso tenha sido
    // liberado por uma tentativa recusada anterior deste mesmo pedido).
    if (order.coupon_code) {
      const { claimCouponUse } = await import("@/lib/coupon-uses.server");
      await claimCouponUse(userId, order.coupon_code, order.order_number);
    }
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

  // Pagamento recusado: devolve o cupom para o cliente poder tentar de novo.
  if (order.coupon_code) {
    const { releaseCouponUse } = await import("@/lib/coupon-uses.server");
    await releaseCouponUse(userId, order.coupon_code);
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

  // A cobrança Pix vale quinze minutos: é a janela mais longa do checkout, e a
  // que mais tem chance de a peça ter ido embora no meio.
  const indisponivel = await conferirAntesDeCobrar(supabase, order);
  if (indisponivel) return { error: indisponivel };

  const [firstName, ...rest] = (order.customer_name ?? "").split(" ");
  const body: Record<string, unknown> = {
    transaction_amount: Number(order.total),
    description: `A&S Conccept · Pedido ${order.order_number}`,
    payment_method_id: "pix",
    external_reference: order.order_number,
    // Sem isto a cobrança vale 24h e o contador da tela vira ficção.
    date_of_expiration: pixExpirationDate(),
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
    // A janela de 15 minutos é uma escolha da loja, não um requisito do
    // pagamento. Se a conta do Mercado Pago recusar esse prazo, vale mais uma
    // cobrança com a validade padrão do que um Pix que não nasce — a única
    // forma de pagar sem cartão ficaria fora do ar.
    const msg = e instanceof Error ? e.message : "";
    if (/expiration/i.test(msg)) {
      console.warn("[mp] pix: prazo de expiração recusado, refazendo com o padrão", msg);
      delete body.date_of_expiration;
      try {
        payment = await mpCreatePayment(body, `${order.order_number}-pix-sem-prazo`);
      } catch (e2) {
        console.error("[mp] pix error", e2);
        return { error: e2 instanceof Error ? e2.message : "Falha ao gerar cobrança Pix." };
      }
    } else {
      console.error("[mp] pix error", e);
      return { error: msg || "Falha ao gerar cobrança Pix." };
    }
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
  if (isOrderPaid(order)) {
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
