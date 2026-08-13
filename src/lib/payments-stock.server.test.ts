import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PendingOrderInput } from "@/lib/payments-validators";

/**
 * A trava de estoque no caminho de compra que a loja realmente usa.
 *
 * `stock.test.ts` prova a conta; este prova a ligação — que `createPendingOrderCore`
 * de fato pergunta antes de gravar o pedido. É a diferença que importava: a
 * conta certa existia em `placeSecureOrder` (código morto) enquanto o checkout
 * do Mercado Pago não perguntava nada, e nenhum teste percebia.
 *
 * O banco é falso, mas o percurso é o de produção: o SELECT dos produtos, a
 * conferência, o INSERT do pedido. Se alguém remover a conferência, o teste
 * "não grava pedido" falha porque o INSERT acontece.
 */

const inserts: Record<string, unknown>[] = [];

// `@/lib/coupons` importa o cliente do navegador no topo, e ele arrasta o SDK do
// Supabase. Nada aqui o usa — o banco do teste é o `fakeSupabase` abaixo —,
// então basta existir para o módulo carregar.
mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from() {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push(payload);
          return { error: null };
        },
      };
    },
  },
}));

const { createPendingOrderCore } = await import("@/lib/payments-core.server");

type Peca = { id: string; name: string; price: number; image: string | null; sizes: unknown };

/**
 * O mínimo do cliente Supabase que o fluxo toca: `products` (preço e grade) e
 * `coupon_uses` (o pedido de teste não leva cupom, mas o caminho existe).
 */
function fakeSupabase(pecas: Peca[]) {
  const selects: string[] = [];
  const client = {
    from(tabela: string) {
      return {
        select(colunas: string) {
          selects.push(`${tabela}:${colunas}`);
          return {
            in: async () => ({ data: pecas, error: null }),
            eq() {
              return { eq: () => ({ maybeSingle: async () => ({ data: null }) }) };
            },
          };
        },
      };
    },
  };
  return { client, selects };
}

const CLIENTE = {
  name: "Cliente Teste",
  email: "cliente@exemplo.com",
  phone: "11999999999",
  cpf: "12345678909",
  cep: "01310100",
  logradouro: "Avenida Paulista",
  numero: "1000",
  complemento: "",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "SP",
};

const pedido = (id: string, size: string, quantity: number): PendingOrderInput => ({
  items: [{ id, size, quantity }],
  couponCode: null,
  method: "pix",
  customer: CLIENTE,
});

const SUETER: Peca = {
  id: "p1",
  name: "Suéter Tricot Premium",
  price: 349.9,
  image: null,
  sizes: { P: 2, M: 1, G: 0 },
};

beforeEach(() => {
  inserts.length = 0;
});

describe("createPendingOrderCore · trava de estoque", () => {
  test("grava o pedido quando o tamanho tem peça", async () => {
    const { client } = fakeSupabase([SUETER]);
    const r = await createPendingOrderCore(client, "user-1", pedido("p1", "P", 2));

    expect("error" in r).toBe(false);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].status).toBe("Aguardando Pagamento");
  });

  test("recusa o tamanho esgotado e não grava pedido nenhum", async () => {
    const { client } = fakeSupabase([SUETER]);
    const r = await createPendingOrderCore(client, "user-1", pedido("p1", "G", 1));

    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain("Suéter Tricot Premium");
    // O que de fato protege a loja: nenhum pedido nasceu, então não há o que
    // pagar nem estoque para baixar depois.
    expect(inserts).toHaveLength(0);
  });

  test("recusa quantidade maior do que o estoque", async () => {
    const { client } = fakeSupabase([SUETER]);
    const r = await createPendingOrderCore(client, "user-1", pedido("p1", "M", 3));

    expect((r as { error: string }).error).toContain("resta 1");
    expect(inserts).toHaveLength(0);
  });

  test("recusa tamanho fora da grade cadastrada da peça", async () => {
    const { client } = fakeSupabase([SUETER]);
    const r = await createPendingOrderCore(client, "user-1", pedido("p1", "42", 1));

    expect((r as { error: string }).error).toContain("42");
    expect(inserts).toHaveLength(0);
  });

  /**
   * Cada cor é um produto próprio. A preta esgotada não pode impedir a compra da
   * branca — é o que garante que só a variação esgotada sai do catálogo.
   */
  test("a cor esgotada não barra a cor irmã com estoque", async () => {
    const preta: Peca = { ...SUETER, id: "preta", name: "Suéter Preto", sizes: { M: 0 } };
    const branca: Peca = { ...SUETER, id: "branca", name: "Suéter Branco", sizes: { M: 5 } };
    const { client } = fakeSupabase([branca]);

    const ok = await createPendingOrderCore(client, "user-1", pedido("branca", "M", 1));
    expect("error" in ok).toBe(false);

    const { client: client2 } = fakeSupabase([preta]);
    const barrado = await createPendingOrderCore(client2, "user-1", pedido("preta", "M", 1));
    expect(barrado).toHaveProperty("error");
  });

  /** A grade tem de vir do banco: sem ela a conferência não teria o que ler. */
  test("busca a grade da peça junto com o preço, numa consulta só", async () => {
    const { client, selects } = fakeSupabase([SUETER]);
    await createPendingOrderCore(client, "user-1", pedido("p1", "P", 1));

    const produtos = selects.filter((s) => s.startsWith("products:"));
    expect(produtos).toHaveLength(1);
    expect(produtos[0]).toContain("sizes");
  });
});
