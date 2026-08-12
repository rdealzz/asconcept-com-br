import { describe, expect, it } from "bun:test";
import { gridForProduct, sizesForProduct, suggestSizeGrid } from "@/lib/sizes";

/**
 * A regra que estes testes protegem é uma só: **manda o cadastro**.
 *
 * O erro que os motivou foi um shorts de banho cadastrado em P aparecendo na
 * loja com 36, 38, 40, 42, 44 e 46 riscados na frente do P — a grade de calça,
 * que ninguém cadastrou, empurrada por cima da escolha do admin porque o nome
 * tinha a palavra "shorts".
 */

describe("sizesForProduct", () => {
  it("mostra só o que foi cadastrado, mesmo quando o nome sugere outra grade", () => {
    expect(sizesForProduct("clothes", "Shorts de Banho/Praia Polo", { P: 1 })).toEqual(["P"]);
  });

  it("mantém o tamanho esgotado, que foi cadastrado de propósito", () => {
    expect(sizesForProduct("clothes", "Camisa de Linho", { P: 0, M: 2, G: 0 })).toEqual([
      "P",
      "M",
      "G",
    ]);
  });

  it("ordena letras e números fora de ordem", () => {
    expect(sizesForProduct("clothes", "Camisa", { GG: 1, P: 1, M: 0 })).toEqual(["P", "M", "GG"]);
    expect(sizesForProduct("clothes", "Calça", { "44": 1, "38": 2, "40": 0 })).toEqual([
      "38",
      "40",
      "44",
    ]);
  });

  it("cai na grade da espécie só quando não há estoque cadastrado", () => {
    expect(sizesForProduct("clothes", "Calça de Alfaiataria", {})).toEqual([
      "36",
      "38",
      "40",
      "42",
      "44",
      "46",
    ]);
    expect(sizesForProduct("acessorios", "Boné", null)).toEqual(["Único"]);
  });

  it("não inventa tamanho para acessório cadastrado em tamanho único", () => {
    expect(sizesForProduct("acessorios", "Cinto de Couro", { Único: 3 })).toEqual(["Único"]);
  });
});

describe("gridForProduct", () => {
  it("segue o cadastro quando ele contradiz o palpite do nome", () => {
    expect(suggestSizeGrid("clothes", "Shorts de Banho")).toBe("calcas");
    expect(gridForProduct("clothes", "Shorts de Banho", { P: 1, M: 1 })).toBe("letras");
  });

  it("separa calça de calçado, que compartilham numeração", () => {
    expect(gridForProduct("clothes", "Calça Cargo", { "38": 1, "40": 1 })).toBe("calcas");
    expect(gridForProduct("sneakers", "Tênis Retrô", { "38": 1, "40": 1 })).toBe("calcados");
  });

  it("reconhece a grade ampliada de letras", () => {
    expect(gridForProduct("clothes", "Moletom", { PP: 1, XGG: 1 })).toBe("letras_amplas");
  });

  it("usa o palpite quando a peça ainda não tem estoque", () => {
    expect(gridForProduct("acessorios", "Óculos", {})).toBe("unico");
    expect(gridForProduct("clothes", "Camiseta", null)).toBe("letras");
  });

  it("não desiste diante de um cadastro meio a meio", () => {
    // Peça antiga, com resto de duas grades: cai no palpite em vez de quebrar.
    expect(gridForProduct("clothes", "Camisa", { M: 1, "42": 1 })).toBe("letras");
  });
});
