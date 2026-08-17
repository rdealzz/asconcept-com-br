/**
 * Cadastro manual de pedido — a venda que já aconteceu.
 *
 * Feira, WhatsApp, balcão: o cliente levou a peça e pagou antes de alguém abrir
 * o painel. Na maior parte das vezes o formulário não está criando uma venda,
 * está registrando uma — e é por isso que ele nasce em "Finalizado":
 *
 *   1. **não há etapa a cumprir** — nem pagamento a confirmar, nem separação,
 *      nem envio a rastrear. Fazer a venda de balcão desfilar pelo fluxo do
 *      ateliê era encenação: quatro cliques para chegar onde ela já estava
 *      quando foi cadastrada;
 *   2. **o estoque cai na hora** — a peça saiu da prateleira de verdade. Enquanto
 *      a baixa dependia da aprovação no painel, a loja continuava oferecendo o
 *      que já tinha sido vendido até alguém lembrar de avançar o status.
 *
 * O status inicial, porém, é escolha de quem cadastra. Encomenda combinada por
 * WhatsApp que ainda vai ser preparada e enviada nasce em "Aguardando
 * Aprovação" e percorre o mesmo fluxo de um pedido do site — inclusive o ponto
 * da baixa, que continua sendo a aprovação. Quem decide não é este módulo: é o
 * status escolhido (ver `consumesStockOnCreate`).
 *
 * Quando a baixa acontece aqui, a conferência vira barreira: pedido que não
 * cabe no estoque não é gravado, e o admin lê o porquê. No checkout do site a
 * regra é outra de propósito — lá o cliente já pagou, e a baixa grampeia em
 * zero com aviso em vez de recusar.
 *
 * Nada disto alcança pedido manual antigo: eles ficam com o status que têm e o
 * estoque não é recalculado para trás.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { gravarComNumeroUnico } from "@/lib/order-number.server";
import { conferirComPecas } from "@/lib/stock.server";
import { consumesStockOnCreate, FINAL_STATUS, type FlowStatus } from "@/lib/types";

/** Uma peça do pedido, como o formulário do painel a entrega. */
export type ItemManual = {
  /** `products.id`. Cada cor é uma peça inteira, então isto já é a variação. */
  id: string;
  size: string;
  quantity: number;
  /** Valor negociado da linha inteira — com a quantidade dentro, não o unitário. */
  valor: number;
};

export type PedidoManualInput = {
  customerEmail: string;
  customerName?: string;
  items: ItemManual[];
  /**
   * Onde a venda começa. "Finalizado" é o caso comum — a peça já saiu com o
   * cliente. Nascendo em "Aguardando Aprovação", o pedido entra no fluxo do
   * ateliê como um pedido do site e o estoque espera a aprovação.
   */
  status?: FlowStatus;
};

export type PedidoManualResult = {
  ok: true;
  orderNumber: string;
  status: FlowStatus;
  /** O estoque saiu agora, na gravação? */
  stockConsumed: boolean;
  total: number;
};

type LinhaProduto = {
  id: string;
  name: string;
  price: number | string;
  image: string | null;
  sizes: unknown;
};

/** Centavos redondos: evita `379.99000000000005` gravado no pedido. */
const emCentavos = (n: number) => Math.round(n * 100) / 100;

/**
 * A função de baixa estrita mora numa migração posterior ao resto deste código.
 * Enquanto ela não roda no banco, a baixa acontece pela função de sempre — a
 * conferência em JS, logo acima, já barrou o que não cabia; o que se perde é
 * só a trava contra a venda simultânea da última peça.
 */
function funcaoInexistente(erro: unknown): boolean {
  const e = erro as { code?: string; message?: string } | null;
  const msg = e?.message ?? "";
  return (
    // PostgREST não achou a rotina no cache do schema; Postgres não achou a
    // função. O texto só entra como reserva, e amarrado ao nome da função:
    // um "does not exist" solto casaria também com "relation ... does not
    // exist", e aí um banco quebrado viraria baixa pela função frouxa.
    e?.code === "PGRST202" ||
    e?.code === "42883" ||
    /could not find the function/i.test(msg) ||
    /consume_order_stock_strict[^\n]*does not exist/i.test(msg)
  );
}

/** A recusa vinda do banco, quando ela é a que o admin precisa ler. */
function mensagemDoBanco(erro: unknown): string | null {
  const msg = (erro as { message?: string } | null)?.message ?? "";
  return msg.includes("Estoque insuficiente") ? msg : null;
}

