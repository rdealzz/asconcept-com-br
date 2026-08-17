import { describe, expect, test } from "bun:test";
import { createManualOrderCore } from "@/lib/manual-order.server";

/**
 * A regra da venda de balcão: nasce fechada, baixa o estoque na hora, e não
 * nasce de jeito nenhum quando a peça não existe para vender.
 */

type Produto = { id: string; name: string; price: number; image: string | null; sizes: unknown };

type Cenario = {
  produtos: Produto[];
  /** Erro devolvido por cada RPC, na ordem em que ela for chamada. */
  rpc?: (nome: string) => { code?: string; message?: string } | null;
  /** O que a releitura do pedido devolve depois de uma baixa que falhou. */
  baixouMesmoAssim?: boolean;
  perfil?: { id: string } | null;
};

function fakeSupabase(c: Cenario) {
  const chamadas = {
    inserted: [] as Record<string, unknown>[],
    deleted: [] as string[],
    rpc: [] as string[],
  };

  const client = {
    from(tabela: string) {
      return {
        select() {
          return {
            in: async () => ({
              data: tabela === "products" ? c.produtos : [],
              error: null,
            }),
            eq(_coluna: string, valor: string) {
              return {
                maybeSingle: async () => ({
                  data:
                    tabela === "profiles"
                      ? (c.perfil ?? null)
                      : { order_number: valor, stock_decremented: c.baixouMesmoAssim === true },
                  error: null,
                }),
              };
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          chamadas.inserted.push(payload);
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq: async (_coluna: string, valor: string) => {
              chamadas.deleted.push(valor);
              return { error: null };
            },
          };
        },
      };
    },
    rpc: async (nome: string) => {
      chamadas.rpc.push(nome);
      return { error: c.rpc?.(nome) ?? null };
    },
  };

  return { client, chamadas };
}

const camisa: Produto = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Camisa Linho",
  price: 399,
  image: "camisa.jpg",
  sizes: { P: 2, M: 5 },
};
const bone: Produto = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Boné Clássico",
  price: 219.9,
  image: "bone.jpg",
  sizes: { Único: 1 },
};

const cliente = { customerEmail: "cliente@exemplo.com", customerName: "Cliente Balcão" };

