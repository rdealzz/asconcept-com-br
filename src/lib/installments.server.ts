// Consulta as opções reais de parcelamento configuradas na conta Mercado Pago.
// Nunca usamos taxas fixas no código — tudo vem da API com a chave pública.

const MP_API = "https://api.mercadopago.com";

export type InstallmentOption = {
  installments: number;
  installmentAmount: number;
  totalAmount: number;
  interestFree: boolean;
};

type PayerCost = {
  installments: number;
  installment_rate: number;
  installment_amount: number;
  total_amount: number;
};

type CacheEntry = { at: number; value: InstallmentOption | null };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000;

/** Melhor parcelamento SEM JUROS disponível para o valor informado. */
export async function bestInterestFreeInstallment(
  amount: number,
): Promise<InstallmentOption | null> {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const key = amount.toFixed(2);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const publicKey = process.env["MP_PUBLIC_KEY"];
  if (!publicKey) return null;

  let value: InstallmentOption | null = null;
  try {
    const url = `${MP_API}/v1/payment_methods/installments?public_key=${encodeURIComponent(
      publicKey,
    )}&amount=${encodeURIComponent(key)}&locale=pt-BR`;
    const res = await fetch(url);
    if (res.ok) {
      const json = (await res.json()) as Array<{ payer_costs?: PayerCost[] }>;
      const costs = json.flatMap((m) => m.payer_costs ?? []);
      const free = costs
        .filter((c) => Number(c.installment_rate) === 0 && c.installments > 1)
        .sort((a, b) => b.installments - a.installments)[0];
      if (free) {
        value = {
          installments: free.installments,
          installmentAmount: Number(free.installment_amount),
          totalAmount: Number(free.total_amount),
          interestFree: true,
        };
      }
    } else {
      console.error("[mp] installments failed", res.status);
    }
  } catch (e) {
    console.error("[mp] installments error", e);
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}
