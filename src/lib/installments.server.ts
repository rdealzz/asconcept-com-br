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
 * Teto de valores distintos guardados.
 *
 * Este cache é endereçado pelo VALOR do pedido, e quem escolhe o valor é quem
 * chama — `getInstallments` não exige login. Sem teto, um laço pedindo 1.01,
 * 1.02, 1.03… cria uma entrada nova a cada chamada e nada nunca saía do
 * `Map`: o TTL só era conferido na leitura da mesma chave, então valor que
 * não se repete fica para sempre. Isso é memória crescendo até o processo
 * morrer, disparada de fora, sem autenticação.
 *
 * Mil entradas cobrem com folga os valores reais de uma loja (o carrinho não
 * assume mil totais diferentes ao mesmo tempo) e o custo de memória é
 * desprezível.
 */
const MAX_ENTRADAS = 1000;

/**
 * Tira o que expirou e, se ainda estourar o teto, os mais antigos — o `Map`
 * preserva ordem de inserção, então o primeiro é o mais velho.
 */
function podarCache(agora: number): void {
  for (const [chave, entrada] of cache) {
    if (agora - entrada.at >= TTL_MS) cache.delete(chave);
  }
  while (cache.size >= MAX_ENTRADAS) {
    const maisVelha = cache.keys().next();
    if (maisVelha.done) break;
    cache.delete(maisVelha.value);
  }
}

/**
 * Todas as opções de parcelamento (sem e com juros) para o valor informado,
 * exatamente como a conta do Mercado Pago está configurada.
 */
/**
 * Teto de consultas que REALMENTE custam — as que não estão em cache.
 *
 * A primeira versão disto limitava toda chamada por IP, e estava errado por um
 * motivo específico deste país: operadora de celular usa CGNAT, então dezenas
 * de clientes no 4G compartilham um mesmo IP público. A vitrine mostra o
 * parcelamento em cada cartão de peça, então um punhado de visitantes móveis
 * estourava o teto junto — e perdia o "12x sem juros" na tela, sem erro
 * nenhum, só sumindo.
 *
 * Limitar apenas o cache miss desfaz isso, porque separa quem custa de quem
 * não custa. O cliente navega por preços que se repetem (é o catálogo da
 * loja), o cache é compartilhado por todo mundo no servidor, e a partir do
 * primeiro visitante essas consultas são de graça — nunca contam. Já o abuso é
 * feito de valores inventados (1.01, 1.02, 1.03…), onde TODA chamada é miss e
 * bate no teto quase de imediato.
 *
 * 60 por minuto cobre com folga o pior caso honesto: o primeiro visitante
 * depois de um deploy, com o cache frio, abrindo uma vitrine inteira de preços
 * distintos.
 */
const LIMITE_CONSULTA_NOVA = { limite: 60, janelaMs: 60_000 };

export async function installmentOptions(amount: number): Promise<InstallmentOption[]> {
  if (!Number.isFinite(amount) || amount <= 0) return [];
  const key = amount.toFixed(2);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  // Daqui para baixo a consulta custa: três chamadas à API do Mercado Pago e
  // uma entrada nova no cache. É este trecho que o teto protege.
  const { consumir, ipDoPedido } = await import("@/lib/rate-limit.server");
  const ip = await ipDoPedido();
  if (ip && !consumir(`ip:parcelas-novas:${ip}`, LIMITE_CONSULTA_NOVA).ok) {
    // Devolve vazio em vez de lançar: a tela apenas não mostra a linha de
    // parcelamento. Derrubar a página inteira por causa de um detalhe de
    // apresentação seria trocar um problema pequeno por um grande.
    console.warn("[mp] consulta de parcelamento barrada por excesso de valores novos");
    return [];
  }

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

  const agora = Date.now();
  if (cache.size >= MAX_ENTRADAS) podarCache(agora);
  cache.set(key, { at: agora, value });
  return value;
}

// `bestInterestFreeInstallment` morava aqui e não era chamada por ninguém — a
// escolha do melhor parcelamento sem juros acontece dentro de
// `getInstallments`, que é quem a tela usa. Removida na auditoria de código
// morto.
