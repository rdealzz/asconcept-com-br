import { describe, expect, it } from "bun:test";
import { evaluatePassword, isStrongPassword } from "@/lib/password-strength";

/**
 * O que estes testes protegem é o portão: só "Senha Forte" libera o botão de
 * criar conta. Afrouxar qualquer uma das quatro regras aqui abre o cadastro
 * para senhas que a tela continuaria mostrando como cumpridas.
 */

describe("evaluatePassword", () => {
  it("campo vazio não acusa senha fraca", () => {
    const r = evaluatePassword("");
    expect(r.level).toBe("vazia");
    expect(r.score).toBe(0);
    expect(r.isStrong).toBe(false);
  });

  it("só minúsculas é fraca", () => {
    const r = evaluatePassword("senhasecreta");
    expect(r.level).toBe("fraca");
    expect(r.met.length).toBe(true);
    expect(r.met.uppercase).toBe(false);
    expect(r.met.number).toBe(false);
    expect(r.met.special).toBe(false);
  });

  it("três regras cumpridas é média, não forte", () => {
    const r = evaluatePassword("Senha1");
    expect(r.score).toBe(3);
    expect(r.level).toBe("media");
    expect(r.isStrong).toBe(false);
  });

  it("as quatro regras cumpridas é forte", () => {
    const r = evaluatePassword("Senha1@");
    expect(r.score).toBe(4);
    expect(r.level).toBe("forte");
    expect(r.label).toBe("Senha Forte");
    expect(r.isStrong).toBe(true);
  });

  it("curta demais não é forte, mesmo com todos os tipos", () => {
    expect(isStrongPassword("Ab1@")).toBe(false);
  });

  it("reconhece maiúscula e número acentuados/estrangeiros", () => {
    // "Á" é maiúscula de verdade; `[A-Z]` diria que não.
    const r = evaluatePassword("Álvaro9#");
    expect(r.met.uppercase).toBe(true);
    expect(r.met.number).toBe(true);
    expect(r.isStrong).toBe(true);
  });

  it("letra acentuada não vale como caractere especial", () => {
    // Com `[^A-Za-z0-9]`, o "á" passaria por especial e abriria o portão.
    expect(evaluatePassword("Senhaá1").met.special).toBe(false);
  });

  it("espaço não vale como caractere especial", () => {
    expect(evaluatePassword("Senha 1").met.special).toBe(false);
    expect(isStrongPassword("Senha 1")).toBe(false);
  });

  it("aceita os símbolos citados no cadastro", () => {
    for (const s of ["@", "#", "$", "!", "%", "*", "-", "_"]) {
      expect(evaluatePassword(`Senha1${s}`).isStrong).toBe(true);
    }
  });
});
