import { describe, expect, it } from "bun:test";
import { segredosIguais } from "./timing-safe";

describe("segredosIguais", () => {
  it("aceita apenas o valor idêntico", () => {
    expect(segredosIguais("chave-secreta", "chave-secreta")).toBe(true);
    expect(segredosIguais("chave-secreta", "chave-secretb")).toBe(false);
    // Diferença no primeiro caractere: é o caso que a comparação comum
    // resolveria mais rápido, e que este laço trata igual aos outros.
    expect(segredosIguais("Xhave-secreta", "chave-secreta")).toBe(false);
  });

  it("recusa quando o comprimento difere, inclusive por prefixo", () => {
    expect(segredosIguais("chave", "chave-longa")).toBe(false);
    expect(segredosIguais("chave-longa", "chave")).toBe(false);
    expect(segredosIguais("", "chave")).toBe(false);
  });

  it("trata string vazia contra string vazia como igual", () => {
    expect(segredosIguais("", "")).toBe(true);
  });

  it("recusa qualquer coisa que não seja string", () => {
    // Um `undefined` dos dois lados (variável de ambiente ausente) não pode
    // virar "iguais" e abrir o endpoint.
    expect(segredosIguais(undefined, undefined)).toBe(false);
    expect(segredosIguais(null, null)).toBe(false);
    expect(segredosIguais("chave", undefined)).toBe(false);
    expect(segredosIguais(undefined, "chave")).toBe(false);
  });

  it("compara por bytes, não por unidade de código", () => {
    // Acento fora da faixa ASCII vira mais de um byte; o laço tem de bater.
    expect(segredosIguais("sessão-válida", "sessão-válida")).toBe(true);
    expect(segredosIguais("sessão-válida", "sessao-valida")).toBe(false);
  });
});
