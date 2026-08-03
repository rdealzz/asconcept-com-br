import { createServerFn } from "@tanstack/react-start";

export const getInstallments = createServerFn({ method: "GET" })
  .inputValidator((input: { amount: number }) => ({
    amount: Math.max(0, Math.round(Number(input.amount) * 100) / 100),
  }))
  .handler(async ({ data }) => {
    const { bestInterestFreeInstallment } = await import("@/lib/installments.server");
    return { option: await bestInterestFreeInstallment(data.amount) };
  });
