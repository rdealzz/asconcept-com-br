import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBRL, type Product } from "@/lib/cart-context";
import { useCatalog, totalStock } from "@/lib/catalog-context";
import { sizesForProduct } from "@/lib/sizes";
import { InstallmentsNote } from "@/components/InstallmentsNote";
import { GarmentTurntable } from "@/components/GarmentTurntable";
import { Eyebrow } from "@/components/ui-kit";
import { productImageSrc, productImageSrcSet } from "@/lib/product-images";
import { noOcioso } from "@/lib/near-viewport";
import { groupOf, productParam } from "@/lib/variants";
import { ColorSwatches } from "@/components/ColorSwatches";

/**
 * Vitrine giratória — o palco da coleção.
 *
 * É a leitura, na linguagem da A&S Conccept, daquele desenho de landing com o
 * produto 3D no centro: fundo em degradê radial que muda de ambiente a cada
 * peça, partículas subindo, tipografia grande de um lado, cartões de vidro do
 * outro e, no meio, a peça — que gira quando arrastada, como a lata da
 * referência. As informações são as do site: nome, preço, parcelamento,
 * descrição, tamanhos com estoque e o caminho para a página da peça.
 */

/** Ambientes de fundo: um por peça em rotação. Todos em obsidiana, mudando só o tom. */
const AMBIENTES = [
  {
    nome: "ouro",
    grad: "radial-gradient(circle at 50% 45%, #2E2415 0%, #14100A 48%, #05070B 100%)",
  },
  {
    nome: "tinta",
    grad: "radial-gradient(circle at 50% 45%, #17222E 0%, #0C1119 48%, #05070B 100%)",
  },
  {
    nome: "vinho",
    grad: "radial-gradient(circle at 50% 45%, #2A1719 0%, #150C0E 48%, #05070B 100%)",
  },
  {
    nome: "musgo",
    grad: "radial-gradient(circle at 50% 45%, #1A241D 0%, #0D1310 48%, #05070B 100%)",
  },
];

/**
 * Partículas em posições fixas — nada de Math.random no render, senão o HTML
 * do servidor e o do navegador divergem na hidratação.
 */
const PARTICULAS = [
  { e: 6, t: 10, d: 0, s: 5 },
  { e: 18, t: 13, d: 2.4, s: 8 },
  { e: 27, t: 9, d: 5.1, s: 4 },
  { e: 36, t: 14, d: 1.2, s: 10 },
  { e: 44, t: 11, d: 6.8, s: 6 },
  { e: 53, t: 15, d: 3.3, s: 7 },
  { e: 62, t: 10, d: 8.2, s: 5 },
  { e: 71, t: 12, d: 4.6, s: 9 },
  { e: 80, t: 16, d: 0.8, s: 6 },
  { e: 88, t: 11, d: 7.4, s: 4 },
  { e: 95, t: 13, d: 2.9, s: 7 },
];

/** Quantos cartões de vidro cabem ao lado do palco. */
const PECAS_POR_PAGINA = 2;

