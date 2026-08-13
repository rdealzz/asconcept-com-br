/**
 * Geração do número de pedido.
 *
 * O formato `AS-` + seis dígitos é contrato: `validOrderNumber`, o painel do
 * admin e todo pedido já gravado dependem dele. O que muda aqui é COMO os seis
 * dígitos nascem.
 *
 * Dois problemas com o que havia (`Math.floor(100000 + Math.random() * 900000)`):
 *
 *  1. `Math.random()` não é aleatório para fins de segurança — é um gerador
 *     previsível a partir do estado interno do motor. Número de pedido não é
 *     senha (a leitura é barrada por `user_id`), mas adivinhar o próximo é o
 *     primeiro degrau de qualquer sondagem, e não custa nada fechar.
 *
 *  2. O sério: são 900 mil números para uma coluna `UNIQUE`. Pelo paradoxo do
 *     aniversário, a chance de colidir cresce com o número de pedidos já
 *     gravados — com mil pedidos na base, mais de um em mil pedidos novos bate
 *     num número existente. E aí o INSERT falha, o cliente lê "não foi possível
 *     registrar o pedido" e a venda se perde, sem nada de errado com ele.
 *
 * A correção é nas duas pontas: sorteio criptográfico (sem viés de módulo) e,
 * principalmente, uma nova tentativa quando o banco recusa por duplicidade.
 * A garantia de unicidade continua sendo do banco — é ele quem decide, não a
 * nossa esperança de não colidir.
 */

/** Postgres: violação de UNIQUE. */
const VIOLACAO_UNIQUE = "23505";

const MINIMO = 100000;
const FAIXA = 900000;

/**
 * Seis dígitos vindos de `crypto.getRandomValues`.
 *
 * O laço de rejeição existe para não enviesar: 2³² não é múltiplo de 900000,
 * então um `% 900000` cru tornaria os primeiros números um pouco mais
 * prováveis. Descartar a sobra deixa a distribuição uniforme. O descarte
 * acontece em menos de 0,2% dos sorteios, então o laço roda uma vez.
 */
export function gerarNumeroPedido(): string {
  const limite = Math.floor(0xffffffff / FAIXA) * FAIXA;
  const buffer = new Uint32Array(1);
  let valor = 0;
  do {
    crypto.getRandomValues(buffer);
    valor = buffer[0]!;
  } while (valor >= limite);
  return `AS-${MINIMO + (valor % FAIXA)}`;
}

/** O erro do Supabase é de duplicidade? */
export function ehNumeroDuplicado(erro: unknown): boolean {
  return (erro as { code?: string } | null)?.code === VIOLACAO_UNIQUE;
}

/**
 * Grava o pedido, sorteando um número novo a cada colisão.
 *
 * `gravar` recebe o número candidato e devolve o erro do Supabase (ou `null`
 * quando gravou). Só a duplicidade justifica outra tentativa — qualquer outro
 * erro sai na hora, porque repetir não mudaria nada.
 *
 * Cinco tentativas é teto de sobra: com a base cheia de mil pedidos, a chance
 * de cinco colisões seguidas é de uma em 10^15.
 */
export async function gravarComNumeroUnico(
  gravar: (orderNumber: string) => Promise<{ code?: string; message?: string } | null>,
  maxTentativas = 5,
): Promise<
  { ok: true; orderNumber: string } | { ok: false; erro: { code?: string; message?: string } }
> {
  let ultimoErro: { code?: string; message?: string } = {};

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    const orderNumber = gerarNumeroPedido();
    const erro = await gravar(orderNumber);

    if (!erro) return { ok: true, orderNumber };

    ultimoErro = erro;
    if (!ehNumeroDuplicado(erro)) break;

    console.warn(`[pedido] número ${orderNumber} já existia — sorteando outro`);
  }

  return { ok: false, erro: ultimoErro };
}
