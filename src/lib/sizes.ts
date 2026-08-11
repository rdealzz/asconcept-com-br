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

/**
 * Os tamanhos que uma peça já cadastrada mostra na loja.
 *
 * Parte da grade sugerida e acrescenta, no fim, todo tamanho que o estoque
 * gravado ainda tem em mãos e que não pertence a ela. É o que segura as peças
 * antigas: uma calça cadastrada quando só existia P/M/G/GG continua vendendo o
 * que está no depósito até alguém reeditá-la, em vez de sumir da loja.
 */
export function sizesForProduct(
  category: ProductCategory | string | null | undefined,
  name: string,
  stock?: Record<string, number> | null,
): string[] {
  const grade = [...suggestSizes(category, name)];
  if (!stock) return grade;
  for (const [tamanho, qtd] of Object.entries(stock)) {
    if (Number(qtd) > 0 && !grade.includes(tamanho)) grade.push(tamanho);
  }
  return grade;
}

/** A grade a que um conjunto de tamanhos gravados pertence, se for de alguma. */
export function gridOfSizes(sizes: readonly string[]): SizeGridId | null {
  for (const [id, grade] of Object.entries(SIZE_GRIDS) as [SizeGridId, readonly string[]][]) {
    if (sizes.length && sizes.every((s) => grade.includes(s))) return id;
  }
  return null;
}
