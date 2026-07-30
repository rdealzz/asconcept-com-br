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
        (order.items as unknown as OrderItem[]) ?? [],
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

    // Entrega via infraestrutura de e-mails do Cloud (domínio verificado
    // notify.asconccept.com.br). A mensagem é enfileirada e processada com
    // retentativas automáticas pelo processador de fila.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const messageId = crypto.randomUUID();

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: data.kind,
      recipient_email: recipient,
      status: "pending",
    });

    const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: recipient,
        from: "A&S Conccept <noreply@asconccept.com.br>",
        sender_domain: "notify.asconccept.com.br",
        subject: rendered.subject,
        html: rendered.html,
        purpose: "transactional",
        label: data.kind,
        idempotency_key: `${data.kind}:${recipient}:${
          data.kind === "welcome" ? "welcome" : data.orderId
        }`,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error("[mail] falha ao enfileirar e-mail");
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: data.kind,
        recipient_email: recipient,
        status: "failed",
        error_message: "Failed to enqueue email",
      });
      throw new Error("Envio de e-mail falhou.");
    }

    return { id: messageId };
  });
