import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  validCardInput,
  validOrderNumber,
  validPendingInput,
  validPixInput,
} from "@/lib/payments-validators";
import type { CardResult, PendingOrderResult, PixResult } from "@/lib/payments-core.server";

/**
 * Tetos por conta autenticada.
 *
 * A conta é a chave certa aqui: o middleware já conferiu o JWT, então mudar de
 * balde custa criar outra conta e confirmar outro e-mail — que é exatamente o
 * atrito que se quer contra um laço.
 *
 * Os números saem do uso honesto. Ninguém fecha oito pedidos em dez minutos,
 * nem digita dez cartões seguidos; quem faz isso está sondando.
 */

/** Cartão é o mais sensível: é por aqui que se testa cartão roubado. */
const LIMITE_CARTAO = { limite: 10, janelaMs: 10 * 60_000 };

/** Cada Pix é uma cobrança de verdade criada no Mercado Pago. */
const LIMITE_PIX = { limite: 15, janelaMs: 10 * 60_000 };

/** Cada pendente é uma linha em `orders` — sem teto, a tabela vira depósito. */
const LIMITE_PEDIDO = { limite: 20, janelaMs: 10 * 60_000 };

/**
 * Consulta de status: a tela do Pix faz polling enquanto o cliente paga, então
 * o teto é alto de propósito — apertar aqui quebraria o contador da tela.
 */
const LIMITE_STATUS = { limite: 120, janelaMs: 60_000 };

export const createPendingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validPendingInput)
  .handler(async ({ data, context }): Promise<PendingOrderResult> => {
    const { exigirLimitePorUsuario } = await import("@/lib/rate-limit.server");
    exigirLimitePorUsuario("pedido-pendente", context.userId, LIMITE_PEDIDO);

    const { createPendingOrderCore } = await import("@/lib/payments-core.server");
    return createPendingOrderCore(context.supabase, context.userId, data);
  });

export const payWithCardToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validCardInput)
  .handler(async ({ data, context }): Promise<CardResult> => {
    const { exigirLimitePorUsuario } = await import("@/lib/rate-limit.server");
    exigirLimitePorUsuario("cartao", context.userId, LIMITE_CARTAO);

    const { payWithCardCore } = await import("@/lib/payments-core.server");
    return payWithCardCore(context.supabase, context.userId, data);
  });

export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validPixInput)
  .handler(async ({ data, context }): Promise<PixResult> => {
    const { exigirLimitePorUsuario } = await import("@/lib/rate-limit.server");
    exigirLimitePorUsuario("pix", context.userId, LIMITE_PIX);

    const { createPixCore } = await import("@/lib/payments-core.server");
    return createPixCore(context.supabase, context.userId, data);
  });

export const getPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ({
    orderNumber: validOrderNumber((raw as { orderNumber?: string })?.orderNumber),
  }))
  .handler(
    async ({ data, context }): Promise<{ orderNumber: string; status: string; paid: boolean }> => {
      const { exigirLimitePorUsuario } = await import("@/lib/rate-limit.server");
      exigirLimitePorUsuario("status-pagamento", context.userId, LIMITE_STATUS);

      const { paymentStatusCore } = await import("@/lib/payments-core.server");
      return paymentStatusCore(context.supabase, context.userId, data.orderNumber);
    },
  );

export const getMpPublicKey = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publicKey: string | null }> => ({
    publicKey: process.env.MP_PUBLIC_KEY ?? null,
  }),
);
