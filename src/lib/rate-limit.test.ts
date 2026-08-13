import { describe, expect, it, beforeEach } from "bun:test";
import { consumir, zerarLimites } from "./rate-limit.server";

const REGRA = { limite: 3, janelaMs: 60_000 };

describe("consumir", () => {
  beforeEach(() => zerarLimites());

  it("deixa passar até o limite e barra a chamada seguinte", () => {
    const agora = 1_000_000;
    expect(consumir("a", REGRA, agora).ok).toBe(true);
    expect(consumir("a", REGRA, agora).ok).toBe(true);
    expect(consumir("a", REGRA, agora).ok).toBe(true);

    const quarta = consumir("a", REGRA, agora);
    expect(quarta.ok).toBe(false);
    expect(quarta.esperarSegundos).toBe(60);
  });

  it("não mistura chaves diferentes", () => {
    const agora = 1_000_000;
    for (let i = 0; i < 3; i++) consumir("usuario-1", REGRA, agora);

    expect(consumir("usuario-1", REGRA, agora).ok).toBe(false);
    // Um usuário no teto não pode derrubar o outro.
    expect(consumir("usuario-2", REGRA, agora).ok).toBe(true);
  });

  it("libera quando a janela vira", () => {
    const agora = 1_000_000;
    for (let i = 0; i < 3; i++) consumir("a", REGRA, agora);
    expect(consumir("a", REGRA, agora).ok).toBe(false);

    // Um milissegundo antes de virar ainda está barrado.
    expect(consumir("a", REGRA, agora + REGRA.janelaMs - 1).ok).toBe(false);
    // Virou: cota nova.
    expect(consumir("a", REGRA, agora + REGRA.janelaMs).ok).toBe(true);
  });

  it("conta o tempo restante a partir do início da janela, não de cada chamada", () => {
    const agora = 1_000_000;
    consumir("a", REGRA, agora);
    consumir("a", REGRA, agora + 30_000);
    consumir("a", REGRA, agora + 40_000);

    // A janela abriu em `agora`, então faltam 20s — não 60 contados do último.
    const barrada = consumir("a", REGRA, agora + 40_000);
    expect(barrada.ok).toBe(false);
    expect(barrada.esperarSegundos).toBe(20);
  });

  it("não cresce sem teto quando as chaves nunca se repetem", () => {
    // É o cenário de abuso: chave nova a cada chamada. O contador de abuso não
    // pode virar o próprio vazamento de memória.
    const agora = 1_000_000;
    for (let i = 0; i < 25_000; i++) {
      consumir(`ip-${i}`, REGRA, agora + i);
    }
    // Sem poda, seriam 25.000 entradas retidas. O teto interno é 10.000.
    const barrada = consumir("ip-0", REGRA, agora + 25_000);
    // A chave mais antiga foi descartada, então ela recebe cota nova em vez de
    // ficar guardada para sempre.
    expect(barrada.ok).toBe(true);
  });
});
