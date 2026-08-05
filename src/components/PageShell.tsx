import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  SUPPORT_EMAIL,
  WHATSAPP_DISPLAY,
  WHATSAPP_LINK,
  openWhatsApp,
} from "@/components/WhatsAppFab";
import { TrustSeals } from "@/components/TrustSeals";

/** Moldura editorial das páginas institucionais. */
export function PageShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="asc-on-dark border-b border-border bg-charcoal text-ivory">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[11px] tracking-luxe uppercase text-ivory/80 transition-colors hover:text-[color:var(--gold)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Voltar
          </Link>
          <span className="font-serif text-lg tracking-wider">
            A<span className="text-[color:var(--gold)]">&amp;</span>S Conccept
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <p className="text-[11px] tracking-luxe uppercase text-accent">{eyebrow}</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">{title}</h1>
        {intro && (
          <p className="mt-6 text-sm font-light leading-relaxed text-muted-foreground md:text-base">
            {intro}
          </p>
        )}
        <div className="mt-12 space-y-8">{children}</div>

        <div className="mt-16 border-t border-border pt-8">
          <p className="text-xs font-light text-muted-foreground">
            Dúvidas ou problemas com seu pedido? Fale conosco:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-[color:var(--gold)] underline-offset-4 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            ou WhatsApp{" "}
            <a
              href={WHATSAPP_LINK}
              onClick={openWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--gold)] underline-offset-4 hover:underline"
            >
              {WHATSAPP_DISPLAY}
            </a>
            .
          </p>
          <TrustSeals className="mt-8" />
        </div>
      </main>
    </div>
  );
}

export function Prose({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && <h2 className="mb-3 font-serif text-xl md:text-2xl">{title}</h2>}
      <div className="space-y-3 text-sm font-light leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
