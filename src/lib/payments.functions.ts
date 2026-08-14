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

/**
 * Sobre o tamanho da janela, que é uma decisão de negócio e não só de segurança.
 *
 * A primeira versão usava janelas de 10 minutos. O teto era generoso, mas a
 * ESPERA não: quem esbarrasse no limite no primeiro minuto ficava trancado por
 * nove — no meio de um checkout, com o cartão na mão. Isso é o tipo de atrito
 * que faz cliente desistir da compra, e o dono já apontou, com razão, que numa
 * boutique isso custa mais caro do que parece.
 *
 * A janela ficou menor com o teto quase igual. Para quem ataca não muda nada
 * relevante: teste de cartão roubado precisa de centenas de tentativas por
 * hora para valer a pena, e tanto 60 quanto 96 por hora já tornam o alvo ruim.
 * Para quem está comprando muda bastante — o pior caso de espera cai de nove
 * minutos para menos de cinco.
 */

/** Cartão é o mais sensível: é por aqui que se testa cartão roubado. */
const LIMITE_CARTAO = { limite: 8, janelaMs: 5 * 60_000 };

/** Cada Pix é uma cobrança de verdade criada no Mercado Pago. */
const LIMITE_PIX = { limite: 10, janelaMs: 5 * 60_000 };

/** Cada pendente é uma linha em `orders` — sem teto, a tabela vira depósito. */
const LIMITE_PEDIDO = { limite: 15, janelaMs: 5 * 60_000 };

/**
 * Consulta de status: a tela do Pix faz polling enquanto o cliente paga, então
 * o teto é alto de propósito — apertar aqui quebraria o contador da tela.
 */
const LIMITE_STATUS = { limite: 120, janelaMs: 60_000 };

/**
 * Tetos do convidado, por IP.
 *
 * O teto por conta é bom porque trocar de balde custa criar outra conta e
 * confirmar outro e-mail. Para quem compra sem cadastro esse custo é zero: uma
 * sessão anônima nova é um balde novo, e o freio some justamente onde ele
 * importa — pedido gravado e cobrança criada no Mercado Pago.
 *
 * Então o convidado leva os dois freios: o dele, por sessão, e mais um por IP,
 * que é o que sobra de identificável quando não há conta. Os números são
 * menores que os do cliente logado de propósito — quem tem conta já pagou um
 * pedágio para chegar aqui.
 */
const LIMITE_CONVIDADO_PEDIDO = { limite: 10, janelaMs: 5 * 60_000 };
const LIMITE_CONVIDADO_PIX = { limite: 6, janelaMs: 5 * 60_000 };
const LIMITE_CONVIDADO_CARTAO = { limite: 6, janelaMs: 5 * 60_000 };

/**
 * Aplica o teto por IP quando quem chama é convidado.
 *
 * `is_anonymous` vem do próprio JWT, conferido pelo middleware — não é campo
 * que o cliente escolha. Sessão de cliente cadastrado passa direto.
 */
async function freioDeConvidado(
  claims: Record<string, unknown> | undefined,
  acao: string,
  regra: { limite: number; janelaMs: number },
): Promise<void> {
  if (claims?.is_anonymous !== true) return;
  const { exigirLimitePorIp } = await import("@/lib/rate-limit.server");
  await exigirLimitePorIp(`convidado-${acao}`, regra);
}

export const createPendingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validPendingInput)
  .handler(async ({ data, context }): Promise<PendingOrderResult> => {
    const { exigirLimitePorUsuario } = await import("@/lib/rate-limit.server");
    exigirLimitePorUsuario("pedido-pendente", context.userId, LIMITE_PEDIDO);
    await freioDeConvidado(context.claims, "pedido", LIMITE_CONVIDADO_PEDIDO);

    const { createPendingOrderCore } = await import("@/lib/payments-core.server");
    return createPendingOrderCore(context.supabase, context.userId, data);
  });

export const payWithCardToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validCardInput)
  .handler(async ({ data, context }): Promise<CardResult> => {
    const { exigirLimitePorUsuario } = await import("@/lib/rate-limit.server");
    exigirLimitePorUsuario("cartao", context.userId, LIMITE_CARTAO);
    await freioDeConvidado(context.claims, "cartao", LIMITE_CONVIDADO_CARTAO);

    const { payWithCardCore } = await import("@/lib/payments-core.server");
    return payWithCardCore(context.supabase, context.userId, data);
  });

export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validPixInput)
  .handler(async ({ data, context }): Promise<PixResult> => {
    const { exigirLimitePorUsuario } = await import("@/lib/rate-limit.server");
    exigirLimitePorUsuario("pix", context.userId, LIMITE_PIX);
    await freioDeConvidado(context.claims, "pix", LIMITE_CONVIDADO_PIX);

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
