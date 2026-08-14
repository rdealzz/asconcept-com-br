import { describe, expect, it } from "bun:test";
import { combinaBusca, normalizarBusca, ordenarProdutos } from "./busca";

describe("normalizarBusca", () => {
  it("tira acento, caixa e espaço das pontas", () => {
    expect(normalizarBusca("  Calça ")).toBe("calca");
    expect(normalizarBusca("SUÉTER")).toBe("sueter");
    expect(normalizarBusca("Camisão")).toBe("camisao");
  });
});

describe("combinaBusca", () => {
  it("acha a peça mesmo sem o acento — o caso que motivou tudo isto", () => {
    expect(combinaBusca("Calça Alfaiataria Lã", "calca")).toBe(true);
    expect(combinaBusca("Suéter de Tricô", "sueter")).toBe(true);
  });

  it("acha com o acento também", () => {
    expect(combinaBusca("Calça Alfaiataria", "calça")).toBe(true);
  });

  it("aceita as palavras em qualquer ordem, e todas precisam aparecer", () => {
    expect(combinaBusca("Camisa de Linho Italiano", "linho camisa")).toBe(true);
    expect(combinaBusca("Camisa de Linho Italiano", "camisa seda")).toBe(false);
  });

  it("termo vazio não filtra nada", () => {
    expect(combinaBusca("qualquer peça", "   ")).toBe(true);
  });
});

describe("ordenarProdutos", () => {
  const pecas = [
    { price: 300, createdAt: "2026-01-10T00:00:00Z" },
    { price: 100, createdAt: "2026-08-01T00:00:00Z" },
    { price: 200 },
  ];

  it("não mexe na lista original", () => {
    ordenarProdutos(pecas, "menor-preco");
    expect(pecas[0].price).toBe(300);
  });

  it("ordena por preço nos dois sentidos", () => {
    expect(ordenarProdutos(pecas, "menor-preco").map((p) => p.price)).toEqual([100, 200, 300]);
    expect(ordenarProdutos(pecas, "maior-preco").map((p) => p.price)).toEqual([300, 200, 100]);
  });

  it("novidades primeiro, e peça sem data por último", () => {
    expect(ordenarProdutos(pecas, "novidades").map((p) => p.price)).toEqual([100, 300, 200]);
  });

  it("curadoria mantém a ordem do catálogo", () => {
    expect(ordenarProdutos(pecas, "curadoria").map((p) => p.price)).toEqual([300, 100, 200]);
  });
});
