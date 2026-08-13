import { describe, expect, it, beforeAll } from "bun:test";
import { verifyMpWebhook } from "./mercadopago.server";

const SEGREDO = "segredo-de-teste-do-webhook";
const PAYMENT_ID = "1234567890";
const REQUEST_ID = "req-abc-123";

beforeAll(() => {
  process.env.MP_WEBHOOK_SECRET = SEGREDO;
});

/** Assina o manifesto exatamente como o Mercado Pago assina. */
async function assinar(ts: string, dataId = PAYMENT_ID, segredo = SEGREDO): Promise<string> {
  const manifest = `id:${dataId.toLowerCase()};request-id:${REQUEST_ID};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinado = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  return Array.from(new Uint8Array(assinado))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function pedido(ts: string, opts: { v1?: string; dataId?: string } = {}): Promise<Request> {
  const v1 = opts.v1 ?? (await assinar(ts, opts.dataId ?? PAYMENT_ID));
  return new Request("https://loja.exemplo/api/public/payments/mercadopago", {
    method: "POST",
    headers: {
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": REQUEST_ID,
    },
  });
}

const agoraSegundos = () => String(Math.floor(Date.now() / 1000));
const agoraMs = () => String(Date.now());

describe("verifyMpWebhook", () => {
  it("aceita notificação recém-assinada, com carimbo em segundos", async () => {
    const ts = agoraSegundos();
    expect(await verifyMpWebhook(await pedido(ts), PAYMENT_ID)).toBe(true);
  });

  it("aceita notificação recém-assinada, com carimbo em milissegundos", async () => {
    // O MP carimba em segundos numas contas e em ms noutras. Confundir as duas
    // unidades recusaria 100% das notificações — este teste é o que impede.
    const ts = agoraMs();
    expect(await verifyMpWebhook(await pedido(ts), PAYMENT_ID)).toBe(true);
  });

  it("aceita retentativa dentro da janela de 24h", async () => {
    // O MP reenvia a cada 15 min e espaça depois da terceira tentativa,
    // repetindo o carimbo original. Recusar isso pararia a confirmação de
    // pagamento — é o risco que a janela larga existe para não correr.
    const seisHorasAtras = String(Math.floor((Date.now() - 6 * 3600_000) / 1000));
    expect(await verifyMpWebhook(await pedido(seisHorasAtras), PAYMENT_ID)).toBe(true);

    const vinteTresHoras = String(Math.floor((Date.now() - 23 * 3600_000) / 1000));
    expect(await verifyMpWebhook(await pedido(vinteTresHoras), PAYMENT_ID)).toBe(true);
  });

  it("recusa replay de notificação antiga", async () => {
    const doisDiasAtras = String(Math.floor((Date.now() - 48 * 3600_000) / 1000));
    expect(await verifyMpWebhook(await pedido(doisDiasAtras), PAYMENT_ID)).toBe(false);

    const umAnoAtras = String(Math.floor((Date.now() - 365 * 24 * 3600_000) / 1000));
    expect(await verifyMpWebhook(await pedido(umAnoAtras), PAYMENT_ID)).toBe(false);
  });

  it("recusa carimbo muito no futuro", async () => {
    const daquiADoisDias = String(Math.floor((Date.now() + 48 * 3600_000) / 1000));
    expect(await verifyMpWebhook(await pedido(daquiADoisDias), PAYMENT_ID)).toBe(false);
  });

  it("recusa carimbo ilegível", async () => {
    expect(await verifyMpWebhook(await pedido("nao-e-numero"), PAYMENT_ID)).toBe(false);
    expect(await verifyMpWebhook(await pedido("0"), PAYMENT_ID)).toBe(false);
  });

  it("continua recusando assinatura inválida — a janela não afrouxou nada", async () => {
    const ts = agoraSegundos();
    expect(await verifyMpWebhook(await pedido(ts, { v1: "deadbeef" }), PAYMENT_ID)).toBe(false);

    // Assinatura válida, mas para OUTRO pagamento: o id entra no manifesto.
    const req = await pedido(ts, { dataId: "9999999999" });
    expect(await verifyMpWebhook(req, PAYMENT_ID)).toBe(false);
  });

  it("recusa quando falta o cabeçalho de assinatura", async () => {
    const semAssinatura = new Request("https://loja.exemplo/x", { method: "POST" });
    expect(await verifyMpWebhook(semAssinatura, PAYMENT_ID)).toBe(false);
  });
});
