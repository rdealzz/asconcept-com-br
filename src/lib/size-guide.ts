import { SIZE_GRIDS, gridForProduct, type SizeGridId } from "@/lib/sizes";
import type { ProductCategory } from "@/lib/categories";

/**
 * Guia de tamanhos — as medidas de referência de cada espécie de peça.
 *
 * A tabela do site era uma só, com comprimento, busto, ombro e manga, e
 * aparecia igual em tudo: um boné mostrava "busto 98 cm". Aqui cada grade tem
 * as colunas que fazem sentido para ela — cintura e quadril na calça, pé em
 * centímetros no calçado — e acessório não tem tabela nenhuma, tem um recado.
 *
 * As medidas são referência da marca, não medida da peça na mão. Quem manda no
 * que aparece é a grade da peça: se o admin cadastrou um tamanho fora dela, a
 * linha entra mesmo assim, com as medidas em branco, porque a grade do produto
 * prevalece sobre a tabela genérica.
 */

export type GuideColumn = { key: string; label: string };

export type GuideRow = { size: string; medidas: Record<string, string> };

export type SizeGuide = {
  gridId: SizeGridId;
  /** Título curto da tabela, para o cabeçalho do bloco. */
  titulo: string;
  columns: GuideColumn[];
  rows: GuideRow[];
  nota: string;
};

const COLUNAS: Record<SizeGridId, GuideColumn[]> = {
  letras: [
    { key: "comprimento", label: "Comprimento" },
    { key: "busto", label: "Busto" },
    { key: "ombro", label: "Ombro" },
    { key: "manga", label: "Manga" },
  ],
  letras_amplas: [
    { key: "comprimento", label: "Comprimento" },
    { key: "busto", label: "Busto" },
    { key: "ombro", label: "Ombro" },
    { key: "manga", label: "Manga" },
  ],
  calcas: [
    { key: "cintura", label: "Cintura" },
    { key: "quadril", label: "Quadril" },
    { key: "entrepernas", label: "Entrepernas" },
  ],
  calcados: [
    { key: "pe", label: "Pé" },
    { key: "palmilha", label: "Palmilha" },
  ],
  unico: [],
};

const TITULOS: Record<SizeGridId, string> = {
  letras: "Guia de tamanhos · roupas",
  letras_amplas: "Guia de tamanhos · roupas",
  calcas: "Guia de tamanhos · calças e bermudas",
  calcados: "Guia de tamanhos · calçados",
  unico: "Tamanho único",
};

const NOTAS: Record<SizeGridId, string> = {
  letras: "Medidas de referência em centímetros, com a peça deitada. Variação de até 2 cm.",
  letras_amplas: "Medidas de referência em centímetros, com a peça deitada. Variação de até 2 cm.",
  calcas: "Cintura e quadril medidos na peça deitada, em centímetros. Variação de até 2 cm.",
  calcados: "Comprimento do pé em centímetros. Na dúvida entre dois números, prefira o maior.",
  unico: "Peça de tamanho único, desenhada para servir sem ajuste de numeração.",
};

/** Medidas por tamanho, em centímetros. */
const MEDIDAS: Record<string, Record<string, number>> = {
  // Roupas (busto e comprimento da peça, não do corpo).
  PP: { comprimento: 65, busto: 92, ombro: 41, manga: 58 },
  P: { comprimento: 68, busto: 98, ombro: 43, manga: 60 },
  M: { comprimento: 71, busto: 104, ombro: 45, manga: 62 },
  G: { comprimento: 74, busto: 110, ombro: 47, manga: 64 },
  GG: { comprimento: 77, busto: 116, ombro: 49, manga: 66 },
  XGG: { comprimento: 80, busto: 122, ombro: 51, manga: 68 },
};

/** Calças, pela numeração brasileira de cintura. */
const MEDIDAS_CALCA: Record<string, Record<string, number>> = {
  "36": { cintura: 72, quadril: 92, entrepernas: 100 },
  "38": { cintura: 76, quadril: 96, entrepernas: 101 },
  "40": { cintura: 80, quadril: 100, entrepernas: 103 },
  "42": { cintura: 84, quadril: 104, entrepernas: 104 },
  "44": { cintura: 88, quadril: 108, entrepernas: 106 },
  "46": { cintura: 92, quadril: 112, entrepernas: 107 },
};

/** Calçados: numeração BR e o comprimento de pé que ela atende. */
const MEDIDAS_CALCADO: Record<string, Record<string, number>> = {
  "36": { pe: 23.5, palmilha: 24.1 },
  "37": { pe: 24.1, palmilha: 24.7 },
  "38": { pe: 24.8, palmilha: 25.4 },
  "39": { pe: 25.4, palmilha: 26.0 },
  "40": { pe: 26.1, palmilha: 26.7 },
  "41": { pe: 26.7, palmilha: 27.3 },
  "42": { pe: 27.4, palmilha: 28.0 },
  "43": { pe: 28.0, palmilha: 28.6 },
  "44": { pe: 28.7, palmilha: 29.3 },
};

function tabelaDaGrade(gridId: SizeGridId): Record<string, Record<string, number>> {
  if (gridId === "calcas") return MEDIDAS_CALCA;
  if (gridId === "calcados") return MEDIDAS_CALCADO;
  if (gridId === "unico") return {};
  return MEDIDAS;
}

/** Uma casa decimal só quando existe, para "26" não virar "26,0". */
function cm(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;
}

/**
 * O guia de uma peça.
 *
 * @param sizes Os tamanhos que a peça realmente oferece. É o que faz a grade
 *   cadastrada prevalecer: passando a lista da peça, a tabela mostra as linhas
 *   dela, e não as da grade genérica. Omitido, cai na grade da espécie.
 * @returns `null` para tamanho único — não há tabela a mostrar, e o chamador
 *   decide o que dizer no lugar.
 */
export function sizeGuideFor(
  category: ProductCategory | string | null | undefined,
  name = "",
  sizes?: readonly string[],
): SizeGuide | null {
  // A grade vem do cadastro da peça quando ele contradiz o palpite pelo nome —
  // shorts vendido em P/M/G não pode exibir tabela de cintura e quadril.
  const gridId = gridForProduct(category, name, sizes);
  if (gridId === "unico") return null;

  const tabela = tabelaDaGrade(gridId);
  const lista = sizes?.length ? sizes : SIZE_GRIDS[gridId];
  const columns = COLUNAS[gridId];

  const rows = lista
    // Tamanho "Único" cadastrado por engano numa peça de roupa não vira linha:
    // não há medida para ele e a coluna ficaria vazia à toa.
    .filter((s) => s !== "Único")
    .map((size) => {
      const medida = tabela[size];
      return {
        size,
        medidas: Object.fromEntries(
          columns.map((c) => [c.key, medida?.[c.key] === undefined ? "—" : cm(medida[c.key])]),
        ),
      };
    });

  if (!rows.length) return null;

  return { gridId, titulo: TITULOS[gridId], columns, rows, nota: NOTAS[gridId] };
}

/** Recado do tamanho único, quando não há tabela. */
export const NOTA_TAMANHO_UNICO = NOTAS.unico;
