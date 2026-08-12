import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StitchDivider } from "./StitchDivider";

/**
 * EmptyCategoryState — bloco editorial para categoria sem produtos,
 * com pré-cadastro ligado à mesma tabela de leads (newsletter_subscribers).
 */
export function EmptyCategoryState({ categoryName }: { categoryName: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    const { error } = await supabase
      .from("newsletter_subscribers")
      .insert({ email: clean } as never);
    if (error && !/duplicate|unique/i.test(error.message)) return;
    setSent(true);
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-[var(--asc-section-y-sm)] text-center">
      <p className="asc-label mb-4 text-asc-gold">{categoryName}</p>
      <h2 className="mb-4 font-display text-3xl leading-tight text-asc-ink md:text-4xl">
        Esta peça ainda está sendo talhada.
      </h2>
      <p className="mb-10 font-sans text-sm leading-relaxed text-asc-ink-muted">
        Cada coleção da A&amp;S Conccept nasce sem pressa. Deixe seu e-mail e avisamos no instante
        em que este drop chegar ao ateliê.
      </p>

      <StitchDivider className="mb-10" />

      {sent ? (
        <p className="font-display text-lg italic text-asc-ink">
          Anotado. Você será o primeiro a saber.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-sm flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="flex-1 border-b border-asc-line bg-transparent px-1 py-3 font-sans text-sm text-asc-ink outline-none transition-colors duration-asc ease-asc focus:border-asc-gold"
          />
          <button
            type="submit"
            className="asc-label whitespace-nowrap border border-asc-ink px-6 py-3 text-asc-ink transition-all duration-asc ease-asc hover:bg-asc-ink hover:text-asc-bg"
          >
            Notifique-me
          </button>
        </form>
      )}
    </div>
  );
}
