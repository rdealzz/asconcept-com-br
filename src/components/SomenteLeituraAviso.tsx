import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { aoBloquearEscrita, SOMENTE_LEITURA } from "@/lib/admin-access";

/**
 * Aviso flutuante que aparece quando o admin de visualização tenta gravar
 * algo. Montado uma vez no __root; quem dispara é `bloquearSeSomenteLeitura`.
 */
export function SomenteLeituraAviso() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const desliga = aoBloquearEscrita(() => {
      setVisivel(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisivel(false), 4000);
    });
    return () => {
      desliga();
      window.clearTimeout(timer);
    };
  }, []);

  if (!visivel) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-6 z-[200] mx-auto flex max-w-md items-start gap-3 border border-accent/40 bg-background px-4 py-3 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2"
    >
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.5} />
      <span>{SOMENTE_LEITURA}</span>
    </div>
  );
}
