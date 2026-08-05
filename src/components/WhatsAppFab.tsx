export const WHATSAPP_NUMBER = "5541999964035";
export const WHATSAPP_DISPLAY = "(41) 99996-4035";
export const SUPPORT_EMAIL = "asconccept@gmail.com";

/**
 * Link de conversa do WhatsApp.
 *
 * Formato internacional só com dígitos: 55 (Brasil) + 41 (DDD) + o número.
 * A mensagem já vai preenchida para a conversa começar com contexto.
 */
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Olá! Vim pelo site da A&S Conccept e gostaria de falar sobre uma peça.",
)}`;

/**
 * Abre o WhatsApp de forma confiável.
 *
 * Navegadores embutidos de aplicativo (Instagram, Facebook, TikTok) — de onde
 * vem boa parte do tráfego de uma loja de roupa — costumam engolir
 * `target="_blank"`, e o toque simplesmente não fazia nada. Aqui a abertura é
 * por script e, se a nova aba for bloqueada, a navegação acontece na própria
 * aba em vez de falhar em silêncio.
 */
export function openWhatsApp(e?: { preventDefault: () => void }) {
  e?.preventDefault();
  const nova = window.open(WHATSAPP_LINK, "_blank", "noopener,noreferrer");
  if (!nova || nova.closed) window.location.href = WHATSAPP_LINK;
}

/** Botão flutuante de WhatsApp, presente em todas as páginas. */
export function WhatsAppFab() {
  return (
    <a
      href={WHATSAPP_LINK}
      target="_blank"
      rel="noopener noreferrer"
      onClick={openWhatsApp}
      aria-label={`Falar no WhatsApp ${WHATSAPP_DISPLAY}`}
      className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--gold)]/50 bg-charcoal text-[color:var(--gold)] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] transition-all duration-300 hover:scale-105 hover:border-[color:var(--gold)] hover:shadow-[0_10px_28px_-6px_rgba(212,175,55,0.45)] md:h-14 md:w-14"
    >
      {/* Ícone redesenhado: o path anterior tinha dados corrompidos
          ("…2.470 1.07…"), que deformavam o fone dentro do balão. */}
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-6 w-6 md:h-7 md:w-7">
        <path d="M12.04 2.02c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.16-1.35a9.94 9.94 0 0 0 4.88 1.24h.01c5.5 0 9.96-4.46 9.96-9.96 0-2.66-1.04-5.16-2.92-7.04a9.9 9.9 0 0 0-7.05-2.87zm0 18.17h-.01a8.26 8.26 0 0 1-4.21-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.24 8.24 0 0 1-1.26-4.4c0-4.56 3.72-8.28 8.28-8.28a8.2 8.2 0 0 1 5.85 2.43 8.22 8.22 0 0 1 2.42 5.86c0 4.56-3.71 8.25-8.28 8.25z" />
        <path d="M16.57 14.38c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.98-.14.16-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.56-.42h-.47c-.17 0-.44.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.02 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29z" />
      </svg>
    </a>
  );
}

export default WhatsAppFab;
