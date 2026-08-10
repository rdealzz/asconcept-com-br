/**
 * Regras de senha do cadastro.
 *
 * Ficam aqui, e não dentro do modal, porque três telas precisam da mesma
 * medida: o cadastro (AuthModal), a redefinição por link (/reset-password) e o
 * teste que trava a régua. Se a regra morar no JSX, cada tela acaba com a sua.
 *
 * A força não é um palpite de entropia: é quantas das quatro exigências a senha
 * já cumpre. Assim o rótulo ("Senha Média") e a lista de requisitos contam
 * sempre a mesma história — o cliente vê exatamente o que falta para liberar o
 * botão.
 */

export const PASSWORD_MIN_LENGTH = 6;

export type PasswordRuleId = "length" | "uppercase" | "number" | "special";

export type PasswordRule = {
  id: PasswordRuleId;
  label: string;
  test: (senha: string) => boolean;
};

/**
 * As exigências, na ordem em que aparecem sob o campo.
 *
 * Os testes usam classes Unicode de propósito: `[A-Z]` não reconhece "Á" como
 * maiúscula, e `[^A-Za-z0-9]` classificaria "á" como caractere especial —
 * as duas coisas erradas para quem digita em português. Espaço não conta como
 * especial (senão " " sozinho já cumpriria a regra).
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "length",
    label: `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (s) => s.length >= PASSWORD_MIN_LENGTH,
  },
  { id: "uppercase", label: "Ao menos 1 letra maiúscula", test: (s) => /\p{Lu}/u.test(s) },
  { id: "number", label: "Ao menos 1 número", test: (s) => /\p{Nd}/u.test(s) },
  {
    id: "special",
    label: "Ao menos 1 caractere especial (@ # $ !)",
    test: (s) => /[^\p{L}\p{N}\s]/u.test(s),
  },
];

export type PasswordLevel = "vazia" | "fraca" | "media" | "forte";

export type PasswordAssessment = {
  /** Quais regras a senha já cumpre, por id. */
  met: Record<PasswordRuleId, boolean>;
  /** Quantas das quatro regras foram cumpridas. */
  score: number;
  level: PasswordLevel;
  /** Rótulo pronto para a tela: "Senha Fraca", "Senha Média", "Senha Forte". */
  label: string;
  /** Só é forte quem cumpre as quatro. É o que libera o botão de criar conta. */
  isStrong: boolean;
};

const LABELS: Record<PasswordLevel, string> = {
  vazia: "Digite sua senha",
  fraca: "Senha Fraca",
  media: "Senha Média",
  forte: "Senha Forte",
};

export function evaluatePassword(senha: string): PasswordAssessment {
  const met = {} as Record<PasswordRuleId, boolean>;
  let score = 0;
  for (const rule of PASSWORD_RULES) {
    const ok = rule.test(senha);
    met[rule.id] = ok;
    if (ok) score += 1;
  }

  const level: PasswordLevel =
    senha.length === 0
      ? "vazia"
      : score === PASSWORD_RULES.length
        ? "forte"
        : score >= 3
          ? "media"
          : "fraca";

  return { met, score, level, label: LABELS[level], isStrong: level === "forte" };
}

/** Atalho para as validações de submit — evita repetir `.isStrong` por aí. */
export function isStrongPassword(senha: string): boolean {
  return evaluatePassword(senha).isStrong;
}
