import { createServerFn } from "@tanstack/react-start";

export const getInstallments = createServerFn({ method: "GET" })
  .inputValidator((input: { amount: number }) => ({
    amount: Math.max(0, Math.round(Number(input.amount) * 100) / 100),
  }))
  .handler(async ({ data }) => {
    const { installmentOptions } = await import("@/lib/installments.server");
    const options = await installmentOptions(data.amount);
    const free = options.filter((o) => o.interestFree && o.installments > 1);
    return {
      options,
      option: free.length ? free[free.length - 1]! : null,
    };
  });
