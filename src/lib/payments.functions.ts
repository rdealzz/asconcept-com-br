import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  validCardInput,
  validOrderNumber,
  validPendingInput,
  validPixInput,
} from "@/lib/payments-validators";
import type { CardResult, PendingOrderResult, PixResult } from "@/lib/payments-core.server";

export const createPendingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validPendingInput)
  .handler(async ({ data, context }): Promise<PendingOrderResult> => {
    const { createPendingOrderCore } = await import("@/lib/payments-core.server");
    return createPendingOrderCore(context.supabase, context.userId, data);
  });

export const payWithCardToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validCardInput)
  .handler(async ({ data, context }): Promise<CardResult> => {
    const { payWithCardCore } = await import("@/lib/payments-core.server");
    return payWithCardCore(context.supabase, context.userId, data);
  });

export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validPixInput)
  .handler(async ({ data, context }): Promise<PixResult> => {
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
      const { paymentStatusCore } = await import("@/lib/payments-core.server");
      return paymentStatusCore(context.supabase, context.userId, data.orderNumber);
    },
  );

export const getMpPublicKey = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publicKey: string | null }> => ({
    publicKey: process.env.MP_PUBLIC_KEY ?? null,
  }),
);