export function Showroom({
  products,
  eyebrow,
  sideTitle,
}: {
  products: Product[];
  eyebrow: string;
  sideTitle: [string, string];
}) {
  const { stock, groups: grupos, loadGallery } = useCatalog();
  const navegar = useNavigate();
  const [ativo, setAtivo] = useState(0);
  const [janela, setJanela] = useState(0);

  // Trocar de aba (Roupas / Sneakers) recomeça a vitrine.
  const primeiraId = products[0]?.id ?? "";
  useEffect(() => {
    setAtivo(0);
    setJanela(0);
  }, [primeiraId]);

  const peca = products[Math.min(ativo, products.length - 1)];
  const pecaId = peca?.id;
  const pecaGaleria = peca?.gallery;
  const pecaCapa = peca?.image;

  // A vitrine só traz a foto de capa; o resto da galeria é o que dá o giro.
  useEffect(() => {
    if (pecaId) void loadGallery(pecaId);
  }, [pecaId, loadGallery]);

  // As peças dos cartões de vidro também: clicar num deles trocava a peça do
  // palco e só então ia buscar as fotos dela — a virada acontecia com a peça
  // ainda vazia. Como os pedidos saem em lote, isto é uma requisição só.
  const idsVisiveis = products
    .slice(janela, janela + PECAS_POR_PAGINA)
    .map((p) => p.id)
    .join(",");
  useEffect(() => {
    if (!idsVisiveis) return;
    return noOcioso(() => {
      for (const id of idsVisiveis.split(",")) void loadGallery(id);
    });
  }, [idsVisiveis, loadGallery]);

  const fotos = useMemo(() => {
    const g = (pecaGaleria ?? []).filter(Boolean);
    return g.length ? g : pecaCapa ? [pecaCapa] : [];
  }, [pecaGaleria, pecaCapa]);

  const ambiente = AMBIENTES[ativo % AMBIENTES.length];
  // As outras cores da peça em cartaz, quando ela é de um álbum.
  const album = groupOf(peca, grupos);
  const cores = album
    ? album.members.filter((m) => totalStock(stock[m.id]) > 0 || m.id === pecaId)
    : [];
  const sizeStock = pecaId ? stock[pecaId] : undefined;
  const disponiveis = sizesForProduct(peca?.category, peca?.name ?? "", sizeStock).filter(
    (s) => (sizeStock?.[s] ?? 0) > 0,
  );
  const total = totalStock(sizeStock);

  // Clique curto na peça (sem arrasto) abre a página dela.
  const abrir = useCallback(() => {
    if (!peca) return;
    void navegar({ to: "/produto/$id", params: { id: productParam(peca) } });
  }, [pecaId, peca, navegar]);

  if (!peca || fotos.length === 0) return null;

  const cartoes = products.slice(janela, janela + PECAS_POR_PAGINA);
  const podeVoltar = janela > 0;
  const podeAvancar = janela + PECAS_POR_PAGINA < products.length;

  return (
    <section
      id="vitrine"
      aria-label="Vitrine giratória"
      className="asc-on-dark relative isolate mt-3 overflow-hidden rounded-[2rem] text-asc-ink"
    >
      {/* Ambientes empilhados: o degradê não interpola sozinho, então a troca
          acontece por sobreposição — um apaga enquanto o outro acende. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {AMBIENTES.map((a) => (
          <div
            key={a.nome}
            className="absolute inset-0 transition-opacity duration-[1200ms] ease-asc"
            style={{ background: a.grad, opacity: a.nome === ambiente.nome ? 1 : 0 }}
          />
        ))}
      </div>

      {/* Partículas subindo — CSS puro, sem temporizador nem quadro de JS. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {PARTICULAS.map((p, i) => (
          <span
            key={i}
            className="asc-mote absolute rounded-full"
            style={{
              left: `${p.e}%`,
              bottom: "-3rem",
              width: `${p.s}px`,
              height: `${p.s}px`,
              animationDuration: `${p.t}s`,
              animationDelay: `${p.d}s`,
            }}
          />
        ))}
      </div>

      {/* O respiro no topo não é folga: as fotos dos cartões saltam para fora
          da moldura, e sem ele a seção cortava a cabeça delas. */}
      <div className="relative grid items-center gap-10 px-5 pb-14 pt-20 sm:gap-8 sm:px-10 sm:pb-16 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.95fr)] lg:gap-8 lg:pb-20 lg:pt-28">
        {/* ── Coluna esquerda: a peça em palavras ─────────────────── */}
        <div className="relative z-20 flex min-w-0 flex-col gap-6 lg:h-full lg:justify-between lg:py-4">
          <div>
            <Eyebrow tone="light">{eyebrow}</Eyebrow>
            {/* `break-words`: nomes de peça trazem palavras longas ("Trançada",
                "Ralph") num corpo enorme — sem isso elas estouram a coluna e
                empurram a foto para cima do texto. */}
            <h2
              className="mt-5 break-words font-display font-light leading-[0.9] text-asc-ink"
              style={{ fontSize: "clamp(2.25rem, 4.4vw, 4.5rem)" }}
            >
              <span className="italic text-asc-gold-soft">{primeiraPalavra(peca.name)}</span>
              {restoDoNome(peca.name) && (
                <>
                  <br />
                  {restoDoNome(peca.name)}
                </>
              )}
            </h2>

            {peca.description && (
              <p className="mt-6 max-w-sm text-sm font-light leading-relaxed text-asc-ink-inverse-muted">
                {peca.description}
              </p>
            )}

            <div className="mt-7 flex flex-wrap items-end gap-x-5 gap-y-1">
              <span className="font-display text-3xl tabular-nums text-asc-ink">
                {formatBRL(peca.price)}
              </span>
              <InstallmentsNote amount={peca.price} />
            </div>

            {disponiveis.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="asc-label text-[10px] text-asc-ink-inverse-muted">Tamanhos</span>
                {disponiveis.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-asc-line px-2.5 py-1 text-[11px] text-asc-ink"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            {cores.length > 1 && (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="asc-label text-[10px] text-asc-ink-inverse-muted">Cores</span>
                <ColorSwatches members={cores} activeId={peca.id} size="md" max={8} />
              </div>
            )}

            <Link
              to="/produto/$id"
              params={{ id: productParam(peca) }}
              className="group mt-8 inline-flex w-fit items-center gap-5 rounded-full bg-asc-bg-dark/70 py-1.5 pl-6 pr-1.5 text-[11px] font-semibold uppercase tracking-wide text-asc-ink backdrop-blur transition-all duration-asc ease-asc hover:-translate-y-0.5 hover:bg-asc-bg-dark"
            >
              Ver a Peça
              <span className="grid h-10 w-10 place-items-center rounded-full bg-asc-gold text-lg font-bold leading-none text-asc-bg-dark transition-transform duration-asc ease-asc group-hover:rotate-90">
                +
              </span>
            </Link>
          </div>

          {/* Selo — o mesmo canto do desenho de referência, com dado real. */}
          <div className="mt-2 flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-asc-line bg-asc-ink/5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-asc-gold"
                aria-hidden
              >
                <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8L12 3z" />
              </svg>
            </span>
            <span className="flex flex-col">
              <span className="asc-label text-[10px] text-asc-ink-inverse-muted">
                {total > 0 && total <= 3 ? "Últimas unidades" : "Edição limitada"}
              </span>
              <span className="text-[13px] font-medium text-asc-ink">
                Ateliês parceiros · peças numeradas
              </span>
            </span>
          </div>
        </div>

        {/* ── Centro: a peça que gira ─────────────────────────────── */}
        {/* Sem margem negativa: ela puxava o palco para dentro das colunas
            vizinhas, e em janela alta a foto passava por cima do título e dos
            cartões. `min-w-0` deixa a coluna encolher em vez de estourar. */}
        <div className="relative z-10 flex min-w-0 justify-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-70 blur-3xl"
            style={{
              background: "radial-gradient(circle, rgba(197,160,89,0.16) 0%, transparent 65%)",
            }}
          />
          {/* Sem `key`: o palco precisa sobreviver à troca de peça, senão o
              React monta outro componente e a virada coreografada não roda. */}
          <GarmentTurntable
            swapId={peca.id}
            images={fotos}
            alt={peca.name}
            onOpen={abrir}
            hint="Arraste para girar"
            // Proporção 3/4, a mesma da vitrine em grade: com `cover` a foto
            // preenche a moldura e o retângulo vira um painel que gira de
            // propósito, em vez de um pedaço branco solto no escuro.
            // A altura manda no tamanho (a moldura é 3/4), mas com um teto em
            // `vw` e outro em `rem`: só assim o palco de uma janela estreita e
            // alta continua cabendo na própria coluna. `max-w-full` é a trava
            // final, para o caso de a coluna ser mais estreita que a conta.
            className="asc-float aspect-[3/4] h-[min(46vh,116vw,26rem)] w-auto max-w-full sm:h-[min(52vh,88vw,30rem)] lg:h-[min(60vh,46vw,38rem)]"
            fit="cover"
            imageClassName="rounded-[1.25rem] border border-asc-line shadow-[0_30px_60px_rgba(0,0,0,0.6)]"
          />
        </div>

        {/* ── Coluna direita: cartões de vidro + assinatura ────────── */}
        <div className="relative z-20 flex min-w-0 flex-col items-center gap-10 lg:h-full lg:items-end lg:justify-between lg:py-4">
          <div className="flex flex-col items-center gap-5 lg:items-end">
            <div className="flex gap-4">
              {cartoes.map((p) => {
                const selecionada = p.id === peca.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setAtivo(products.findIndex((x) => x.id === p.id));
                      void loadGallery(p.id);
                    }}
                    onMouseEnter={() => void loadGallery(p.id)}
                    aria-pressed={selecionada}
                    aria-label={`Ver ${p.name} na vitrine`}
                    className={`group relative flex w-[7.25rem] flex-col items-center gap-4 rounded-[1.75rem] border bg-asc-ink/[0.06] px-3 pb-4 pt-20 text-center backdrop-blur transition-all duration-asc ease-asc hover:bg-asc-ink/[0.12] sm:w-[8.5rem] ${
                      selecionada ? "border-asc-gold" : "border-asc-line hover:border-asc-line-dark"
                    }`}
                  >
                    <img
                      src={productImageSrc(p.image, 480)}
                      srcSet={productImageSrcSet(p.image)}
                      sizes="(min-width: 640px) 136px, 116px"
                      alt=""
                      aria-hidden
                      loading="lazy"
                      decoding="async"
                      className="pointer-events-none -mt-[6.5rem] h-32 w-full object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.55)] transition-transform duration-ascslow ease-asc group-hover:-translate-y-3 group-hover:-rotate-6 group-hover:scale-110"
                    />
                    <span className="flex w-full flex-col gap-0.5">
                      <span className="truncate text-[11px] font-semibold text-asc-ink">
                        {p.name}
                      </span>
                      <span className="text-[11px] tabular-nums text-asc-ink-inverse-muted">
                        {formatBRL(p.price)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {products.length > PECAS_POR_PAGINA && (
              <div className="flex gap-3">
                <button
                  onClick={() => setJanela((j) => Math.max(0, j - PECAS_POR_PAGINA))}
                  disabled={!podeVoltar}
                  aria-label="Peças anteriores"
                  className="grid h-9 w-9 place-items-center rounded-full border border-asc-line text-asc-ink transition-colors duration-asc ease-asc hover:border-asc-gold hover:text-asc-gold disabled:opacity-30 disabled:hover:border-asc-line disabled:hover:text-asc-ink"
                >
                  ←
                </button>
                <button
                  onClick={() =>
                    setJanela((j) =>
                      Math.min(products.length - PECAS_POR_PAGINA, j + PECAS_POR_PAGINA),
                    )
                  }
                  disabled={!podeAvancar}
                  aria-label="Próximas peças"
                  className="grid h-9 w-9 place-items-center rounded-full border border-asc-line text-asc-ink transition-colors duration-asc ease-asc hover:border-asc-gold hover:text-asc-gold disabled:opacity-30 disabled:hover:border-asc-line disabled:hover:text-asc-ink"
                >
                  →
                </button>
              </div>
            )}
          </div>

          <p
            className="text-center font-display font-light leading-[0.95] text-asc-ink/90 lg:text-right"
            style={{ fontSize: "clamp(1.85rem, 3.4vw, 3.5rem)" }}
          >
            <span className="italic text-asc-gold-soft">{sideTitle[0]}</span>
            <br />
            {sideTitle[1]}
          </p>
        </div>
      </div>
    </section>
  );
}

function primeiraPalavra(nome: string) {
  return nome.split(" ")[0] ?? nome;
}

function restoDoNome(nome: string) {
  const partes = nome.split(" ");
  return partes.length > 1 ? partes.slice(1).join(" ") : "";
}
