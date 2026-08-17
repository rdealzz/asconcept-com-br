import { describe, expect, test } from "bun:test";
import { consumesStockOnCreate, orderOrigin } from "@/lib/types";

/**
 * A origem do pedido — e, para o que já estava gravado antes da coluna, a
 * dedução. Ela decide o selo, o filtro e se o painel oferece a escada de
 * etapas; errar aqui é mostrar a venda de balcão como pedido do site.
 */
describe("origem do pedido", () => {
  test("a coluna manda, quando existe", () => {
    expect(orderOrigin({ origin: "manual", payment_method: "mp_pix" })).toBe("manual");
    expect(orderOrigin({ origin: "online", payment_method: "pix" })).toBe("online");
  });

  test("valor estranho na coluna não é acreditado — cai na dedução", () => {
    expect(orderOrigin({ origin: "sei-la", payment_method: "mp_card" })).toBe("online");
  });

  test("passou pelo Mercado Pago é da loja", () => {
    expect(orderOrigin({ payment_method: "mp_pix" })).toBe("online");
    expect(orderOrigin({ payment_method: "mp_card" })).toBe("online");
    expect(orderOrigin({ payment_method: "pix", mp_payment_id: "123" })).toBe("online");
    expect(orderOrigin({ payment_method: "pix", mp_status: "approved" })).toBe("online");
  });

  test("pedido antigo do site, de antes do Mercado Pago, é reconhecido pelo endereço", () => {
    // Este é o caso que o `payment_method` sozinho errava: "pix" aparece tanto
    // no checkout legado quanto no cadastro manual. O endereço separa os dois —
    // o formulário do painel nunca pediu um.
    expect(orderOrigin({ payment_method: "pix", address: { cep: "01310-100" } })).toBe("online");
    expect(orderOrigin({ payment_method: "boleto", address: { cep: "  " } })).toBe("manual");
  });

  test("sem marca nenhuma do site, é venda de balcão", () => {
    expect(orderOrigin({ payment_method: "pix", address: {} })).toBe("manual");
    expect(orderOrigin({})).toBe("manual");
  });
});

describe("em que status o estoque sai na gravação", () => {
  test("da preparação em diante, a peça já saiu", () => {
    expect(consumesStockOnCreate("Preparando pedido")).toBe(true);
    expect(consumesStockOnCreate("Em trânsito")).toBe(true);
    expect(consumesStockOnCreate("Entregue")).toBe(true);
    expect(consumesStockOnCreate("Finalizado")).toBe(true);
  });

  test("na fila de aprovação, o estoque espera — como no pedido do site", () => {
    expect(consumesStockOnCreate("Aguardando Aprovação")).toBe(false);
  });
});
