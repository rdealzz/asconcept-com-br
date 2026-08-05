import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "asc_theme";

/**
 * Script inline injetado no <head> pelo __root.
 *
 * Roda antes da primeira pintura para aplicar o tema salvo. Sem isso a
 * página nasceria escura e piscaria para claro na hidratação, que é o
 * efeito que todo mundo odeia em site com tema alternável.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/** Botão de alternar entre o tema escuro (padrão da marca) e o claro. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  // Nasce como "dark" para o HTML do servidor bater com o do cliente; o valor
  // real é lido logo após montar.
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(currentTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // modo privado / storage bloqueado: o tema vale só nesta navegação
    }
    setTheme(next);
  }

  const label = theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro";

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`transition-colors duration-ascfast ease-asc hover:text-asc-gold ${className}`}
    >
      {/* Antes de montar não sabemos o tema salvo; mostra a lua (padrão dark)
          sem animação para não trocar de ícone na cara do usuário. */}
      {mounted && theme === "light" ? (
        <Moon className="h-5 w-5" strokeWidth={1.5} />
      ) : (
        <Sun className="h-5 w-5" strokeWidth={1.5} />
      )}
    </button>
  );
}
