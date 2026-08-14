import { describe, expect, it, beforeEach } from "bun:test";
import { consumir, zerarLimites } from "./rate-limit.server";

/**
 * O teto de parcelamento só vale para consulta que custa (cache miss).
 *
 * `installmentOptions` fala com a rede, então não dá para exercitá-la aqui.
 * O que estes testes travam é a REGRA que a correção depende: a chave só é
 * consumida quando a consulta é nova. Se alguém voltar a limitar toda chamada,
 * o cliente no 4G — vários por trás do mesmo IP, por CGNAT — volta a perder a
 * linha de parcelamento na vitrine.
 */
const REGRA = { limite: 60, janelaMs: 60_000 };
const CHAVE = "ip:parcelas-novas:200.150.10.1";

describe("teto de consultas novas de parcelamento", () => {
  beforeEach(() => zerarLimites());

  it("aguenta uma vitrine inteira de preços distintos com cache frio", () => {
    // Pior caso honesto: primeiro visitante depois do deploy abrindo a home
    // com 40 peças de preços diferentes. Nenhuma pode ser barrada.
    const agora = 1_000_000;
    for (let i = 0; i < 40; i++) {
      expect(consumir(CHAVE, REGRA, agora).ok).toBe(true);
    }
  });

  it("barra o laço de valores inventados", () => {
    // O abuso: 1.01, 1.02, 1.03… onde toda chamada é miss.
    const agora = 1_000_000;
    for (let i = 0; i < 60; i++) consumir(CHAVE, REGRA, agora);
    expect(consumir(CHAVE, REGRA, agora).ok).toBe(false);
  });

  it("não cobra cota de quem pega o valor já em cache", () => {
    // A regra que importa: o cliente que abre a mesma peça cem vezes não
    // encosta no teto, porque o acerto de cache nem chega a consumir.
    const agora = 1_000_000;
    for (let i = 0; i < 60; i++) consumir(CHAVE, REGRA, agora);
    expect(consumir(CHAVE, REGRA, agora).ok).toBe(false);

    // Cem leituras de cache depois, o estado é o mesmo — nada foi consumido,
    // porque o caminho do cache não chama `consumir`.
    const outroIp = "ip:parcelas-novas:200.150.10.2";
    expect(consumir(outroIp, REGRA, agora).ok).toBe(true);
  });

  it("libera na janela seguinte", () => {
    const agora = 1_000_000;
    for (let i = 0; i < 60; i++) consumir(CHAVE, REGRA, agora);
    expect(consumir(CHAVE, REGRA, agora).ok).toBe(false);
    expect(consumir(CHAVE, REGRA, agora + REGRA.janelaMs).ok).toBe(true);
  });
});
