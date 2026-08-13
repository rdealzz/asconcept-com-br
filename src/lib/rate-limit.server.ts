/**
 * Freio de abuso para os endpoints do servidor.
 *
 * Toda `createServerFn` é um endpoint HTTP de verdade: quem sabe o caminho
 * chama direto com `curl`, sem passar pela tela. Até aqui nenhum deles tinha
 * teto de chamadas — dava para pedir cobrança no cartão em laço (teste de
 * cartão roubado), encher a tabela de pedidos, ou torrar a cota da API do
 * Mercado Pago com um `for` de uma linha.
 *
 * O que este módulo é, e o que não é
 * ----------------------------------
 * É uma janela fixa em memória do processo. Não depende de Redis, KV nem
 * Durable Object — nada a provisionar, nada a manter.
 *
 * O preço disso, dito sem maquiagem: a hospedagem é Cloudflare, onde cada
 * isolate tem a sua própria memória e some quando esfria. Então o teto vale
 * por isolate, não globalmente — um atacante distribuído por muitos IPs cai
 * em isolates diferentes e cada um lhe dá uma cota nova. Isso NÃO substitui o
 * WAF/rate limit da borda, que é onde um teto global tem de morar.
 *
 * O que ele resolve de fato, e que é a maior parte do abuso real: o laço de
 * uma origem só. Esse é barato de fazer, é o que aparece em log de loja
 * pequena, e é exatamente o que a janela fixa corta.
 *
 * A memória é limitada de propósito (`MAX_CHAVES`): um contador de abuso que
 * cresce sem teto vira o próprio abuso.
 */

export type RegraLimite = {
  /** Quantas chamadas cabem na janela. */
  limite: number;
  /** Tamanho da janela, em milissegundos. */
  janelaMs: number;
};

type Balde = { contagem: number; expiraEm: number };

/**
 * Teto de chaves distintas guardadas. Passando disso, varremos o que já
 * expirou; se ainda assim estourar, sai o mais antigo (o `Map` do JS preserva
 * a ordem de inserção, então o primeiro item é o mais velho).
 */
const MAX_CHAVES = 10_000;

const baldes = new Map<string, Balde>();

function varrer(agora: number): void {
  for (const [chave, balde] of baldes) {
    if (balde.expiraEm <= agora) baldes.delete(chave);
  }
  // Ainda cheio depois da varredura: derruba os mais antigos até caber.
  while (baldes.size > MAX_CHAVES) {
    const maisVelha = baldes.keys().next();
    if (maisVelha.done) break;
    baldes.delete(maisVelha.value);
  }
}

export type ResultadoLimite = {
  ok: boolean;
  /** Segundos até a janela virar. Zero quando `ok`. */
  esperarSegundos: number;
};

/**
 * Contabiliza uma chamada e diz se ela cabe na janela.
 *
 * `agora` é injetável para o teste não depender de relógio de parede.
 */
export function consumir(
  chave: string,
  regra: RegraLimite,
  agora: number = Date.now(),
): ResultadoLimite {
  if (baldes.size >= MAX_CHAVES) varrer(agora);

  const atual = baldes.get(chave);

  if (!atual || atual.expiraEm <= agora) {
    baldes.set(chave, { contagem: 1, expiraEm: agora + regra.janelaMs });
    return { ok: true, esperarSegundos: 0 };
  }

  if (atual.contagem >= regra.limite) {
    return { ok: false, esperarSegundos: Math.ceil((atual.expiraEm - agora) / 1000) };
  }

  atual.contagem += 1;
  return { ok: true, esperarSegundos: 0 };
}

/** Só para os testes: zera o estado entre casos. */
export function zerarLimites(): void {
  baldes.clear();
}

/**
 * IP de quem chamou, do jeito que a borda entrega.
 *
 * `cf-connecting-ip` é o da Cloudflare (o alvo de build padrão deste projeto)
 * e é o único que o cliente não consegue forjar, porque a borda reescreve.
 * `x-forwarded-for` entra como reserva, sempre pelo PRIMEIRO elemento.
 *
 * Sem nenhum dos dois, devolve `null` — e quem chama decide. Nunca inventamos
 * uma chave fixa tipo "desconhecido": ela juntaria visitantes distintos no
 * mesmo balde e um deles derrubaria o outro.
 *
 * O `import` de `@tanstack/react-start/server` é dinâmico de propósito: assim
 * a contagem acima (`consumir`) continua sendo código puro, testável sem
 * levantar meio framework junto.
 */
export async function ipDoPedido(): Promise<string | null> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const headers = request?.headers;
    if (!headers) return null;

    const cloudflare = headers.get("cf-connecting-ip");
    if (cloudflare) return cloudflare.trim();

    const encaminhado = headers.get("x-forwarded-for");
    if (encaminhado) {
      const primeiro = encaminhado.split(",")[0]?.trim();
      if (primeiro) return primeiro;
    }

    const real = headers.get("x-real-ip");
    if (real) return real.trim();

    return null;
  } catch {
    // Fora de um pedido HTTP (teste, build) não há o que limitar.
    return null;
  }
}

/**
 * Aplica a regra e lança quando estoura.
 *
 * A mensagem é a que o cliente lê na tela, então fala de tempo e não de
 * "rate limit". E de propósito não conta quantas chamadas faltam: isso só
 * ajudaria quem está sondando o teto.
 */
export function exigirLimite(chave: string, regra: RegraLimite): void {
  const { ok, esperarSegundos } = consumir(chave, regra);
  if (ok) return;

  const minutos = Math.ceil(esperarSegundos / 60);
  const quando =
    esperarSegundos <= 60
      ? "Aguarde um minuto e tente novamente."
      : `Aguarde ${minutos} minutos e tente novamente.`;
  throw new Error(`Muitas tentativas em pouco tempo. ${quando}`);
}

/**
 * Regra por usuário autenticado. O id do usuário vem do JWT conferido pelo
 * middleware, então não dá para trocar de balde sem trocar de conta — que é
 * justamente o custo que queremos impor.
 */
export function exigirLimitePorUsuario(acao: string, userId: string, regra: RegraLimite): void {
  exigirLimite(`u:${acao}:${userId}`, regra);
}

/**
 * Regra por IP, para o que não exige login.
 *
 * Sem IP identificável a chamada passa: preferimos deixar passar a juntar
 * gente diferente no mesmo balde e derrubar visitante legítimo. O endpoint
 * que depende disso também tem teto próprio do outro lado (ver o cache
 * limitado em `installments.server.ts`).
 */
export async function exigirLimitePorIp(acao: string, regra: RegraLimite): Promise<void> {
  const ip = await ipDoPedido();
  if (!ip) return;
  exigirLimite(`ip:${acao}:${ip}`, regra);
}
