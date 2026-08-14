/**
 * Busca e ordenação da vitrine.
 *
 * Duas coisas moram aqui, e as duas são regra de loja, não de tela — por isso
 * ficam fora do componente, onde dá para testar.
 */

/**
 * Texto pronto para comparar: sem acento, sem maiúscula, sem espaço sobrando.
 *
 * A busca comparava o texto cru. Quem digita "calca" — que é como metade das
 * pessoas digita no celular, sem parar para achar a cedilha — não encontrava
 * "Calça"; quem digita "moletom polo" com um acento a mais também não. Numa
 * vitrine pequena isso não é detalhe: a busca vazia é o fim da visita.
 *
 * `NFD` separa a letra do acento e o `\p{Diacritic}` remove o acento, deixando
 * a letra. Vale para todo acento do português — e para o que vier de fora, sem
 * lista de exceção para manter.
 */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * O texto contém o termo procurado?
 *
 * Cada palavra do termo é procurada por conta própria, e todas precisam
 * aparecer: "camisa linho" acha "Camisa de Linho Italiano", que uma comparação
 * literal com a frase inteira não acharia. A ordem não importa, porque quem
 * procura não sabe como a peça foi cadastrada.
 */
export function combinaBusca(texto: string, termo: string): boolean {
  const alvo = normalizarBusca(texto);
  const palavras = normalizarBusca(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return true;
  return palavras.every((p) => alvo.includes(p));
}

/** Como a vitrine está ordenada. */
export type Ordenacao = "curadoria" | "menor-preco" | "maior-preco" | "novidades";

export const ORDENACOES: ReadonlyArray<{ id: Ordenacao; label: string }> = [
  // A ordem do catálogo, definida pelo admin em `sort_order`. É a de sempre, e
  // continua sendo o padrão: numa loja de curadoria, a vitrine é uma escolha.
  { id: "curadoria", label: "Curadoria" },
  { id: "menor-preco", label: "Menor preço" },
  { id: "maior-preco", label: "Maior preço" },
  { id: "novidades", label: "Novidades" },
];

type Ordenavel = { price: number; createdAt?: string };

/**
 * Ordena uma cópia — a lista que chega é a do catálogo, e mexer nela na ordem
 * errada mudaria a vitrine de todo mundo.
 *
 * `curadoria` não reordena nada: a lista já vem do banco por `sort_order`.
 */
export function ordenarProdutos<T extends Ordenavel>(itens: readonly T[], por: Ordenacao): T[] {
  const copia = [...itens];
  switch (por) {
    case "menor-preco":
      return copia.sort((a, b) => a.price - b.price);
    case "maior-preco":
      return copia.sort((a, b) => b.price - a.price);
    case "novidades":
      // Peça sem data de cadastro (registro antigo) vai para o fim, e não para
      // o começo: sem data não há como afirmar que é novidade.
      return copia.sort((a, b) => {
        const da = a.createdAt ? Date.parse(a.createdAt) : 0;
        const db = b.createdAt ? Date.parse(b.createdAt) : 0;
        return db - da;
      });
    default:
      return copia;
  }
}
