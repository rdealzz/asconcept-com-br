import { describe, expect, it } from "bun:test";
import type { Product } from "@/lib/cart-context";
import {
  albumCategories,
  albumSizes,
  buildGroups,
  collapseVariants,
  detectarCores,
  nomeBase,
  parsePreco,
  planGroup,
  planCategories,
  planPrices,
  planStock,
  productIdFromParam,
  productParam,
  slugify,
  suggestGroups,
  swatchBackground,
  type VariantMeta,
} from "@/lib/variants";

/**
 * O que estes testes protegem:
 *
 *   1. **duas cores num seletor só.** Preta com logo branco e preta com logo
 *      vermelho não podem virar dois quadrados pretos iguais;
 *   2. **a vitrine mostra um card por álbum**, e o card certo — o da cor
 *      procurada, quando há busca;
 *   3. **link antigo continua abrindo a peça**, agora que a URL leva o nome
 *      na frente do id.
 */

const UUID_A = "11111111-2222-4333-8444-555555555555";
const UUID_B = "66666666-7777-4888-8999-aaaaaaaaaaaa";

function peca(id: string, name: string, variant?: VariantMeta | null): Product {
  return {
    id,
    name,
    description: "",
    price: 219.9,
    image: "",
    category: "clothes",
    variant: variant ?? null,
  };
}

describe("URL da peça", () => {
  it("leva o nome na frente do id", () => {
    expect(productParam({ id: UUID_A, name: "Camiseta Básica Polo — Preta" })).toBe(
      `camiseta-basica-polo-preta--${UUID_A}`,
    );
  });

  it("recupera o id do parâmetro novo e do link antigo", () => {
    expect(productIdFromParam(`camiseta-basica-polo-preta--${UUID_A}`)).toBe(UUID_A);
    expect(productIdFromParam(UUID_A)).toBe(UUID_A);
  });

  it("aguenta nome com hífen sem perder o id", () => {
    const param = productParam({ id: UUID_B, name: "Camisa Azul-Marinho - Logo Branco" });
    expect(productIdFromParam(param)).toBe(UUID_B);
  });

  it("não devolve slug vazio para peça sem nome", () => {
    expect(slugify("···")).toBe("peca");
    expect(productParam({ id: UUID_A, name: "" })).toBe(UUID_A);
  });
});

describe("cores no nome da peça", () => {
  it("separa a cor da peça da cor do logo", () => {
    expect(detectarCores("Camiseta Básica Polo Ralph Lauren – Preta com Logo Vermelho")).toEqual({
      color: "#111111",
      accent: "#C1121F",
      colorLabel: "Preta com logo vermelho",
    });
  });

  it("lê cor composta antes da simples", () => {
    const c = detectarCores("Camiseta – Branca com Logo Azul Marinho");
    expect(c.color).toBe("#FFFFFF");
    expect(c.accent).toBe("#1B2A4A");
  });

  it("peça de cor única não inventa cor de logo", () => {
    expect(detectarCores("Shorts de Praia Premium – Bege Texturizado").accent).toBeUndefined();
  });

  it("nome sem cor nenhuma não deduz nada", () => {
    expect(detectarCores("Camisa de Linho Italiano")).toEqual({});
  });
});

describe("seletor de cor", () => {
  it("divide o seletor ao meio quando há cor de logo", () => {
    const fundo = swatchBackground({ group: "g", color: "#111111", accent: "#C1121F" });
    expect(fundo).toContain("#111111 0 50%");
    expect(fundo).toContain("#C1121F 50% 100%");
  });

  it("cai para as cores do nome quando o cadastro não as tem", () => {
    expect(swatchBackground(null, "Camiseta – Preta com Logo Branco")).toContain("#FFFFFF 50%");
  });
});

