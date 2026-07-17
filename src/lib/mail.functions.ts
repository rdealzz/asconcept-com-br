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
      // Ignored server-side; values are re-derived from the database.
      total?: number;
      items?: OrderItem[];
    }
  | {
      kind: "status_update";
      to: string;
      orderId: string;
      // Ignored server-side; values are re-derived from the database.
      status?: OrderStatus;
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

export const sendTransactionalMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[mail] RESEND_API_KEY ausente — envio ignorado.");
      throw new Error("Serviço de e-mail não configurado.");
    }
    const from = process.env.MAIL_FROM || "A&S Concept <onboarding@resend.dev>";

    // Resolve caller identity server-side. Never trust client-supplied `to`
    // as authorization; it is only used for cross-check with the caller.
    const callerEmail = (context.claims?.email as string | undefined)?.toLowerCase();
    const requestedTo = data.to.trim().toLowerCase();

    const { data: isAdminRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!isAdminRow;

    let rendered: { subject: string; html: string };
    let recipient: string;

    if (data.kind === "welcome") {
      // Welcome mail may only go to the authenticated user's own address.
      if (!callerEmail || callerEmail !== requestedTo) {
        throw new Error("Não autorizado a enviar para este destinatário.");
      }
      recipient = callerEmail;
      rendered = welcomeTemplate(recipient, data.name);
    } else if (data.kind === "order_created") {
      // Load the order under the caller's RLS. Non-admins only see their own.
      const query = context.supabase
        .from("orders")
        .select("customer_email, total, items, order_number")
        .eq("order_number", data.orderId)
        .maybeSingle();
      const { data: order } = await query;
      if (!order) throw new Error("Pedido não encontrado ou acesso negado.");
      if (!isAdmin && callerEmail && order.customer_email.toLowerCase() !== callerEmail) {
        throw new Error("Não autorizado a enviar para este destinatário.");
      }
      recipient = order.customer_email;
      rendered = orderCreatedTemplate(
        recipient,
        order.order_number,
        Number(order.total ?? 0),
        (order.items as OrderItem[]) ?? [],
      );
    } else {
      // Status updates are an administrative action.
      if (!isAdmin) throw new Error("Apenas administradores podem enviar atualizações de status.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("customer_email, order_number, status, tracking_code")
        .eq("order_number", data.orderId)
        .maybeSingle();
      if (!order) throw new Error("Pedido não encontrado.");
      recipient = order.customer_email;
      rendered = statusUpdateTemplate(
        recipient,
        order.order_number,
        (order.status as OrderStatus) ?? "processing",
        order.tracking_code ?? undefined,
      );
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: rendered.subject,
        html: rendered.html,
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