async function chamarRpc(supabaseAdmin: SupabaseClient, nome: string, orderNumber: string) {
  return ((await (
    supabaseAdmin.rpc as unknown as (
      n: string,
      a: Record<string, unknown>,
    ) => Promise<{ error: unknown }>
  )(nome, { _order_number: orderNumber })) ?? { error: null }) as { error: unknown };
}

/**
 * O registro da venda no log do servidor.
 *
 * O rastro detalhado é do banco — `stock_ledger` guarda item a item, e
 * `admin_notifications` avisa o que esgotou. Esta linha é a que amarra as duas
 * pontas para quem lê o log depois: pedido tal, tantas peças, com que status
 * nasceu e se o estoque saiu junto.
 */
function concluir(
  orderNumber: string,
  pecas: number,
  total: number,
  status: FlowStatus,
  stockConsumed: boolean,
): PedidoManualResult {
  console.info(
    `[admin] venda manual ${orderNumber} registrada: ${pecas} peça(s), status ${status}, estoque ${
      stockConsumed ? "baixado na gravação" : "pendente da aprovação"
    }`,
  );
  return { ok: true, orderNumber, status, stockConsumed, total };
}

/** Erro de coluna que ainda não existe no banco (`undefined_column`). */
function colunaInexistente(erro: unknown): boolean {
  const e = erro as { code?: string; message?: string } | null;
  return e?.code === "42703" || e?.code === "PGRST204" || /'origin' column/i.test(e?.message ?? "");
}

/**
 * Registra a venda e baixa o estoque, ou não registra nada.
 *
 * A ordem é gravar e então baixar, porque a baixa trabalha sobre um pedido
 * gravado (é ela quem escreve o livro de movimentos e os avisos, sempre
 * amarrados a um número de pedido). Se a baixa recusar, o pedido recém-gravado
 * é apagado: melhor não existir do que existir como venda que não saiu do
 * estoque.
 */
