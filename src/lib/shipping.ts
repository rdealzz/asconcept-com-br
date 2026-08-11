// Simulação de frete a partir de Curitiba/PR para pacote pequeno.
// O valor exibido ao cliente é 50% do custo real simulado
// (os outros 50% já estão embutidos no preço do produto), mais uma margem
// fixa de R$ 10 — folga para embalagem e para a variação da tabela real.

export const FREE_SHIPPING_THRESHOLD = 299.9;

/** Margem fixa somada a todo frete cobrado. */
export const SHIPPING_MARKUP = 10;

export type BrazilState =
  | "AC" | "AL" | "AM" | "AP" | "BA" | "CE" | "DF" | "ES" | "GO"
  | "MA" | "MG" | "MS" | "MT" | "PA" | "PB" | "PE" | "PI" | "PR"
  | "RJ" | "RN" | "RO" | "RR" | "RS" | "SC" | "SE" | "SP" | "TO";

const STATE_NAMES: Record<BrazilState, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul",
  MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco",
  PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina",
  SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};

// Custo REAL simulado (R$) de envio de pacote pequeno saindo de Curitiba.
const REAL_COST: Record<BrazilState, number> = {
  PR: 18.9, SC: 22.5, SP: 26.9, RS: 27.9,
  RJ: 32.9, MG: 32.9, ES: 34.9, MS: 34.9,
  GO: 38.9, DF: 38.9, MT: 42.9, BA: 44.9,
  TO: 48.9, SE: 48.9, AL: 49.9, PE: 49.9, PB: 51.9, RN: 52.9,
  CE: 54.9, PI: 55.9, MA: 57.9,
  PA: 62.9, AP: 68.9, AM: 72.9, RR: 78.9, AC: 74.9, RO: 68.9,
};

// Mapeia faixas de CEP (número inteiro dos primeiros 5 dígitos) para UF.
const CEP_RANGES: Array<[number, number, BrazilState]> = [
  [1000, 19999, "SP"],
  [20000, 28999, "RJ"],
  [29000, 29999, "ES"],
  [30000, 39999, "MG"],
  [40000, 48999, "BA"],
  [49000, 49999, "SE"],
  [50000, 56999, "PE"],
  [57000, 57999, "AL"],
  [58000, 58999, "PB"],
  [59000, 59999, "RN"],
  [60000, 63999, "CE"],
  [64000, 64999, "PI"],
  [65000, 65999, "MA"],
  [66000, 68899, "PA"],
  [68900, 68999, "AP"],
  [69000, 69299, "AM"],
  [69300, 69399, "RR"],
  [69400, 69899, "AM"],
  [69900, 69999, "AC"],
  [70000, 72799, "DF"],
  [72800, 72999, "GO"],
  [73000, 73699, "DF"],
  [73700, 76799, "GO"],
  [76800, 76999, "RO"],
  [77000, 77999, "TO"],
  [78000, 78899, "MT"],
  [79000, 79999, "MS"],
  [80000, 87999, "PR"],
  [88000, 89999, "SC"],
  [90000, 99999, "RS"],
];

export function normalizeCep(cep: string): string {
  return cep.replace(/\D/g, "").slice(0, 8);
}

export function formatCep(cep: string): string {
  const d = normalizeCep(cep);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function stateFromCep(cep: string): BrazilState | null {
  const digits = normalizeCep(cep);
  if (digits.length !== 8) return null;
  const prefix = parseInt(digits.slice(0, 5), 10);
  for (const [min, max, uf] of CEP_RANGES) {
    if (prefix >= min && prefix <= max) return uf;
  }
  return null;
}

export type ShippingQuote = {
  state: BrazilState;
  stateName: string;
  realCost: number;
  displayCost: number; // 50% do custo real + margem fixa; 0 quando é cortesia
  free: boolean;
  etaDays: [number, number];
};

function etaFor(uf: BrazilState): [number, number] {
  if (uf === "PR") return [1, 2];
  if (["SC", "SP", "RS"].includes(uf)) return [2, 4];
  if (["RJ", "MG", "ES", "MS"].includes(uf)) return [3, 5];
  if (["GO", "DF", "MT", "BA"].includes(uf)) return [4, 7];
  if (["SE", "AL", "PE", "PB", "RN", "CE", "PI", "MA", "TO"].includes(uf))
    return [5, 9];
  return [7, 12];
}

export function quoteShipping(cep: string, subtotal: number): ShippingQuote | null {
  const uf = stateFromCep(cep);
  if (!uf) return null;
  const realCost = REAL_COST[uf];
  const free = subtotal >= FREE_SHIPPING_THRESHOLD;
  return {
    state: uf,
    stateName: STATE_NAMES[uf],
    realCost,
    // 50% do custo real, mais a margem fixa. Acima do valor de frete grátis
    // não se cobra nada — nem a margem.
    displayCost: free ? 0 : Math.round(realCost * 50) / 100 + SHIPPING_MARKUP,
    free,
    etaDays: etaFor(uf),
  };
}
