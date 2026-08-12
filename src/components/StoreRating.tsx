import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reputação da loja — o bloco de confiança da página da peça.
 *
 * Antes cada produto exibia "avaliações do produto" sorteadas de uma lista
 * fixa: mesmo texto girando entre peças diferentes, e a impressão de que cada
 * peça tem sua própria reputação. O que dá confiança é o contrário — a nota da
 * marca inteira, uma só, em todas as páginas.
 *
 * Os números vêm dos depoimentos reais cadastrados no painel. Sem depoimento
 * nenhum, o bloco não inventa média: mostra só a linha de confiança.
 */

const MIN_ESTRELAS = 0;
const MAX_ESTRELAS = 5;

function useStoreRating() {
  return useQuery({
    queryKey: ["store-rating"],
    // A nota da loja não muda entre uma peça e outra: uma consulta por sessão
    // serve para a navegação inteira.
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("testimonials").select("rating");
      if (error) throw error;
      const notas = (data ?? [])
        .map((r) => Number((r as { rating?: number }).rating))
        .filter((n) => Number.isFinite(n) && n >= MIN_ESTRELAS && n <= MAX_ESTRELAS);
      if (!notas.length) return { media: null as number | null, total: 0 };
      const media = notas.reduce((a, n) => a + n, 0) / notas.length;
      return { media: Math.round(media * 10) / 10, total: notas.length };
    },
  });
}

/** Estrelas cheias até a nota, com a última preenchida pela metade se for o caso. */
function Estrelas({ nota, className = "" }: { nota: number; className?: string }) {
  return (
    <span
      className={`flex items-center gap-1 ${className}`}
      role="img"
      aria-label={`${nota.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        // A meia-estrela é a mesma estrela cheia recortada por largura — sem
        // ícone extra e sem gradiente, então ela acompanha a cor do tema.
        const preenchimento = Math.max(0, Math.min(1, nota - (i - 1)));
        return (
          <span key={i} className="relative inline-flex">
            <Star className="h-4 w-4 text-asc-line" strokeWidth={1.25} aria-hidden />
            {preenchimento > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${preenchimento * 100}%` }}
                aria-hidden
              >
                <Star
                  className="h-4 w-4 fill-asc-gold text-asc-gold"
                  strokeWidth={1.25}
                  aria-hidden
                />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

export function StoreRating({ className = "" }: { className?: string }) {
  const { data } = useStoreRating();
  const media = data?.media ?? null;
  const total = data?.total ?? 0;

  return (
    <div
      className={`flex flex-col gap-4 border border-asc-line/70 bg-asc-bg-raised/40 px-5 py-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6 ${className}`}
    >
      {media !== null && (
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-start sm:gap-1.5">
          <span className="font-display text-3xl leading-none tabular-nums text-asc-ink">
            {media.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            <span className="text-base text-asc-ink-muted">/5</span>
          </span>
          <Estrelas nota={media} />
        </div>
      )}

      {/* O fio divisor só existe quando há nota à esquerda dele. */}
      <div
        className={`min-w-0 ${media !== null ? "sm:border-l sm:border-asc-line/60 sm:pl-6" : ""}`}
      >
        <p className="asc-label text-[10px] text-asc-gold-soft">Avaliações verificadas</p>
        <p className="mt-1.5 text-sm font-light leading-relaxed text-asc-ink">
          {total > 0
            ? `Baseado em ${total.toLocaleString("pt-BR")} ${
                total === 1 ? "avaliação verificada" : "avaliações verificadas"
              } de clientes da A&S Conccept.`
            : "Clientes atendidos em todo o Brasil, com acompanhamento próximo do pedido à entrega."}
        </p>
        <p className="mt-1 text-xs font-light leading-relaxed text-asc-ink-muted">
          A nota é da loja, e não de uma peça: ela reflete a experiência de quem já comprou com a
          gente.
        </p>
      </div>
    </div>
  );
}
