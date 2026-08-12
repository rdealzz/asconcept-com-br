import { describe, expect, it } from "bun:test";
import type { Product } from "@/lib/cart-context";
import {
  buildGroups,
  collapseVariants,
  detectarCores,
  nomeBase,
  planGroup,
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
