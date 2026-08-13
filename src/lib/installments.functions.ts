import { createServerFn } from "@tanstack/react-start";

/**
 * Teto por IP.
 *
 * Este endpoint não exige login e, a cada valor novo, dispara TRÊS chamadas à
 * API do Mercado Pago (visa, master, elo). Sem teto, um laço de uma linha vira
 * amplificador: mil pedidos nossos viram três mil lá, e a cota da conta é
 * queimada por um estranho.
 *
 * O número é folgado de propósito. A vitrine mostra o parcelamento em cada
 * cartão de peça (`Showroom`), então uma visita legítima à home já faz uma
 * dezena de chamadas de valores distintos — o limite precisa caber isso sem
 * encostar. Um laço de abuso faz milhares por minuto e bate no teto na hora.
 */
const LIMITE_PARCELAS = { limite: 120, janelaMs: 60_000 };

export const getInstallments = createServerFn({ method: "GET" })
  .inputValidator((input: { amount: number }) => ({
    amount: Math.max(0, Math.round(Number(input.amount) * 100) / 100),
  }))
  .handler(async ({ data }) => {
    const { exigirLimitePorIp } = await import("@/lib/rate-limit.server");
    await exigirLimitePorIp("parcelas", LIMITE_PARCELAS);

    const { installmentOptions } = await import("@/lib/installments.server");
    const options = await installmentOptions(data.amount);
    const free = options.filter((o) => o.interestFree && o.installments > 1);
    return {
      options,
      option: free.length ? free[free.length - 1]! : null,
    };
  });
