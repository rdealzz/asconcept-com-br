import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reputação já acumulada fora do site — pedidos atendidos por WhatsApp e
 * Instagram, antes de existir o cadastro de depoimentos no painel.
 *
 * É o piso do que a loja exibe. Os depoimentos cadastrados entram por cima:
 * a nota vira a média ponderada das duas origens e a contagem, a soma. Assim o
 * bloco reflete a loja inteira, e cadastrar um depoimento novo move o número
 * em vez de substituí-lo.
 *
 * Para mudar o piso, é aqui — e só aqui.
 */
const BASE_HISTORICA = { media: 4.9, total: 49 };

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
      return combinar(notas);
    },
    // A base histórica já vale enquanto a consulta não volta: o bloco nunca
    // aparece sem nota, nem pisca de um número para outro.
    placeholderData: combinar([]),
  });
}

/** Base histórica + depoimentos do painel, em média ponderada. */
function combinar(notas: number[]): { media: number; total: number } {
  const total = BASE_HISTORICA.total + notas.length;
  const soma = BASE_HISTORICA.media * BASE_HISTORICA.total + notas.reduce((a, n) => a + n, 0);
  return { media: Math.round((soma / total) * 10) / 10, total };
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
  const { media, total } = data ?? combinar([]);

  return (
    <div
      className={`border border-asc-line/70 bg-asc-bg-raised/40 px-4 py-4 sm:flex sm:items-center sm:gap-6 sm:px-6 sm:py-5 ${className}`}
    >
      {/* No celular a nota e as estrelas dividem uma linha só, com o fio
          embaixo: empilhar tudo empurrava o texto para fora da dobra. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-asc-line/50 pb-3 sm:flex-col sm:items-start sm:gap-1.5 sm:border-b-0 sm:pb-0">
        <span className="font-display text-3xl leading-none tabular-nums text-asc-ink">
          {media.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          <span className="text-base text-asc-ink-muted">/5</span>
        </span>
        <Estrelas nota={media} />
      </div>

      <div className="min-w-0 pt-3 sm:border-l sm:border-asc-line/60 sm:pl-6 sm:pt-0">
        <p className="asc-label text-[10px] text-asc-gold-soft">Avaliações verificadas</p>
        <p className="mt-1.5 text-sm font-light leading-relaxed text-asc-ink">
          Baseado em {total.toLocaleString("pt-BR")}{" "}
          {total === 1 ? "avaliação verificada" : "avaliações verificadas"} de clientes da A&S
          Conccept.
        </p>
        <p className="mt-1 text-xs font-light leading-relaxed text-asc-ink-muted">
          A nota é da loja, e não de uma peça: ela reflete a experiência de quem já comprou com a
          gente.
        </p>
      </div>
    </div>
  );
}
