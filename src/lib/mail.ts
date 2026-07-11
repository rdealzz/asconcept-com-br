/**
 * A&S Conccept — Motor de e-mails transacionais.
 *
 * Envios reais devem ser feitos por um endpoint server-side (server function
 * ou edge function) que leia a chave do provedor (Resend/SendGrid) a partir
 * de um segredo do servidor. Nunca embutir chaves de provedor no bundle do
 * cliente: qualquer variável com prefixo `VITE_` é publicada no JS público.
 *
 * Enquanto o envio server-side não estiver implementado, esta camada apenas
 * registra o payload no console do navegador (simulação).
 */
import {
  orderCreatedTemplate,
  statusUpdateTemplate,
  welcomeTemplate,
} from "./mailTemplates";
import type { OrderItem, OrderStatus } from "./types";

type EnvLike = Record<string, string | undefined>;

const env: EnvLike =
  typeof import.meta !== "undefined" && (import.meta as { env?: EnvLike }).env
    ? ((import.meta as { env?: EnvLike }).env ?? {})
    : {};

// Apenas o "de" pode ser público (aparece no cabeçalho do e-mail). Nunca leia
// chaves de API neste arquivo — ele executa no navegador.
const FROM = env.VITE_MAIL_FROM || "A&S Conccept <ateliê@asconcept.com.br>";

type MailPayload = { to: string; subject: string; html: string };

async function deliver(payload: MailPayload) {
  logSimulated(payload, "console");
}

function logSimulated(payload: MailPayload, tag: string) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `%c✦ A&S Mail (${tag})%c → ${payload.to} · ${payload.subject}`,
    "color:#B8944F;font-weight:600;letter-spacing:0.14em;",
    "color:#141B2E;",
  );
  // eslint-disable-next-line no-console
  console.log("De:", FROM);
  // eslint-disable-next-line no-console
  console.log("Para:", payload.to);
  // eslint-disable-next-line no-console
  console.log("Assunto:", payload.subject);
  // eslint-disable-next-line no-console
  console.log("HTML:", payload.html);
  // eslint-disable-next-line no-console
  console.groupEnd();
}

export async function triggerWelcomeMail(email: string, name?: string) {
  const { subject, html } = welcomeTemplate(email, name);
  await deliver({ to: email, subject, html });
}

export async function triggerOrderCreatedMail(
  email: string,
  orderId: string,
  total: number,
  items: OrderItem[],
) {
  const { subject, html } = orderCreatedTemplate(email, orderId, total, items);
  await deliver({ to: email, subject, html });
}

export async function triggerStatusUpdateMail(
  email: string,
  orderId: string,
  nextStatus: OrderStatus,
  trackingCode?: string,
) {
  const { subject, html } = statusUpdateTemplate(
    email,
    orderId,
    nextStatus,
    trackingCode,
  );
  await deliver({ to: email, subject, html });
}
