import { SUPPORT_EMAIL, WHATSAPP_DISPLAY, WHATSAPP_LINK, openWhatsApp } from "./WhatsAppFab";

/** Faixa discreta de contato para páginas sem rodapé completo. */
export function ContactStrip() {
  return (
    <div className="border-t border-border bg-secondary/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-[11px] font-light text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          Dúvidas ou problemas com seu pedido? Fale conosco:{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-foreground underline-offset-4 transition-colors hover:text-[color:var(--gold)] hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p>
          Suporte via WhatsApp:{" "}
          <a
            href={WHATSAPP_LINK}
            onClick={openWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline-offset-4 transition-colors hover:text-[color:var(--gold)] hover:underline"
          >
            {WHATSAPP_DISPLAY}
          </a>
        </p>
      </div>
    </div>
  );
}

export default ContactStrip;
