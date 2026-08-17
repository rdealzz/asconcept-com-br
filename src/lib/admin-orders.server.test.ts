import { describe, expect, mock, test, beforeEach } from "bun:test";

/**
 * Testa a regra de negócio do avanço de status: quem pode avançar para onde, e
 * em que ponto exato o estoque baixa.
 */

const emails: { kind: string; to: string }[] = [];
mock.module("@/lib/order-email.server", () => ({
  enqueueOrderEmail: async (_c: unknown, kind: string, to: string) => {
    emails.push({ kind, to });
  },
}));

const { updateAdminOrderStatusCore } = await import("@/lib/admin-orders.server");

type Pedido = Record<string, unknown>;

function fakeSupabase(pedido: Pedido) {
  const chamadas = { updates: [] as Record<string, unknown>[], rpc: [] as string[] };
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: pedido, error: null }) };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          chamadas.updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
    rpc: async (nome: string) => {
      chamadas.rpc.push(nome);
      return { error: null };
    },
  };
  return { client, chamadas };
}

const base = {
  order_number: "AS-100001",
  customer_email: "cliente@exemplo.com",
  customer_name: "Cliente",
  tracking_code: null,
  total: 990,
  items: [],
  stock_decremented: false,
  mail_sent: false,
  preparation_mail_sent: false,
  shipped_mail_sent: false,
  delivered_mail_sent: false,
};

beforeEach(() => {
  emails.length = 0;
});

describe("avanço de status do pedido", () => {
  test("aprovar (Aguardando Aprovação → Preparando pedido) baixa o estoque e avisa o cliente", async () => {
    const { client, chamadas } = fakeSupabase({ ...base, status: "Aguardando Aprovação" });
    await updateAdminOrderStatusCore(client as never, {
      orderNumber: "AS-100001",
      status: "Preparando pedido",
    });
    expect(chamadas.rpc).toEqual(["consume_order_stock"]);
    expect(emails.map((e) => e.kind)).toContain("pedido-em-preparacao");
  });

  test("pedido já com estoque baixado não baixa de novo", async () => {
    const { client, chamadas } = fakeSupabase({
      ...base,
      status: "Aguardando Aprovação",
      stock_decremented: true,
    });
    await updateAdminOrderStatusCore(client as never, {
      orderNumber: "AS-100001",
      status: "Preparando pedido",
    });
    expect(chamadas.rpc).toEqual([]);
  });

  test("pedido sem pagamento NÃO pode ir direto para Preparando pedido", async () => {
    const { client, chamadas } = fakeSupabase({ ...base, status: "Aguardando Pagamento" });
    await expect(
      updateAdminOrderStatusCore(client as never, {
        orderNumber: "AS-100001",
        status: "Preparando pedido",
      }),
    ).rejects.toThrow(/ainda não foi pago/i);
    expect(chamadas.rpc).toEqual([]);
    expect(chamadas.updates).toEqual([]);
  });

  test("confirmar pagamento na mão leva à fila de aprovação, sem tocar no estoque", async () => {
    const { client, chamadas } = fakeSupabase({ ...base, status: "Aguardando Pagamento" });
    await updateAdminOrderStatusCore(client as never, {
      orderNumber: "AS-100001",
      status: "Aguardando Aprovação",
    });
    expect(chamadas.rpc).toEqual([]);
    expect(emails.map((e) => e.kind)).toEqual(["pedido-confirmado"]);
  });

  test("não dá para pular etapa", async () => {
    const { client } = fakeSupabase({ ...base, status: "Aguardando Aprovação" });
    await expect(
      updateAdminOrderStatusCore(client as never, {
        orderNumber: "AS-100001",
        status: "Entregue",
      }),
    ).rejects.toThrow(/uma etapa por vez/i);
  });

  test("não dá para retroceder", async () => {
    const { client } = fakeSupabase({ ...base, status: "Em trânsito" });
    await expect(
      updateAdminOrderStatusCore(client as never, {
        orderNumber: "AS-100001",
        status: "Preparando pedido",
      }),
    ).rejects.toThrow(/retroceder/i);
  });

  test("venda de balcão não avança nem volta — e não baixa estoque de novo", async () => {
    const { client, chamadas } = fakeSupabase({
      ...base,
      status: "Finalizado",
      stock_decremented: true,
    });
    await expect(
      updateAdminOrderStatusCore(client as never, {
        orderNumber: "AS-100001",
        status: "Aguardando Aprovação",
      }),
    ).rejects.toThrow(/venda concluída/i);
    expect(chamadas.rpc).toEqual([]);
    expect(chamadas.updates).toEqual([]);
  });

  test("pagamento recusado também só volta pela confirmação manual", async () => {
    const { client } = fakeSupabase({ ...base, status: "Pagamento recusado" });
    await expect(
      updateAdminOrderStatusCore(client as never, {
        orderNumber: "AS-100001",
        status: "Em trânsito",
      }),
    ).rejects.toThrow(/ainda não foi pago/i);
  });
});
