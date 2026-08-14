import { coerceCategory, type ProductCategory } from "@/lib/categories";

/**
 * Grades de tamanho — a fonte única.
 *
 * Uma peça não tem "os tamanhos"; tem a grade da sua espécie. Camisa vai de P a
 * GG, calça vai em número, sneaker vai em número de pé e acessório não tem
 * tamanho nenhum. Antes o site inteiro assumia P/M/G/GG, então cadastrar uma
 * calça obrigava a fingir que 40 era "M".
 *
 * Para mexer nas grades, é aqui — e só aqui. A tabela abaixo alimenta o
 * formulário do admin, a página da peça, a vitrine e o painel de estoque.
 */

export const SIZE_GRIDS = {
  /** Roupas em geral: camisas, casacos, vestidos. */
  letras: ["P", "M", "G", "GG"],
  /**
   * A mesma grade de letras, aberta nas pontas. Fica como escolha do admin, e
   * não como padrão, porque a peça que só vai de P a GG não deve exibir PP e
   * XGG riscados na página — opção morta é ruído.
   */
  letras_amplas: ["PP", "P", "M", "G", "GG", "XGG"],
  /** Calças, bermudas e saias — numeração brasileira de cintura. */
  calcas: ["36", "38", "40", "42", "44", "46"],
  /** Calçados — numeração brasileira de pé. */
  calcados: ["36", "37", "38", "39", "40", "41", "42", "43", "44"],
  /** Cintos, óculos, bolsas: não há o que escolher. */
  unico: ["Único"],
} as const satisfies Record<string, readonly string[]>;

export type SizeGridId = keyof typeof SIZE_GRIDS;

export const SIZE_GRID_LABELS: Record<SizeGridId, string> = {
  letras: "Roupas · P ao GG",
  letras_amplas: "Roupas · PP ao XGG",
  calcas: "Calças · 36 ao 46",
  calcados: "Calçados · 36 ao 44",
  unico: "Tamanho único",
};

/**
 * O que denuncia uma peça de baixo, dentro de Roupas.
 *
 * É palpite pelo nome, de propósito: quem cadastra escreve "Calça Alfaiataria
 * Lã" e a grade certa aparece sozinha, sem mais um campo para preencher. Se o
 * palpite errar, o admin troca a grade na mão no formulário — o palpite é só o
 * valor inicial.
 */
const PALAVRAS_DE_CALCA =
  /\b(cal[çc]a|cal[çc]as|jeans|bermuda|short|shorts|saia|legging|cargo|pantalona|jogger)\b/i;

/** Grade sugerida para uma peça, pela categoria e pelo nome. */
export function suggestSizeGrid(
  category: ProductCategory | string | null | undefined,
  name = "",
): SizeGridId {
  const cat = coerceCategory(category);
  if (cat === "acessorios") return "unico";
  if (cat === "sneakers") return "calcados";
  return PALAVRAS_DE_CALCA.test(name) ? "calcas" : "letras";
}

/** Os tamanhos sugeridos para uma peça, pela categoria e pelo nome. */
export function suggestSizes(
  category: ProductCategory | string | null | undefined,
  name = "",
): readonly string[] {
  return SIZE_GRIDS[suggestSizeGrid(category, name)];
}

/** Ordem de leitura das letras. Fora daqui, número sobe e o resto vai ao fim. */
const ORDEM_LETRAS = ["PP", "P", "M", "G", "GG", "XGG", "XXGG"];

/**
 * Ordena tamanhos cadastrados fora de ordem.
 *
 * O estoque é JSONB: a ordem das chaves é a que o banco devolver, não a que faz
 * sentido para quem compra. Letras saem na ordem de sempre, números em ordem
 * crescente e qualquer rótulo estranho fica no fim, sem sumir.
 */
export function ordenarTamanhos(lista: readonly string[]): string[] {
  const peso = (s: string): [number, number, string] => {
    const letra = ORDEM_LETRAS.indexOf(s.toUpperCase());
    if (letra >= 0) return [0, letra, s];
    const n = Number(s.replace(",", "."));
    if (Number.isFinite(n)) return [1, n, s];
    return [2, 0, s.toLowerCase()];
  };
  return [...lista].sort((a, b) => {
    const [ga, va, ta] = peso(a);
    const [gb, vb, tb] = peso(b);
    return ga - gb || va - vb || ta.localeCompare(tb, "pt-BR");
  });
}

/**
 * Os tamanhos que uma peça mostra na loja.
 *
 * **Manda o cadastro, não a categoria.** Se a peça tem estoque gravado, a lista
 * é exatamente a das chaves dele — inclusive as zeradas, que aparecem como
 * esgotadas, porque foram cadastradas de propósito. A grade da espécie só entra
 * quando não há estoque nenhum, que é o caso de uma peça recém-criada.
 *
 * Era o contrário: a lista partia da grade palpitada pelo nome e só acrescentava
 * o que o estoque tivesse além dela. Um shorts cadastrado em P aparecia com
 * 36-46 riscados na frente do P — a grade de calça, que ninguém cadastrou,
 * empurrada por cima da que o admin escolheu.
 */
export function sizesForProduct(
  category: ProductCategory | string | null | undefined,
  name: string,
  stock?: Record<string, number> | null,
): string[] {
  const cadastrados = Object.keys(stock ?? {}).filter((s) => s.trim() !== "");
  if (cadastrados.length) return ordenarTamanhos(cadastrados);
  return [...suggestSizes(category, name)];
}

/**
 * A grade a que a peça pertence de verdade — o que decide a tabela de medidas
 * e o rótulo do seletor.
 *
 * O palpite pelo nome só vale enquanto não contradiz o cadastro. "Shorts" faz
 * palpitar numeração, mas se a peça foi cadastrada em P/M/G quem está certo é
 * o cadastro: exibir cintura e quadril para uma peça vendida em letras é
 * informação errada na cara do cliente.
 */
export function gridForProduct(
  category: ProductCategory | string | null | undefined,
  name: string,
  sizes?: readonly string[] | Record<string, number> | null,
): SizeGridId {
  const palpite = suggestSizeGrid(category, name);
  const lista = Array.isArray(sizes) ? sizes : Object.keys(sizes ?? {});
  const cadastrados = lista.filter((s) => typeof s === "string" && s.trim() !== "");
  if (!cadastrados.length) return palpite;

  // Cabendo no palpite, o palpite fica: é ele que separa uma calça 36-44 de um
  // calçado 36-44, que compartilham numeração mas não a tabela de medidas.
  const gradePalpitada = SIZE_GRIDS[palpite] as readonly string[];
  if (cadastrados.every((s) => gradePalpitada.includes(s))) return palpite;

  return gridOfSizes(cadastrados) ?? palpite;
}

/** A grade a que um conjunto de tamanhos gravados pertence, se for de alguma. */
export function gridOfSizes(sizes: readonly string[]): SizeGridId | null {
  for (const [id, grade] of Object.entries(SIZE_GRIDS) as [SizeGridId, readonly string[]][]) {
    if (sizes.length && sizes.every((s) => grade.includes(s))) return id;
  }
  return null;
}