describe("cadastro manual de pedido", () => {
  test("nasce Finalizado e baixa o estoque na mesma gravação", async () => {
    const { client, chamadas } = fakeSupabase({ produtos: [camisa] });
    const r = await createManualOrderCore(client as never, {
      ...cliente,
      items: [{ id: camisa.id, size: "P", quantity: 2, valor: 700 }],
    });

    expect(r.orderNumber).toMatch(/^AS-\d{6}$/);
    expect(r.status).toBe("Finalizado");
    expect(chamadas.inserted[0]!.status).toBe("Finalizado");
    expect(chamadas.rpc).toEqual(["consume_order_stock_strict"]);
    expect(chamadas.deleted).toEqual([]);
  });

  test("o valor negociado da linha vira preço unitário no pedido", async () => {
    const { client, chamadas } = fakeSupabase({ produtos: [camisa] });
    await createManualOrderCore(client as never, {
      ...cliente,
      items: [{ id: camisa.id, size: "M", quantity: 3, valor: 900 }],
    });

    const pedido = chamadas.inserted[0]!;
    expect((pedido.items as { price: number }[])[0]!.price).toBe(300);
    // O total é o que foi negociado, não a soma da tabela de preços.
    expect(pedido.total).toBe(900);
    expect(pedido.shipping_cost).toBe(0);
  });

  test("estoque insuficiente impede a criação e diz o motivo", async () => {
    const { client, chamadas } = fakeSupabase({ produtos: [camisa] });
    await expect(
      createManualOrderCore(client as never, {
        ...cliente,
        items: [{ id: camisa.id, size: "P", quantity: 3, valor: 900 }],
      }),
    ).rejects.toThrow(/menos do que o pedido/i);

    // Nada gravado, nada baixado: a recusa acontece antes de existir pedido.
    expect(chamadas.inserted).toEqual([]);
    expect(chamadas.rpc).toEqual([]);
  });

  test("tamanho fora da grade da peça não vira venda", async () => {
    const { client, chamadas } = fakeSupabase({ produtos: [bone] });
    await expect(
      createManualOrderCore(client as never, {
        ...cliente,
        items: [{ id: bone.id, size: "GG", quantity: 1, valor: 219.9 }],
      }),
    ).rejects.toThrow(/não está mais disponível/i);
    expect(chamadas.inserted).toEqual([]);
  });

  test("peça fora do catálogo não vira venda", async () => {
    const { client } = fakeSupabase({ produtos: [] });
    await expect(
      createManualOrderCore(client as never, {
        ...cliente,
        items: [{ id: camisa.id, size: "P", quantity: 1, valor: 399 }],
      }),
    ).rejects.toThrow(/não está mais no catálogo/i);
  });

  test("mesma peça e tamanho em duas linhas é erro de digitação, não pedido", async () => {
    const { client } = fakeSupabase({ produtos: [camisa] });
    await expect(
      createManualOrderCore(client as never, {
        ...cliente,
        items: [
          { id: camisa.id, size: "P", quantity: 1, valor: 399 },
          { id: camisa.id, size: "P", quantity: 1, valor: 399 },
        ],
      }),
    ).rejects.toThrow(/repetida/i);
  });

  test("recusa do banco apaga o pedido recém-gravado e devolve o motivo", async () => {
    const { client, chamadas } = fakeSupabase({
      produtos: [bone],
      rpc: () => ({ message: 'Estoque insuficiente: "Boné Clássico" tem 1 unidade(s)...' }),
    });
    await expect(
      createManualOrderCore(client as never, {
        ...cliente,
        items: [{ id: bone.id, size: "Único", quantity: 1, valor: 219.9 }],
      }),
    ).rejects.toThrow(/Estoque insuficiente/);

    expect(chamadas.inserted).toHaveLength(1);
    expect(chamadas.deleted).toHaveLength(1);
  });

  test("banco sem a função estrita cai na baixa de sempre", async () => {
    const { client, chamadas } = fakeSupabase({
      produtos: [camisa],
      rpc: (nome) =>
        nome === "consume_order_stock_strict"
          ? { code: "PGRST202", message: "Could not find the function" }
          : null,
    });
    const r = await createManualOrderCore(client as never, {
      ...cliente,
      items: [{ id: camisa.id, size: "M", quantity: 1, valor: 399 }],
    });

    expect(chamadas.rpc).toEqual(["consume_order_stock_strict", "consume_order_stock"]);
    expect(chamadas.deleted).toEqual([]);
    expect(r.status).toBe("Finalizado");
  });

  test("baixa que aconteceu mas não respondeu mantém o pedido de pé", async () => {
    const { client, chamadas } = fakeSupabase({
      produtos: [camisa],
      rpc: () => ({ message: "network error" }),
      baixouMesmoAssim: true,
    });
    const r = await createManualOrderCore(client as never, {
      ...cliente,
      items: [{ id: camisa.id, size: "M", quantity: 1, valor: 399 }],
    });

    expect(r.status).toBe("Finalizado");
    // Apagar aqui tiraria a peça da prateleira e da conta ao mesmo tempo.
    expect(chamadas.deleted).toEqual([]);
  });

  test("cliente com conta na loja fica dono do pedido; sem conta, ninguém fica", async () => {
    const comConta = fakeSupabase({ produtos: [camisa], perfil: { id: "user-1" } });
    await createManualOrderCore(comConta.client as never, {
      ...cliente,
      items: [{ id: camisa.id, size: "M", quantity: 1, valor: 399 }],
    });
    expect(comConta.chamadas.inserted[0]!.user_id).toBe("user-1");

    const semConta = fakeSupabase({ produtos: [camisa], perfil: null });
    await createManualOrderCore(semConta.client as never, {
      ...cliente,
      items: [{ id: camisa.id, size: "M", quantity: 1, valor: 399 }],
    });
    expect(semConta.chamadas.inserted[0]!.user_id).toBeNull();
  });

  test("e-mail inválido não chega a consultar o catálogo", async () => {
    const { client, chamadas } = fakeSupabase({ produtos: [camisa] });
    await expect(
      createManualOrderCore(client as never, {
        customerEmail: "sem-arroba",
        items: [{ id: camisa.id, size: "M", quantity: 1, valor: 399 }],
      }),
    ).rejects.toThrow(/e-mail válido/i);
    expect(chamadas.inserted).toEqual([]);
  });
});
