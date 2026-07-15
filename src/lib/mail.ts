/**
 * A&S Conccept — Disparo real de e-mails transacionais.
 *
 * O envio ocorre no servidor via `sendTransactionalMail` (server function
 * TanStack) que se conecta à API da Resend usando `RESEND_API_KEY`. Falhas
 * são registradas em console mas nunca interrompem a experiência do cliente.
 */
import { sendTransactionalMail } from "./mail.functions";
import type { OrderItem, OrderStatus } from "./types";

async function safeSend(payload: Parameters<typeof sendTransactionalMail>[0]["data"]) {
  try {
    await sendTransactionalMail({ data: payload });
  } catch (err) {
    console.error("[mail] disparo falhou", err);
  }
}

export async function triggerWelcomeMail(email: string, name?: string) {
  await safeSend({ kind: "welcome", to: email, name });
}

export async function triggerOrderCreatedMail(
  email: string,
  orderId: string,
  total: number,
  items: OrderItem[],
) {
  await safeSend({
    kind: "order_created",
    to: email,
    orderId,
    total,
    items,
  });
}

export async function triggerStatusUpdateMail(
  email: string,
  orderId: string,
  nextStatus: OrderStatus,
  trackingCode?: string,
) {
  await safeSend({
    kind: "status_update",
    to: email,
    orderId,
    status: nextStatus,
    trackingCode,
  });
}
