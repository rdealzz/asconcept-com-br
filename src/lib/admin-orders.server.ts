import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueOrderEmail, type OrderEmailKind } from "@/lib/order-email.server";
import {
  FLOW_STATUSES,
  isManualSaleStatus,
  isPrePaymentStatus,
  type OrderStatus,
} from "@/lib/types";

type AdminStatusInput = {
  orderNumber: string;
  status: OrderStatus;
  trackingCode?: string;
};

type OrderRow = {
  order_number: string;
  status: string;
  customer_email: string;
  customer_name: string | null;
  tracking_code: string | null;
  total: number | string | null;
  items: unknown;
  stock_decremented: boolean | null;
  mail_sent: boolean | null;
  preparation_mail_sent: boolean;
  shipped_mail_sent: boolean;
  delivered_mail_sent: boolean;
};

const emailForStatus: Partial<Record<OrderStatus, { kind: OrderEmailKind; flag: keyof OrderRow }>> =
  {
    "Preparando pedido": { kind: "pedido-em-preparacao", flag: "preparation_mail_sent" },
    "Em trânsito": { kind: "pedido-enviado", flag: "shipped_mail_sent" },
    Entregue: { kind: "pedido-entregue", flag: "delivered_mail_sent" },
  };

/** Sequência obrigatória do fluxo do ateliê. */
const STATUS_FLOW: OrderStatus[] = [...FLOW_STATUSES];

/**
 * Baixa o estoque do pedido, uma única vez.
 *
 * O ponto único de baixa é a entrada em "Preparando pedido": é aí que o pedido
 * deixa de ser uma intenção e vira peça reservada. Pedidos pagos por Pix/cartão
 * já chegam com `stock_decremented = true` (a baixa aconteceu na confirmação do
 * pagamento); pedidos manuais, que o admin aprova depois de confirmar o
 * pagamento na mão, baixam aqui. A própria função no Postgres é idempotente e
 * trava o pedido com FOR UPDATE, então chamar duas vezes não tira em dobro.
 */
async function consumeStockOnce(supabaseAdmin: SupabaseClient, orderNumber: string) {
  try {
    const { error } = ((await (
      supabaseAdmin.rpc as unknown as (
        n: string,
        a: Record<string, unknown>,
      ) => Promise<{ error: unknown }>
    )("consume_order_stock", { _order_number: orderNumber })) ?? { error: null }) as {
      error: unknown;
    };
    if (error) {
      console.error(
        `[admin] consume_order_stock recusado para o pedido ${orderNumber} — estoque NÃO baixou`,
        error,
      );
    }
  } catch (e) {
    console.error(`[admin] consume_order_stock falhou para o pedido ${orderNumber}`, e);
  }
}

export async function updateAdminOrderStatusCore(
  supabaseAdmin: SupabaseClient,
  input: AdminStatusInput,
) {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "order_number, status, customer_email, customer_name, tracking_code, total, items, stock_decremented, mail_sent, preparation_mail_sent, shipped_mail_sent, delivered_mail_sent",
    )
    .eq("order_number", input.orderNumber)
    .maybeSingle();
  if (error || !data) throw new Error("Pedido não encontrado.");
  const order = data as OrderRow;

  const nextIndex = STATUS_FLOW.indexOf(input.status);
  if (nextIndex === -1) throw new Error("Status inválido.");

  // Venda de balcão: nasceu fechada, com o estoque já baixado. Não há etapa
  // seguinte nem anterior — e deixá-la voltar para "Aguardando Aprovação"
  // abriria caminho para uma segunda baixa do mesmo pedido.
  if (isManualSaleStatus(order.status)) {
    throw new Error("Este pedido foi registrado como venda concluída e não avança no fluxo.");
  }

  // Pedido ainda não pago (checkout abandonado, cartão recusado): a única saída
  // é o admin confirmar o pagamento na mão, o que o traz para a fila de
  // aprovação. Pular direto para "Preparando pedido" daqui reservaria peça de
  // um pedido que ninguém pagou.
  const prePayment = isPrePaymentStatus(order.status);
  if (prePayment && input.status !== "Aguardando Aprovação") {
    throw new Error(
      "Este pedido ainda não foi pago. Confirme o pagamento primeiro — ele entra na fila de aprovação.",
    );
  }

  // Fora isso: mantém o status atual ou avança exatamente uma etapa.
  const currentIndex = STATUS_FLOW.indexOf(order.status as OrderStatus);
  if (
    !prePayment &&
    currentIndex !== -1 &&
    nextIndex !== currentIndex &&
    nextIndex !== currentIndex + 1
  ) {
    throw new Error(
      nextIndex < currentIndex
        ? "Não é possível retroceder o status do pedido."
        : `Avance uma etapa por vez: o próximo status é "${STATUS_FLOW[currentIndex + 1]}".`,
    );
  }

  const trackingCode = input.trackingCode?.trim().toUpperCase() || order.tracking_code;

  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({
      status: input.status,
      tracking_code: trackingCode || null,
      updated_at: new Date().toISOString(),
    })
    .eq("order_number", input.orderNumber);
  if (updateError) throw new Error("Não foi possível atualizar o pedido.");

  // Aprovação do pedido: é aqui, e só aqui pelo painel, que a peça sai do estoque.
  if (input.status === "Preparando pedido" && order.stock_decremented !== true) {
    await consumeStockOnce(supabaseAdmin, order.order_number);
  }

  // Pagamento confirmado na mão: o cliente recebe o mesmo "pedido confirmado"
  // que o pagamento online dispara, uma única vez.
  if (prePayment && input.status === "Aguardando Aprovação" && order.mail_sent !== true) {
    try {
      await enqueueOrderEmail(supabaseAdmin, "pedido-confirmado", order.customer_email, {
        orderNumber: order.order_number,
        customerName: order.customer_name ?? undefined,
        total: Number(order.total ?? 0),
        items: Array.isArray(order.items) ? order.items : [],
      });
      await supabaseAdmin
        .from("orders")
        .update({ mail_sent: true })
        .eq("order_number", input.orderNumber);
    } catch (e) {
      console.error("[admin] falha ao enviar e-mail de pedido confirmado", e);
    }
  }

  const email = emailForStatus[input.status];
  let emailQueued = false;
  if (email && order[email.flag] !== true) {
    await enqueueOrderEmail(supabaseAdmin, email.kind, order.customer_email, {
      orderNumber: order.order_number,
      customerName: order.customer_name ?? undefined,
      trackingCode: trackingCode ?? undefined,
    });
    const { error: flagError } = await supabaseAdmin
      .from("orders")
      .update({ [email.flag]: true })
      .eq("order_number", input.orderNumber);
    if (flagError)
      throw new Error("O e-mail foi enfileirado, mas seu registro não pôde ser atualizado.");
    emailQueued = true;
  }

  return { ok: true, emailQueued, trackingCode: trackingCode ?? undefined };
}
