// Cliente server-only do Mercado Pago (Checkout API).
// Access Token de PRODUÇÃO vem dos Secrets: MP_ACCESS_TOKEN.

const MP_API = "https://api.mercadopago.com";

export function getAccessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("MP_ACCESS_TOKEN não configurado.");
  return token;
}

export type MpPayment = {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  external_reference?: string | null;
  installments?: number | null;
  payment_method_id?: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

type MpError = { message?: string; error?: string; cause?: { description?: string }[] };

function friendlyError(payload: MpError | null, fallback: string): string {
  const cause = payload?.cause?.[0]?.description;
  return cause || payload?.message || fallback;
}

export async function mpCreatePayment(
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<MpPayment> {
  const res = await fetch(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok) {
    console.error("[mp] create payment failed", res.status, text.slice(0, 500));
    throw new Error(
      friendlyError(json as MpError, "Não foi possível processar o pagamento."),
    );
  }
  return json as MpPayment;
}

export async function mpGetPayment(paymentId: string): Promise<MpPayment | null> {
  const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) {
    console.error("[mp] get payment failed", res.status, await res.text());
    return null;
  }
  return (await res.json()) as MpPayment;
}

/**
 * Mapeia o status do Mercado Pago para o status interno do pedido.
 */
export function mapMpStatus(status: string): string {
  switch (status) {
    case "approved":
      // Pagamento aprovado entra na fila de aprovação do ateliê. O avanço para
      // "Preparando pedido" é sempre manual, feito pelo admin no painel.
      return "Aguardando Aprovação";
    case "pending":
    case "in_process":
    case "authorized":
      return "Aguardando Pagamento";
    case "rejected":
    case "cancelled":
    case "refunded":
    case "charged_back":
      return "Pagamento recusado";
    default:
      return "Aguardando Pagamento";
  }
}

export function cardErrorMessage(detail: string | undefined): string {
  switch (detail) {
    case "cc_rejected_insufficient_amount":
      return "Cartão sem saldo/limite suficiente.";
    case "cc_rejected_bad_filled_security_code":
      return "Código de segurança (CVV) inválido.";
    case "cc_rejected_bad_filled_date":
      return "Data de validade inválida.";
    case "cc_rejected_bad_filled_card_number":
      return "Número do cartão inválido.";
    case "cc_rejected_call_for_authorize":
      return "Autorize o pagamento com o seu banco e tente novamente.";
    case "cc_rejected_high_risk":
      return "Pagamento recusado por segurança. Tente outro cartão ou Pix.";
    case "cc_rejected_card_disabled":
      return "Cartão desabilitado. Ative-o com o seu banco.";
    case "cc_rejected_duplicated_payment":
      return "Pagamento duplicado. Verifique se a compra já foi concluída.";
    default:
      return "Pagamento não aprovado. Tente outro cartão ou utilize o Pix.";
  }
}

/**
 * Valida a assinatura do webhook (x-signature) conforme documentação do MP.
 */
export async function verifyMpWebhook(req: Request, dataId: string): Promise<boolean> {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[mp] MP_WEBHOOK_SECRET não configurado");
    return false;
  }
  const signature = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id") ?? "";
  if (!signature) return false;

  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of signature.split(",")) {
    const [k, v] = part.split("=", 2);
    const key = k?.trim();
    if (key === "ts") ts = v?.trim();
    if (key === "v1") v1 = v?.trim();
  }
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
