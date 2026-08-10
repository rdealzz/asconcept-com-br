import { Check, X } from "lucide-react";
import { PASSWORD_RULES, evaluatePassword, type PasswordLevel } from "@/lib/password-strength";

/**
 * Medidor de senha — barra fina + lista de requisitos.
 *
 * Vive logo abaixo do campo de senha do cadastro. A barra preenche na medida do
 * que já foi cumprido (uma das quatro regras = um quarto) e troca de cor junto
 * com o rótulo, para que a leitura funcione também para quem não distingue as
 * cores: o texto sempre diz o mesmo que o traço.
 *
 * Some quando o campo está vazio — nada de acusar "Senha Fraca" antes da
 * primeira tecla.
 */

/**
 * Só tokens que a classe `asc-on-dark` remapeia — o mesmo componente aparece
 * no modal de cadastro (painel escuro nos dois temas) e na página de nova
 * senha (superfície do tema). Cores fixas quebrariam num dos dois.
 */
const CORES: Record<PasswordLevel, { barra: string; texto: string }> = {
  vazia: { barra: "bg-transparent", texto: "text-muted-foreground" },
  fraca: { barra: "bg-asc-error", texto: "text-asc-error" },
  media: { barra: "bg-asc-gold-soft", texto: "text-asc-gold-soft" },
  forte: { barra: "bg-asc-success", texto: "text-asc-success" },
};

export function PasswordStrength({ value, className = "" }: { value: string; className?: string }) {
  const { met, score, level, label } = evaluatePassword(value);
  const cores = CORES[level];
  const pct = (score / PASSWORD_RULES.length) * 100;

  return (
    <div className={`mt-3 ${className}`}>
      <div className="flex items-center gap-3">
        <div
          className="h-[3px] flex-1 overflow-hidden rounded-full bg-asc-ink/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={PASSWORD_RULES.length}
          aria-valuenow={score}
          aria-label="Força da senha"
        >
          <span
            className={`block h-full rounded-full transition-all duration-asc ease-asc ${cores.barra}`}
            style={{ width: `${value.length === 0 ? 0 : Math.max(pct, 8)}%` }}
          />
        </div>
        {/* aria-live: o leitor de tela anuncia a mudança de força sem que o
            foco precise sair do campo. */}
        <span
          aria-live="polite"
          className={`shrink-0 text-[10px] tracking-luxe uppercase transition-colors duration-asc ease-asc ${cores.texto}`}
        >
          {label}
        </span>
      </div>

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const ok = met[rule.id];
          return (
            <li
              key={rule.id}
              className={`flex items-center gap-2 text-[11px] font-light transition-colors duration-asc ease-asc ${
                ok ? "text-asc-success" : "text-muted-foreground"
              }`}
            >
              <span
                aria-hidden
                className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border transition-colors duration-asc ease-asc ${
                  ok ? "border-asc-success bg-asc-success/15" : "border-asc-line"
                }`}
              >
                {ok ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : (
                  <X className="h-2.5 w-2.5 opacity-40" strokeWidth={3} />
                )}
              </span>
              <span>{rule.label}</span>
              <span className="sr-only">{ok ? " — cumprido" : " — pendente"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
