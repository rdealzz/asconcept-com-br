import { describe, expect, it } from "bun:test";
import {
  faltasDeEstoque,
  mensagemDasFaltas,
  normalizarGrade,
  type ItemPedido,
  type PecaEmEstoque,
} from "@/lib/stock";

/**
 * A pergunta que o checkout faz antes de cobrar: dá para vender isto?
 *
 * O buraco que estes testes fecham era real e passava despercebido: o checkout
 * do Mercado Pago — o único que a loja usa — não conferia estoque nenhum. O
 * pedido nascia, o cliente pagava, e a peça que não existia só aparecia como
 * uma linha de log quando a baixa tentava acontecer.
 */

function peca(id: string, name: string, sizes: Record<string, number>): PecaEmEstoque {
  return { id, name, sizes };
}

const catalogo = (...pecas: PecaEmEstoque[]) => new Map(pecas.map((p) => [p.id, p]));

const item = (id: string, size: string, quantity: number): ItemPedido => ({ id, size, quantity });

describe("faltasDeEstoque", () => {
  it("deixa passar o que tem estoque de sobra", () => {
    const faltas = faltasDeEstoque(
      [item("p1", "M", 2)],
      catalogo(peca("p1", "Suéter Tricot Premium", { P: 1, M: 3, G: 0 })),
    );
    expect(faltas).toEqual([]);
  });

  it("recusa o tamanho esgotado", () => {
    const faltas = faltasDeEstoque(
      [item("p1", "G", 1)],
      catalogo(peca("p1", "Suéter Tricot Premium", { P: 1, M: 3, G: 0 })),
    );
    expect(faltas).toHaveLength(1);
    expect(faltas[0].motivo).toBe("esgotado");
    expect(faltas[0].name).toBe("Suéter Tricot Premium");
  });

  it("recusa quando o pedido é maior do que o estoque", () => {
    const faltas = faltasDeEstoque(
      [item("p1", "M", 4)],
      catalogo(peca("p1", "Suéter Tricot Premium", { M: 3 })),
    );
    expect(faltas[0]).toMatchObject({ motivo: "insuficiente", disponivel: 3, pedido: 4 });
  });

  it("recusa tamanho que a peça não tem na grade", () => {
    const faltas = faltasDeEstoque(
      [item("p1", "42", 1)],
      catalogo(peca("p1", "Suéter Tricot Premium", { P: 1, M: 3 })),
    );
    expect(faltas[0].motivo).toBe("tamanho_inexistente");
  });

  it("recusa peça que saiu do catálogo entre o carrinho e o checkout", () => {
    const faltas = faltasDeEstoque([item("sumiu", "M", 1)], catalogo());
    expect(faltas[0].motivo).toBe("produto_inexistente");
  });

  /**
   * O caso que uma conferência item a item deixaria passar: o carrinho não
   * junta linhas iguais, e duas de 1 unidade contra um estoque de 1 passariam
   * uma a uma.
   */
  it("soma as linhas do mesmo par peça+tamanho antes de comparar", () => {
    const faltas = faltasDeEstoque(
      [item("p1", "M", 1), item("p1", "M", 1)],
      catalogo(peca("p1", "Camiseta", { M: 1 })),
    );
    expect(faltas).toHaveLength(1);
    expect(faltas[0]).toMatchObject({ motivo: "insuficiente", pedido: 2, disponivel: 1 });
  });

  it("não confunde tamanhos diferentes da mesma peça", () => {
    const faltas = faltasDeEstoque(
      [item("p1", "P", 1), item("p1", "M", 1)],
      catalogo(peca("p1", "Camiseta", { P: 1, M: 1 })),
    );
    expect(faltas).toEqual([]);
  });

  /**
   * Cada cor é um produto próprio: a preta esgotar não pode barrar a branca.
   * É o que garante que só a variação esgotada sai do catálogo.
   */
  it("trata cada cor do álbum como estoque independente", () => {
    const faltas = faltasDeEstoque(
      [item("preta", "M", 1), item("branca", "M", 1)],
      catalogo(
        peca("preta", "Camiseta Preta", { M: 0 }),
        peca("branca", "Camiseta Branca", { M: 4 }),
      ),
    );
    expect(faltas).toHaveLength(1);
    expect(faltas[0].id).toBe("preta");
  });

  /**
   * Cadastro antigo sem grade nenhuma continua vendendo: não há o que
   * conferir, e barrar seria tirar do ar uma peça que funciona. É a mesma
   * regra da baixa no banco, que ignora tamanho fora da peça.
   */
  it("deixa passar peça sem nenhum tamanho cadastrado", () => {
    const faltas = faltasDeEstoque([item("p1", "M", 3)], catalogo(peca("p1", "Peça antiga", {})));
    expect(faltas).toEqual([]);
  });
});

describe("mensagemDasFaltas", () => {
  it("devolve null quando a sacola inteira pode ser vendida", () => {
    expect(mensagemDasFaltas([])).toBeNull();
  });

  it("nomeia a peça e o tamanho que travou a compra", () => {
    const faltas = faltasDeEstoque(
      [item("p1", "G", 1)],
      catalogo(peca("p1", "Suéter Tricot Premium", { G: 0 })),
    );
    expect(mensagemDasFaltas(faltas)).toContain("Suéter Tricot Premium");
    expect(mensagemDasFaltas(faltas)).toContain("G");
  });

  it("concorda o verbo com a quantidade restante", () => {
    const uma = faltasDeEstoque([item("p1", "M", 2)], catalogo(peca("p1", "Camiseta", { M: 1 })));
    expect(mensagemDasFaltas(uma)).toContain("resta 1");
    const varias = faltasDeEstoque(
      [item("p1", "M", 5)],
      catalogo(peca("p1", "Camiseta", { M: 3 })),
    );
    expect(mensagemDasFaltas(varias)).toContain("restam 3");
  });
});

describe("normalizarGrade", () => {
  it("aceita o que o JSONB devolve e descarta o que não é quantidade", () => {
    expect(normalizarGrade({ P: 2, M: "3", G: -1, GG: null, "": 5 })).toEqual({
      P: 2,
      M: 3,
      G: 0,
      GG: 0,
    });
  });

  it("devolve grade vazia para conteúdo que não é objeto", () => {
    expect(normalizarGrade(null)).toEqual({});
    expect(normalizarGrade([1, 2])).toEqual({});
  });
});
