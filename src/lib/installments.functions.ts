import { createServerFn } from "@tanstack/react-start";

/**
 * Este endpoint não exige login e, a cada valor NOVO, dispara três chamadas à
 * API do Mercado Pago. O teto contra isso vive em `installments.server.ts`, e
 * de propósito: lá dentro dá para distinguir a consulta que custa (cache miss)
 * da que não custa, e só a primeira precisa ser limitada. Limitar aqui, na
 * entrada, penalizaria junto o cliente no 4G — vários deles dividem um mesmo
 * IP público por causa do CGNAT das operadoras.
 */
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
