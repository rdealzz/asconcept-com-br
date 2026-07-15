import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  orderCreatedTemplate,
  statusUpdateTemplate,
  welcomeTemplate,
} from "./mailTemplates";
import type { OrderItem, OrderStatus } from "./types";

type MailKind =
  | { kind: "welcome"; to: string; name?: string }
  | {
      kind: "order_created";
      to: string;
      orderId: string;
      total: number;
      items: OrderItem[];
    }
  | {
      kind: "status_update";
      to: string;
      orderId: string;
      status: OrderStatus;
      trackingCode?: string;
    };

function validate(input: unknown): MailKind {
  const d = input as MailKind;
  if (!d || typeof d !== "object" || typeof d.to !== "string" || !d.to.includes("@")) {
    throw new Error("Destinatário inválido.");
  }
  if (
    d.kind !== "welcome" &&
    d.kind !== "order_created" &&
    d.kind !== "status_update"
  ) {
    throw new Error("Tipo de e-mail inválido.");
  }
  return d;
}

function render(input: MailKind): { subject: string; html: string } {
  if (input.kind === "welcome") return welcomeTemplate(input.to, input.name);
  if (input.kind === "order_created")
    return orderCreatedTemplate(input.to, input.orderId, input.total, input.items);
  return statusUpdateTemplate(input.to, input.orderId, input.status, input.trackingCode);
}

export const sendTransactionalMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[mail] RESEND_API_KEY ausente — envio ignorado.");
      throw new Error("Serviço de e-mail não configurado.");
    }
    const from =
      process.env.MAIL_FROM || "A&S Concept <onboarding@resend.dev>";

    const { subject, html } = render(data);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [data.to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[mail] Resend falhou [${res.status}]: ${body}`);
      throw new Error(`Envio de e-mail falhou (${res.status}).`);
    }

    const json = (await res.json()) as { id?: string };
    return { id: json.id ?? null };
  });
