import type { OrderItem, OrderStatus } from "./types";

const BRAND = {
  ivory: "#FDFBF7",
  charcoal: "#1F1F22",
  navy: "#141B2E",
  gold: "#B8944F",
};

const shell = (title: string, preheader: string, inner: string) => `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.ivory};font-family:'Inter',Arial,sans-serif;color:${BRAND.charcoal};">
    <span style="display:none;opacity:0;visibility:hidden;height:0;width:0;font-size:1px;line-height:1px;color:${BRAND.ivory};">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.ivory};">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E9E4D6;">
            <tr>
              <td style="padding:32px 40px;border-bottom:1px solid #E9E4D6;text-align:center;">
                <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;letter-spacing:0.35em;color:${BRAND.charcoal};">A&amp;S CONCCEPT</div>
                <div style="margin-top:6px;font-size:10px;letter-spacing:0.32em;color:${BRAND.gold};text-transform:uppercase;">The New Era of Heritage</div>
              </td>
            </tr>
            <tr>
              <td style="padding:40px;">${inner}</td>
            </tr>
            <tr>
              <td style="padding:24px 40px;border-top:1px solid #E9E4D6;text-align:center;font-size:11px;color:#7A7568;letter-spacing:0.14em;">
                A&amp;S Conccept · Curitiba/PR · Brasil<br />
                <span style="color:${BRAND.gold};">✦</span> Este e-mail foi enviado porque você realizou uma ação em nossa boutique digital.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function welcomeTemplate(email: string, name?: string) {
  const display = name || email.split("@")[0];
  const inner = `
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:28px;line-height:1.2;margin:0 0 12px;color:${BRAND.charcoal};">
      Bem-vindo(a) ao Círculo A&amp;S
    </h1>
    <p style="font-size:14px;line-height:1.7;color:${BRAND.charcoal};margin:0 0 16px;">
      Prezado(a) <strong>${escapeHtml(display)}</strong>,
    </p>
    <p style="font-size:14px;line-height:1.7;color:${BRAND.charcoal};margin:0 0 20px;">
      É com imenso prazer que damos boas-vindas à A&amp;S Conccept — uma casa dedicada à alfaiataria contemporânea
      e à herança do bom gosto. Sua conta está ativa e pronta para acompanhar as edições limitadas da temporada.
    </p>
    <div style="margin:28px 0;padding:20px;border:1px solid ${BRAND.gold};background:${BRAND.ivory};">
      <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${BRAND.gold};">Benefício de estreia</div>
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:18px;margin-top:6px;color:${BRAND.charcoal};">
        Frete cortesia acima de R$ 249,99
      </div>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#57534E;margin:0;">
      Com apreço,<br />
      <em style="font-family:'Playfair Display',Georgia,serif;color:${BRAND.navy};">Ateliê A&amp;S</em>
    </p>`;
  return {
    subject: "Bem-vindo(a) à A&S Conccept",
    html: shell("Bem-vindo à A&S Conccept", `Olá ${display}, sua conta A&S está ativa.`, inner),
  };
}

export function orderCreatedTemplate(
  email: string,
  orderId: string,
  total: number,
  items: OrderItem[],
) {
  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #F0EBDD;font-size:13px;color:${BRAND.charcoal};">
          ${escapeHtml(i.name)}
          <div style="font-size:11px;color:#8B8578;margin-top:2px;">Tam. ${escapeHtml(i.size)} · ${i.quantity}x</div>
        </td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid #F0EBDD;font-size:13px;color:${BRAND.charcoal};white-space:nowrap;">
          ${brl(i.price * i.quantity)}
        </td>
      </tr>`,
    )
    .join("");
  const inner = `
    <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${BRAND.gold};">Pedido recebido</div>
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:26px;margin:6px 0 20px;color:${BRAND.charcoal};">
      Obrigado pela sua compra
    </h1>
    <p style="font-size:13px;line-height:1.7;color:${BRAND.charcoal};margin:0 0 12px;">
      Seu pedido <strong style="font-family:monospace;color:${BRAND.navy};">${escapeHtml(orderId)}</strong>
      está agora com o status <strong>Aguardando Aprovação</strong> e será avaliado pelo nosso ateliê em instantes.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      ${rows}
      <tr>
        <td style="padding:16px 0 4px;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#57534E;">Total</td>
        <td align="right" style="padding:16px 0 4px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${BRAND.charcoal};">
          ${brl(total)}
        </td>
      </tr>
    </table>
    <p style="font-size:12px;line-height:1.6;color:#57534E;margin:28px 0 0;">
      Você receberá novas notificações a cada avanço do pedido — do preparo à entrega.
    </p>`;
  return {
    subject: `Pedido ${orderId} confirmado — A&S Conccept`,
    html: shell(
      "Confirmação de pedido — A&S Conccept",
      `Pedido ${orderId} confirmado · ${brl(total)}`,
      inner,
    ),
  };
}

export function statusUpdateTemplate(
  email: string,
  orderId: string,
  nextStatus: OrderStatus,
  trackingCode?: string,
) {
  const copy: Record<OrderStatus, string> = {
    "Aguardando Aprovação":
      "Seu pedido está aguardando aprovação e será avaliado pelo nosso ateliê em instantes.",
    "Preparando pedido":
      "Nosso ateliê está preparando cuidadosamente cada peça do seu pedido.",
    "Em trânsito":
      "Suas peças partiram do ateliê e estão a caminho do endereço informado.",
    Entregue: "Seu pedido foi entregue. Que seja vestido com prazer.",
  };
  const trackBlock = trackingCode
    ? `<div style="margin:24px 0;padding:16px;border:1px dashed ${BRAND.gold};background:${BRAND.ivory};">
        <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${BRAND.gold};">Código de rastreio</div>
        <div style="font-family:monospace;font-size:18px;letter-spacing:0.12em;margin-top:6px;color:${BRAND.navy};">
          ${escapeHtml(trackingCode)}
        </div>
      </div>`
    : "";
  const inner = `
    <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${BRAND.gold};">Atualização do pedido</div>
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:26px;margin:6px 0 12px;color:${BRAND.charcoal};">
      ${escapeHtml(nextStatus)}
    </h1>
    <p style="font-size:13px;line-height:1.7;color:${BRAND.charcoal};margin:0 0 8px;">
      Pedido <strong style="font-family:monospace;color:${BRAND.navy};">${escapeHtml(orderId)}</strong>
    </p>
    <p style="font-size:14px;line-height:1.7;color:${BRAND.charcoal};margin:0;">
      ${escapeHtml(copy[nextStatus])}
    </p>
    ${trackBlock}
    <p style="font-size:12px;line-height:1.6;color:#57534E;margin:28px 0 0;">
      Acesse a seção <em>Meus Pedidos</em> para visualizar todos os detalhes.
    </p>`;
  return {
    subject: `Pedido ${orderId} — ${nextStatus}`,
    html: shell(
      `Atualização do pedido ${orderId}`,
      `Status: ${nextStatus}`,
      inner,
    ),
  };
}
