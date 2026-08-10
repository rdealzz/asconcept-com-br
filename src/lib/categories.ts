/**
 * Categorias do catálogo — a fonte única.
 *
 * Antes cada tela fazia o seu próprio `c === "clothes" ? "Roupas" : "Sneakers"`:
 * abas, menu do celular, barra de filtros, editor do admin, trilha da página de
 * produto. Acrescentar "Acessórios" nesse desenho significaria caçar ternários
 * — e qualquer um esquecido rotularia acessório como sneaker. Aqui a lista, os
 * rótulos e o texto editorial de cada aba ficam num lugar só.
 *
 * O valor gravado em `products.category` é a chave desta tabela.
 */

export const PRODUCT_CATEGORIES = ["clothes", "sneakers", "acessorios"] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Categoria de quem não declarou nenhuma (e das linhas antigas, gravadas como "roupas"). */
export const DEFAULT_CATEGORY: ProductCategory = "clothes";

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  clothes: "Roupas",
  sneakers: "Sneakers",
  acessorios: "Acessórios",
};

/**
 * Texto editorial de cada aba: o que a vitrine e a seção de produtos escrevem.
 * Fica junto do rótulo para que uma categoria nova não nasça sem copy.
 */
export const CATEGORY_COPY: Record<
  ProductCategory,
  {
    /** Sobretítulo da seção de produtos. */
    eyebrow: string;
    /** Título em duas linhas da seção de produtos. */
    lines: [string, string];
    blurb: string;
    /** Sobretítulo da vitrine giratória. */
    showroomEyebrow: string;
    /** Assinatura em duas linhas, no canto da vitrine. */
    showroomTitle: [string, string];
  }
> = {
  clothes: {
    eyebrow: "A Coleção",
    lines: ["Essenciais com", "Propósito"],
    blurb: "Peças atemporais, produzidas em pequenas séries por ateliês tradicionais europeus.",
    showroomEyebrow: "Em destaque · Roupas",
    showroomTitle: ["Herança", "que se veste"],
  },
  sneakers: {
    eyebrow: "Sneakers",
    lines: ["A Nova", "Cadência"],
    blurb: "Silhuetas contemporâneas, montadas artesanalmente em couros nobres.",
    showroomEyebrow: "Em destaque · Sneakers",
    showroomTitle: ["Cadência", "contemporânea"],
  },
  acessorios: {
    eyebrow: "Acessórios",
    lines: ["O Detalhe", "que Assina"],
    blurb:
      "Cintos, óculos e peças de couro que fecham o traje — feitos nas mesmas oficinas da coleção.",
    showroomEyebrow: "Em destaque · Acessórios",
    showroomTitle: ["O detalhe", "que assina"],
  },
};

export function isProductCategory(v: unknown): v is ProductCategory {
  return typeof v === "string" && (PRODUCT_CATEGORIES as readonly string[]).includes(v);
}

/** Normaliza o que veio do banco. Valor desconhecido cai em Roupas. */
export function coerceCategory(v: unknown): ProductCategory {
  return isProductCategory(v) ? v : DEFAULT_CATEGORY;
}

export function categoryLabel(c: ProductCategory | undefined | null): string {
  return CATEGORY_LABELS[coerceCategory(c)];
}

export function categoryCopy(c: ProductCategory | undefined | null) {
  return CATEGORY_COPY[coerceCategory(c)];
}
