import { describe, expect, it } from "bun:test";
import { ehNumeroDuplicado, gerarNumeroPedido, gravarComNumeroUnico } from "./order-number.server";

describe("gerarNumeroPedido", () => {
  it("respeita o formato que o resto do sistema valida", () => {
    // `validOrderNumber` e o painel do admin usam exatamente este regex.
    for (let i = 0; i < 500; i++) {
      expect(gerarNumeroPedido()).toMatch(/^AS-\d{6}$/);
    }
  });

  it("mantém os seis dígitos em toda a faixa", () => {
    for (let i = 0; i < 2000; i++) {
      const n = Number(gerarNumeroPedido().slice(3));
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it("não repete de forma perceptível em série curta", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 1000; i++) vistos.add(gerarNumeroPedido());
    // Com 900k valores, mil sorteios colidem raramente; exigir >990 distintos
    // pega um gerador travado ou enviesado sem falhar por acaso.
    expect(vistos.size).toBeGreaterThan(990);
  });
});

describe("ehNumeroDuplicado", () => {
  it("reconhece só a violação de UNIQUE do Postgres", () => {
    expect(ehNumeroDuplicado({ code: "23505" })).toBe(true);
    expect(ehNumeroDuplicado({ code: "23503" })).toBe(false);
    expect(ehNumeroDuplicado(null)).toBe(false);
  });
});

describe("gravarComNumeroUnico", () => {
  it("grava na primeira tentativa quando não há colisão", async () => {
    let chamadas = 0;
    const r = await gravarComNumeroUnico(async () => {
      chamadas++;
      return null;
    });
    expect(r.ok).toBe(true);
    expect(chamadas).toBe(1);
  });

  it("sorteia outro número quando o banco recusa por duplicidade", async () => {
    const tentados: string[] = [];
    const r = await gravarComNumeroUnico(async (orderNumber) => {
      tentados.push(orderNumber);
      // As duas primeiras colidem, a terceira passa.
      return tentados.length < 3 ? { code: "23505" } : null;
    });

    expect(r.ok).toBe(true);
    expect(tentados).toHaveLength(3);
    // Cada tentativa usa um número novo — repetir o mesmo colidiria de novo.
    expect(new Set(tentados).size).toBe(3);
    if (r.ok) expect(r.orderNumber).toBe(tentados[2]!);
  });

  it("desiste na hora de erro que não é duplicidade", async () => {
    let chamadas = 0;
    const r = await gravarComNumeroUnico(async () => {
      chamadas++;
      return { code: "23503", message: "foreign key" };
    });

    expect(r.ok).toBe(false);
    // Repetir um erro de chave estrangeira só desperdiça ida ao banco.
    expect(chamadas).toBe(1);
  });

  it("para depois do teto de tentativas quando tudo colide", async () => {
    let chamadas = 0;
    const r = await gravarComNumeroUnico(async () => {
      chamadas++;
      return { code: "23505" };
    }, 5);

    expect(r.ok).toBe(false);
    expect(chamadas).toBe(5);
  });
});
