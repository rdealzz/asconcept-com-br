/**
 * A&S Concept — Motor de e-mails transacionais.
 *
 * Por padrão simula os envios imprimindo o payload no console do desenvolvedor.
 * A estrutura já está pronta para receber chaves reais (Resend/SendGrid) — basta
 * definir as variáveis de ambiente e ligar `MAIL_PROVIDER` para "resend" ou "sendgrid".
 */
import {
  orderCreatedTemplate,
  statusUpdateTemplate,
  welcomeTemplate,
} from "./mailTemplates";
import type { OrderItem, OrderStatus } from "./types";

type MailProvider = "console" | "resend" | "sendgrid";
type EnvLike = Record<string, string | undefined>;

const env: EnvLike =
  typeof import.meta !== "undefined" && (import.meta as { env?: EnvLike }).env
    ? ((import.meta as { env?: EnvLike }).env ?? {})
    : {};

const PROVIDER = (env.VITE_MAIL_PROVIDER as MailProvider) || "console";
const FROM = env.VITE_MAIL_FROM || "A&S Concept <ateliê@asconcept.com.br>";

type MailPayload = { to: string; subject: string; html: string };

async function deliver(payload: MailPayload) {
  if (PROVIDER === "resend") {
    const key = env.VITE_RESEND_API_KEY;
    if (!key) return logSimulated(payload, "resend (chave ausente — simulação)");
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
        }),
      });
      if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
    } catch (e) {
      console.warn("[A&S mail] Falha no Resend, caindo para simulação:", e);
      logSimulated(payload, "resend (fallback)");
    }
    return;
  }

  if (PROVIDER === "sendgrid") {
    const key = env.VITE_SENDGRID_API_KEY;
    if (!key) return logSimulated(payload, "sendgrid (chave ausente — simulação)");
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.to }] }],
          from: { email: FROM },
          subject: payload.subject,
          content: [{ type: "text/html", value: payload.html }],
        }),
      });
      if (!res.ok) throw new Error(`SendGrid HTTP ${res.status}`);
    } catch (e) {
      console.warn("[A&S mail] Falha no SendGrid, caindo para simulação:", e);
      logSimulated(payload, "sendgrid (fallback)");
    }
    return;
  }

  logSimulated(payload, "console");
}

function logSimulated(payload: MailPayload, tag: string) {
  if (typeof window === "undefined") return;
  // Log estruturado para o console do desenvolvedor
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
