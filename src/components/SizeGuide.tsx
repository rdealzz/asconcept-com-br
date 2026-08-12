import { useEffect } from "react";
import { X } from "lucide-react";
import { WHATSAPP_LINK, openWhatsApp } from "@/components/WhatsAppFab";
import { NOTA_TAMANHO_UNICO, sizeGuideFor, type SizeGuide } from "@/lib/size-guide";

/**
 * Guia de tamanhos.
 *
 * A tabela é montada a partir da peça — categoria, nome e os tamanhos que ela
 * realmente oferece (ver `@/lib/size-guide`). O componente aqui só desenha: o
 * que decide colunas e linhas é a espécie da peça, não este arquivo.
 *
 * O destaque é do tamanho escolhido, e de mais nenhum: as outras linhas ficam
 * em cinza discreto para a leitura cair direto onde interessa.
 */

export function SizeGuideTable({
  guide,
  selected = null,
  className = "",
}: {
  /** Omitido, mostra a grade de roupas — é o uso das páginas de ajuda. */
  guide?: SizeGuide | null;
  selected?: string | null;
  className?: string;
}) {
  const g = guide ?? sizeGuideFor("clothes");
  if (!g) {
    return (
      <p className={`text-[11px] font-light leading-relaxed text-asc-ink-muted ${className}`}>
        {NOTA_TAMANHO_UNICO}
      </p>
    );
  }

  return (
    <div className={className}>
      {/* Rolagem horizontal na própria tabela: no celular ela é mais larga que
          o card, e sem isto era a página inteira que rolava para o lado. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[19rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-asc-line">
              <th className="asc-label py-2.5 pr-4 text-[9px] font-medium text-asc-ink-muted">
                Tam.
              </th>
              {g.columns.map((c) => (
                <th
                  key={c.key}
                  className="asc-label py-2.5 pl-3 text-right text-[9px] font-medium text-asc-ink-muted"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => {
              const ativo = selected !== null && r.size === selected;
              return (
                <tr
                  key={r.size}
                  className={`border-b border-asc-line/50 last:border-0 transition-colors duration-ascfast ease-asc ${
                    ativo ? "bg-asc-gold/[0.07]" : ""
                  }`}
                >
                  <td
                    className={`py-3 pr-4 font-display text-sm ${
                      ativo ? "text-asc-gold-soft" : "text-asc-ink"
                    }`}
                  >
                    {r.size}
                  </td>
                  {g.columns.map((c) => (
                    <td
                      key={c.key}
                      className={`py-3 pl-3 text-right text-xs tabular-nums ${
                        ativo ? "text-asc-ink" : "text-asc-ink-muted"
                      }`}
                    >
                      {r.medidas[c.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] font-light leading-relaxed text-asc-ink-muted">
        {g.nota} Em caso de dúvida sobre qual tamanho escolher,{" "}
        <a
          href={WHATSAPP_LINK}
          onClick={openWhatsApp}
          target="_blank"
          rel="noopener noreferrer"
          className="text-asc-gold underline-offset-4 hover:underline"
        >
          fale com a gente pelo WhatsApp
        </a>
        .
      </p>
    </div>
  );
}

export function SizeGuideModal({
  open,
  onClose,
  guide,
  selected = null,
}: {
  open: boolean;
  onClose: () => void;
  guide?: SizeGuide | null;
  selected?: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const titulo = (guide ?? sizeGuideFor("clothes"))?.titulo ?? "Tamanho único";

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[120] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-200"
      />
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
        <div className="relative max-h-[86vh] w-full max-w-lg overflow-y-auto bg-background p-6 animate-in fade-in zoom-in-95 duration-300 md:p-8">
          <button
            onClick={onClose}
            aria-label="Fechar guia de tamanhos"
            className="absolute right-4 top-4 text-asc-ink-muted transition-colors hover:text-asc-gold"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="asc-label text-[10px] text-asc-gold">Referência</p>
          <h3 className="mb-6 mt-2 pr-8 font-display text-2xl">{titulo}</h3>
          <SizeGuideTable guide={guide} selected={selected} />
        </div>
      </div>
    </>
  );
}