describe("álbuns", () => {
  const meta = (group: string, extra: Partial<VariantMeta> = {}): VariantMeta => ({
    group,
    ...extra,
  });

  it("ordena pelos números gravados e respeita a peça principal", () => {
    const lista = [
      peca("a", "Preta", meta("camiseta", { position: 1 })),
      peca("b", "Branca", meta("camiseta", { position: 0, primary: true })),
    ];
    const g = buildGroups(lista).get("camiseta")!;
    expect(g.members.map((m) => m.id)).toEqual(["b", "a"]);
    expect(g.primary.id).toBe("b");
  });

  it("ignora álbum de uma peça só — ela volta a ser uma peça solta", () => {
    expect(buildGroups([peca("a", "Preta", meta("camiseta"))]).size).toBe(0);
  });

  it("a vitrine mostra um card por álbum, o da peça principal", () => {
    const lista = [
      peca("a", "Preta", meta("camiseta", { position: 1 })),
      peca("b", "Branca", meta("camiseta", { position: 0, primary: true })),
      peca("c", "Calça de linho"),
    ];
    const grupos = buildGroups(lista);
    expect(collapseVariants(lista, grupos).map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("na busca, o card é a cor procurada", () => {
    const preta = peca("a", "Preta", meta("camiseta", { position: 1 }));
    const branca = peca("b", "Branca", meta("camiseta", { position: 0, primary: true }));
    const grupos = buildGroups([preta, branca]);
    // Só a preta sobreviveu ao filtro da busca.
    const achados = collapseVariants([preta], grupos, (g) => g.members.find((m) => m.id === "a"));
    expect(achados.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("plano de gravação", () => {
  const membros = [
    peca("a", "Camiseta – Preta com Logo Vermelho"),
    peca("b", "Camiseta – Branca com Logo Azul Marinho"),
  ];

  it("numera a ordem, marca a principal e preenche as cores pelo nome", () => {
    const plano = planGroup(
      "camiseta",
      "Camiseta",
      membros.map((product) => ({ product })),
      "b",
    );
    expect(plano[0].meta).toEqual({
      group: "camiseta",
      label: "Camiseta",
      position: 0,
      color: "#111111",
      accent: "#C1121F",
      colorLabel: "Preta com logo vermelho",
    });
    expect(plano[1].meta?.primary).toBe(true);
  });

  it("desfaz o álbum quando sobra uma peça só", () => {
    const plano = planGroup("camiseta", "Camiseta", [{ product: membros[0] }]);
    expect(plano).toEqual([{ id: "a", meta: null }]);
  });

  it("principal inválida cai na primeira peça, e não fica sem nenhuma", () => {
    const plano = planGroup(
      "camiseta",
      "Camiseta",
      membros.map((product) => ({ product })),
      "sumiu",
    );
    expect(plano.filter((p) => p.meta?.primary).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("sugestão automática", () => {
  it("propõe o mesmo modelo em cores diferentes", () => {
    const lista = [
      peca("a", "Camiseta Básica Polo Ralph Lauren – Preta com Logo Vermelho"),
      peca("b", "Camiseta Básica Polo Ralph Lauren – Branca com Logo Azul Marinho"),
      peca("c", "Calça de Alfaiataria Bege"),
    ];
    const s = suggestGroups(lista);
    expect(s).toHaveLength(1);
    expect(s[0].products.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(s[0].label).toBe("Camiseta Básica Polo Ralph Lauren");
  });

  it("não propõe nada para peça que já está num álbum", () => {
    const lista = [
      peca("a", "Camiseta Polo – Preta", { group: "x" }),
      peca("b", "Camiseta Polo – Branca", { group: "x" }),
    ];
    expect(suggestGroups(lista)).toEqual([]);
  });

  it("não junta modelos diferentes que só compartilham a cor", () => {
    const lista = [peca("a", "Camisa de Linho Preta"), peca("b", "Calça de Alfaiataria Preta")];
    expect(suggestGroups(lista)).toEqual([]);
  });

  it("propõe o mesmo modelo mesmo quando o nome não é idêntico", () => {
    // O caso real da loja: os dois são o mesmo shorts, em cores diferentes,
    // cadastrados com nomes que não batem palavra por palavra.
    const lista = [
      peca("a", "Shorts de Praia Premium Polo Ralph Lauren - Azul Marinho"),
      peca("b", "Shorts de Banho/Praia Polo Ralph Lauren - Bege Texturizado"),
    ];
    const s = suggestGroups(lista);
    expect(s).toHaveLength(1);
    expect(s[0].products.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("não junta camisa com camiseta só porque a marca é a mesma", () => {
    // Três palavras de marca em comum ("polo ralph lauren") não podem bastar:
    // a espécie da peça é a primeira palavra, e ela tem de bater.
    const lista = [
      peca("a", "Camiseta Básica Polo Ralph Lauren - Preta"),
      peca("b", "Camisa Social Polo Ralph Lauren - Branca"),
    ];
    expect(suggestGroups(lista)).toEqual([]);
  });

  it("não propõe álbum de peças todas da mesma cor", () => {
    const lista = [
      peca("a", "Suéter de Malha Trançada Polo Ralph Lauren - Branco"),
      peca("b", "Suéter de Malha Canelada Polo Ralph Lauren - Branco"),
    ];
    expect(suggestGroups(lista)).toEqual([]);
  });

  it("peça sem par volta para a fila e entra no álbum de outra semente", () => {
    // A calça é visitada primeiro e não forma grupo; isso não pode impedi-la
    // de ser comparada com as peças seguintes.
    const lista = [
      peca("z", "Calça de Alfaiataria Bege"),
      peca("a", "Suéter de Malha Trançada Polo Ralph Lauren - Branco"),
      peca("b", "Suéter de Malha Trançada Polo Ralph Lauren - Cinza"),
    ];
    const s = suggestGroups(lista);
    expect(s).toHaveLength(1);
    expect(s[0].products.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("o nome sem cor é o que aproxima duas peças", () => {
    expect(nomeBase("Camiseta Básica Polo – Preta com Logo Vermelho")).toBe("camiseta basica polo");
  });
});

describe("preço do álbum", () => {
  const album = [
    { ...peca("a", "Camiseta – Preta"), price: 200 },
    { ...peca("b", "Camiseta – Branca"), price: 250 },
  ];

  it("iguala todas as cores no mesmo preço", () => {
    expect(planPrices(album, { modo: "igualar", valor: 180 })).toEqual([
      { id: "a", price: 180 },
      { id: "b", price: 180 },
    ]);
  });

  it("baixa a mesma porcentagem em todas, mantendo a diferença entre elas", () => {
    expect(planPrices(album, { modo: "percentual", valor: -10 })).toEqual([
      { id: "a", price: 180 },
      { id: "b", price: 225 },
    ]);
  });

  it("baixa o mesmo valor em reais em todas", () => {
    expect(planPrices(album, { modo: "reais", valor: -30.5 })).toEqual([
      { id: "a", price: 169.5 },
      { id: "b", price: 219.5 },
    ]);
  });

  it("arredonda o centavo em vez de deixar dízima no preço", () => {
    const [um] = planPrices([{ ...peca("a", "Camiseta"), price: 219.9 }], {
      modo: "percentual",
      valor: -7,
    });
    expect(um.price).toBe(204.51);
  });

  it("não deixa nenhuma cor cair para zero — peça sem preço não vende", () => {
    expect(planPrices(album, { modo: "reais", valor: -999 })).toEqual([
      { id: "a", price: 0.01 },
      { id: "b", price: 0.01 },
    ]);
  });

  it("não regrava a cor que já está no preço pedido", () => {
    expect(planPrices(album, { modo: "igualar", valor: 200 })).toEqual([{ id: "b", price: 200 }]);
    expect(planPrices(album, { modo: "percentual", valor: 0 })).toEqual([]);
  });

  it("lê o preço digitado nas formas que saem do teclado", () => {
    expect(parsePreco("199,90")).toBe(199.9);
    expect(parsePreco("1.299,90")).toBe(1299.9);
    expect(parsePreco("R$ 199.90")).toBe(199.9);
    expect(parsePreco("10")).toBe(10);
    expect(parsePreco("")).toBeNull();
    expect(parsePreco("abc")).toBeNull();
  });
});

describe("estoque do álbum", () => {
  const album = [peca("a", "Camiseta – Preta"), peca("b", "Camiseta – Branca")];

  it("a grade do álbum é a união do que as cores têm cadastrado, em ordem", () => {
    expect(albumSizes(album, { a: { M: 2, P: 1 }, b: { G: 0 } })).toEqual(["P", "M", "G"]);
  });

  it("álbum sem estoque nenhum cai na grade da espécie da peça", () => {
    expect(albumSizes(album, {})).toEqual(["P", "M", "G", "GG"]);
  });

  it("aplica a mesma grade em todas as cores", () => {
    const plano = planStock(album, { a: { P: 1, M: 0 }, b: {} }, { P: 2, M: 3 });
    expect(plano).toEqual([
      { id: "a", stock: { P: 2, M: 3 } },
      { id: "b", stock: { P: 2, M: 3 } },
    ]);
  });

  it("apaga o tamanho que sobrou de cadastro antigo — a grade aplicada é a inteira", () => {
    const plano = planStock([peca("a", "Camiseta")], { a: { P: 1, "40": 2 } }, { P: 1, M: 1 });
    expect(plano).toEqual([{ id: "a", stock: { P: 1, M: 1 } }]);
  });

  it("não regrava a cor que já está na grade pedida", () => {
    const plano = planStock(album, { a: { P: 2, M: 3 }, b: { P: 0, M: 0 } }, { P: 2, M: 3 });
    expect(plano).toEqual([{ id: "b", stock: { P: 2, M: 3 } }]);
  });

  it("arruma o que o campo aceita digitar: quebrado, negativo e tamanho em branco", () => {
    const plano = planStock([peca("a", "Camiseta")], {}, { P: 2.7, M: -5, "": 9 });
    expect(plano).toEqual([{ id: "a", stock: { P: 2, M: 0 } }]);
  });

  it("grade vazia não grava nada — zerar o álbum é digitar zero, não apagar tudo", () => {
    expect(planStock(album, { a: { P: 1 } }, {})).toEqual([]);
  });
});

describe("categoria do álbum", () => {
  it("leva todas as cores para a mesma categoria", () => {
    const album = [
      { ...peca("a", "Tênis – Branco"), category: "clothes" as const },
      { ...peca("b", "Tênis – Preto"), category: "sneakers" as const },
    ];
    expect(planCategories(album, "sneakers")).toEqual([{ id: "a", category: "sneakers" }]);
  });

  it("não regrava a cor que já está na categoria pedida", () => {
    const album = [peca("a", "Camiseta – Preta"), peca("b", "Camiseta – Branca")];
    expect(planCategories(album, "clothes")).toEqual([]);
  });

  it("denuncia o álbum espalhado por mais de uma aba da vitrine", () => {
    const album = [
      peca("a", "Camiseta – Preta"),
      { ...peca("b", "Camiseta – Branca"), category: "acessorios" as const },
      { ...peca("c", "Camiseta – Cinza"), category: undefined },
    ];
    // A cor sem categoria conta como Roupas, que é o padrão do catálogo.
    expect(albumCategories(album)).toEqual(["clothes", "acessorios"]);
  });
});