export async function createManualOrderCore(
  supabaseAdmin: SupabaseClient,
  input: PedidoManualInput,
): Promise<PedidoManualResult> {
  const email = input.customerEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Informe um e-mail válido.");

  const items = input.items ?? [];
  if (!items.length) throw new Error("O pedido precisa de ao menos uma peça.");

  // Mesma peça no mesmo tamanho em duas linhas viraria item repetido no pedido,
  // e quem lê a nota não sabe se são duas peças ou erro de digitação. O
  // separador é o mesmo de `@/lib/stock`, escrito como escape e não como byte
  // cru: com o byte literal no arquivo, o git trata o módulo como binário e
  // para de mostrar diferenças.
  const chaves = items.map((i) => `${i.id}\u0000${i.size}`);
  if (new Set(chaves).size !== chaves.length) {
    throw new Error("A mesma peça no mesmo tamanho está repetida — some na quantidade.");
  }

  const ids = Array.from(new Set(items.map((i) => i.id)));
  const { data: rows, error: fetchErr } = await supabaseAdmin
    .from("products")
    .select("id, name, price, image, sizes")
    .in("id", ids);
  if (fetchErr) throw new Error("Não foi possível conferir as peças. Tente de novo.");

  const linhas = (rows ?? []) as unknown as LinhaProduto[];
  const pecas = new Map<string, LinhaProduto>(linhas.map((r) => [r.id, r]));
  if (pecas.size !== ids.length) {
    throw new Error(
      "Uma das peças não está mais no catálogo. Atualize a página e refaça o pedido.",
    );
  }

  // A conferência é a mesma do checkout (`@/lib/stock`), contra o estoque lido
  // agora — e não contra o que o navegador do admin tinha em memória.
  const semEstoque = conferirComPecas(
    items.map((i) => ({ id: i.id, size: i.size, quantity: i.quantity })),
    linhas,
  );
  if (semEstoque) throw new Error(semEstoque);

  const orderItems = items.map((i) => {
    const p = pecas.get(i.id)!;
    return {
      id: i.id,
      name: p.name,
      // A tela negocia o valor da peça inteira; o pedido guarda o unitário.
      price: emCentavos(i.valor / Math.max(1, i.quantity)),
      image: p.image ?? "",
      quantity: i.quantity,
      size: i.size,
    };
  });
  const total = emCentavos(items.reduce((acc, i) => acc + i.valor, 0));

  // Quando o cliente do balcão também tem conta na loja, o pedido fica no
  // histórico dele — é o mesmo e-mail, e "Meus Pedidos" lê por `user_id`. Sem
  // conta, o pedido não é de ninguém no Auth e vive só no painel.
  const { data: perfil } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  const status: FlowStatus = input.status ?? FINAL_STATUS;
  const baixaAgora = consumesStockOnCreate(status);

  const payload = {
    user_id: (perfil as { id?: string } | null)?.id ?? null,
    customer_email: email,
    customer_name: input.customerName?.trim() || null,
    items: orderItems,
    address: {},
    shipping_cost: 0,
    subtotal: total,
    total,
    payment_method: "pix",
    status,
    discount: 0,
  };

  // A origem é gravada quando a coluna existe; sem ela o app deduz pela leitura
  // (ver `orderOrigin`). O laço não é capricho: mandar uma coluna que o banco
  // não tem derruba o INSERT inteiro, e a venda de balcão pararia de funcionar
  // só porque a migração ainda não rodou.
  let comOrigem = true;
  const gravacao = await gravarComNumeroUnico(async (orderNumber) => {
    const linha = {
      ...payload,
      order_number: orderNumber,
      ...(comOrigem ? { origin: "manual" } : {}),
    };
    const { error } = await supabaseAdmin.from("orders").insert(linha as never);
    if (error && comOrigem && colunaInexistente(error)) {
      console.warn("[admin] coluna orders.origin ausente — rode a migração de origem do pedido");
      comOrigem = false;
      const { error: erroSemOrigem } = await supabaseAdmin
        .from("orders")
        .insert({ ...payload, order_number: orderNumber } as never);
      return erroSemOrigem as { code?: string; message?: string } | null;
    }
    return error as { code?: string; message?: string } | null;
  });
  if (!gravacao.ok) {
    // A mensagem do Postgres descreve tabela, coluna e constraint — mapa do
    // banco. Fica no log; a tela recebe uma frase.
    console.error("[admin] falha ao gravar pedido manual", gravacao.erro);
    throw new Error("Não foi possível registrar o pedido.");
  }
  const { orderNumber } = gravacao;

  // Nascendo antes da aprovação, o pedido segue o fluxo do site: o estoque
  // espera o admin avançar para "Preparando pedido", que é onde a baixa mora
  // para todo mundo. A conferência acima já garantiu que a peça existe hoje.
  if (!baixaAgora) return concluir(orderNumber, orderItems.length, total, status, false);

  let { error } = await chamarRpc(supabaseAdmin, "consume_order_stock_strict", orderNumber);
  if (error && funcaoInexistente(error)) {
    console.warn(
      "[admin] consume_order_stock_strict ainda não existe no banco — baixando pela função de sempre",
    );
    ({ error } = await chamarRpc(supabaseAdmin, "consume_order_stock", orderNumber));
  }

  if (error) {
    // A resposta pode ter se perdido depois de a baixa acontecer. Antes de
    // apagar o pedido, pergunta ao banco o que de fato ficou gravado: apagar um
    // pedido cujo estoque já saiu tiraria a peça da prateleira e da conta.
    const { data: gravado } = await supabaseAdmin
      .from("orders")
      .select("stock_decremented")
      .eq("order_number", orderNumber)
      .maybeSingle();
    if ((gravado as { stock_decremented?: boolean } | null)?.stock_decremented === true) {
      return concluir(orderNumber, orderItems.length, total, status, true);
    }

    const { error: erroAoApagar } = await supabaseAdmin
      .from("orders")
      .delete()
      .eq("order_number", orderNumber);

    const recusa = mensagemDoBanco(error);
    if (!recusa) console.error(`[admin] baixa de estoque recusada no pedido ${orderNumber}`, error);

    // Recusa que não pôde ser desfeita: o pedido ficou gravado sem baixa. Dizer
    // "não foi registrado" aqui seria mentira — e uma mentira que esconde uma
    // linha de venda no painel.
    if (erroAoApagar) {
      console.error(
        `[admin] pedido ${orderNumber} ficou gravado sem baixa de estoque — precisa ser excluído à mão`,
        erroAoApagar,
      );
      throw new Error(
        `${recusa ?? "O estoque não pôde ser baixado."} O pedido ${orderNumber} ficou gravado sem baixa — exclua-o na lista antes de tentar de novo.`,
      );
    }

    throw new Error(
      recusa ?? "O estoque não pôde ser baixado, então o pedido não foi registrado. Tente de novo.",
    );
  }

  return concluir(orderNumber, orderItems.length, total, status, true);
}
