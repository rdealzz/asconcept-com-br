// Utilidades de frontend para o Mercado Pago (Secure Fields).
// A Public Key de produção é obtida do servidor (getMpPublicKey) para que a
// chave fique centralizada nos Secrets, sem precisar de build nova.

export const MAX_INSTALLMENTS = 12;

/**
 * Validade da cobrança Pix, em minutos.
 *
 * O padrão do Mercado Pago é 24 horas, e era isso que o contador da tela
 * mostrava — "1439:41", que além de não caber na cabeça de ninguém não criava
 * urgência nenhuma. Quinze minutos é o prazo que a loja anuncia ("Este QR Code
 * expira em 15 minutos"), então é o prazo que a cobrança precisa ter de fato:
 * um contador que zera com o QR Code ainda válido é pior que contador nenhum.
 *
 * Mora aqui, e não no módulo server-only, porque a tela também precisa do
 * número para escrever a frase.
 */
export const PIX_EXPIRATION_MINUTES = 15;

/**
 * `date_of_expiration` no formato que o Mercado Pago aceita: ISO 8601 com
 * milissegundos e deslocamento de fuso explícito. O `toISOString()` sozinho
 * termina em "Z", que a API recusa.
 */
export function pixExpirationDate(from: Date = new Date()): string {
  const alvo = new Date(from.getTime() + PIX_EXPIRATION_MINUTES * 60_000);
  return alvo.toISOString().replace("Z", "+00:00");
}

export function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function isValidCpf(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
