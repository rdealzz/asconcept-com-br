/**
 * Comparação de segredo em tempo constante.
 *
 * `a === b` entre strings sai no primeiro byte diferente. O tempo da resposta,
 * então, conta quantos caracteres iniciais o palpite acertou — e com respostas
 * suficientes dá para descobrir o segredo caractere a caractere, sem nunca
 * tê-lo visto.
 *
 * Este laço percorre sempre o comprimento inteiro, sem `break` e sem saída
 * antecipada, acumulando as diferenças num só acumulador. O trabalho é o mesmo
 * quer o primeiro byte diferente esteja no começo ou no fim.
 *
 * A diferença de COMPRIMENTO também entra no acumulador (em vez de virar um
 * `return false` na frente): sair cedo por tamanho devolveria de graça o
 * comprimento do segredo.
 *
 * Existe versão nativa disso (`crypto.timingSafeEqual` do Node), mas ela não é
 * garantida no runtime da Cloudflare, que é onde este código roda. Este laço
 * não depende de nada.
 */
export function segredosIguais(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const codificador = new TextEncoder();
  const bytesA = codificador.encode(a);
  const bytesB = codificador.encode(b);

  let diferenca = bytesA.length ^ bytesB.length;
  const maior = Math.max(bytesA.length, bytesB.length);

  for (let i = 0; i < maior; i++) {
    diferenca |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }

  return diferenca === 0;
}
