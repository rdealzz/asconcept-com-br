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

type CacheEntry = { at: number; value: InstallmentOption[] };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000;

/**
 * Todas as opções de parcelamento (sem e com juros) para o valor informado,
 * exatamente como a conta do Mercado Pago está configurada.
 */
export async function installmentOptions(amount: number): Promise<InstallmentOption[]> {
  if (!Number.isFinite(amount) || amount <= 0) return [];
  const key = amount.toFixed(2);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const publicKey = process.env["MP_PUBLIC_KEY"];
  if (!publicKey) return [];

  let value: InstallmentOption[] = [];
  try {
    // A API exige payment_method_id (ou bin). Consultamos as bandeiras mais
    // comuns e consolidamos a melhor condição por número de parcelas.
    const brands = ["visa", "master", "elo"];
    const costs: PayerCost[] = [];
    for (const brand of brands) {
      const url = `${MP_API}/v1/payment_methods/installments?public_key=${encodeURIComponent(
        publicKey,
      )}&amount=${encodeURIComponent(key)}&payment_method_id=${brand}&locale=pt-BR`;
      const res = await fetch(url);
      if (res.ok) {
        const json = (await res.json()) as Array<{ payer_costs?: PayerCost[] }>;
        costs.push(...json.flatMap((m) => m.payer_costs ?? []));
      } else {
        console.error("[mp] installments failed", brand, res.status);
      }
    }
    // Para cada quantidade de parcelas mantemos a condição mais barata.
    const byInstallments = new Map<number, PayerCost>();
    for (const c of costs) {
      const prev = byInstallments.get(c.installments);
      if (!prev || Number(c.total_amount) < Number(prev.total_amount)) {
        byInstallments.set(c.installments, c);
      }
    }
    value = [...byInstallments.values()]
      .sort((a, b) => a.installments - b.installments)
      .map((c) => ({
        installments: c.installments,
        installmentAmount: Number(c.installment_amount),
        totalAmount: Number(c.total_amount),
        interestFree: Number(c.installment_rate) === 0,
      }));
  } catch (e) {
    console.error("[mp] installments error", e);
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Melhor parcelamento SEM JUROS disponível para o valor informado. */
export async function bestInterestFreeInstallment(
  amount: number,
): Promise<InstallmentOption | null> {
  const options = await installmentOptions(amount);
  const free = options.filter((o) => o.interestFree && o.installments > 1);
  return free.length ? free[free.length - 1]! : null;
}

