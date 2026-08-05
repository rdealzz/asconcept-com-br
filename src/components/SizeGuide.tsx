import { useEffect } from "react";
import { X } from "lucide-react";
import { WHATSAPP_LINK } from "@/components/WhatsAppFab";

export const SIZE_GUIDE_ROWS = [
  { size: "P", comprimento: 57, busto: 53, ombro: 49, manga: 54 },
  { size: "M", comprimento: 59, busto: 55, ombro: 51, manga: 56 },
  { size: "G", comprimento: 61, busto: 57, ombro: 53, manga: 58 },
  { size: "GG", comprimento: 63, busto: 59, ombro: 55, manga: 59 },
];

export function SizeGuideTable() {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] tracking-luxe uppercase text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Tamanho</th>
              <th className="py-2 pr-3 font-normal">Comprimento</th>
              <th className="py-2 pr-3 font-normal">Busto</th>
              <th className="py-2 pr-3 font-normal">Ombro</th>
              <th className="py-2 font-normal">Manga</th>
            </tr>
          </thead>
          <tbody className="font-light">
            {SIZE_GUIDE_ROWS.map((r) => (
              <tr key={r.size} className="border-b border-border/60">
                <td className="py-2.5 pr-3 font-serif text-sm">{r.size}</td>
                <td className="py-2.5 pr-3 tabular-nums">{r.comprimento}cm</td>
                <td className="py-2.5 pr-3 tabular-nums">{r.busto}cm</td>
                <td className="py-2.5 pr-3 tabular-nums">{r.ombro}cm</td>
                <td className="py-2.5 tabular-nums">{r.manga}cm</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[11px] font-light leading-relaxed text-muted-foreground">
        Medidas em centímetros, com a peça deitada. Podem variar levemente entre modelos. Em
        caso de dúvida sobre qual tamanho escolher,{" "}
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--gold)] underline-offset-4 hover:underline"
        >
          fale com a gente pelo WhatsApp
        </a>
        .
      </p>
    </div>
  );
}

export function SizeGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[120] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-200"
      />
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-background p-6 animate-in fade-in zoom-in-95 duration-300 md:p-8">
          <button
            onClick={onClose}
            aria-label="Fechar guia de tamanhos"
            className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-accent"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="text-[11px] tracking-luxe uppercase text-accent">Referência</p>
          <h3 className="mb-6 mt-2 font-serif text-2xl">Guia de Tamanhos</h3>
          <SizeGuideTable />
        </div>
      </div>
    </>
  );
}
