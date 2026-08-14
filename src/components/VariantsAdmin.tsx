import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Search, Sparkles, Star, Trash2, X } from "lucide-react";
import type { Product } from "@/lib/cart-context";
import { useCatalog } from "@/lib/catalog-context";
import { categoryLabel } from "@/lib/categories";
import { productImageSrc } from "@/lib/product-images";
import {
  detectarCores,
  normalizar,
  planGroup,
  slugify,
  suggestGroups,
  swatchBackground,
  swatchLabel,
  type SugestaoAlbum,
  type VariantGroup,
  type VariantMeta,
} from "@/lib/variants";

/**
 * Painel · Variações — onde os álbuns de cor são montados.
 *
 * O agrupamento é manual: o admin escolhe quais peças são a mesma roupa em
 * cores diferentes. Nada é agrupado sozinho. O que o sistema faz por conta
 * própria é *desconfiar*: a aba de sugestões compara nome, categoria e cor e
 * propõe álbuns — que só existem depois de o admin aprovar um a um.
 *
 * Editar um álbum aqui muda a vitrine na hora: a ordem das bolinhas, qual cor
 * é a capa, as cores de cada seletor e quem entra ou sai do grupo.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** `input[type=color]` só entende `#rrggbb`; o resto vira um cinza neutro. */
function hexSeguro(v: string | undefined): string {
  return v && HEX.test(v) ? v : "#c9c4bc";
}

export function VariantsAdmin() {
  const { products, groups, saveGroup, missingColumns, refresh } = useCatalog();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [dispensadas, setDispensadas] = useState<string[]>([]);

  const semColuna = missingColumns.includes("variant");
  const albuns = useMemo(() => [...groups.values()], [groups]);
  const soltas = useMemo(() => products.filter((p) => !p.variant?.group), [products]);
  const sugestoes = useMemo(
    () => suggestGroups(products).filter((s) => !dispensadas.includes(s.id)),
    [products, dispensadas],
  );

  /** Nome de álbum que ainda não existe — dois "Camiseta Polo" não se misturam. */
  const idDisponivel = (label: string, exceto?: string) => {
    const base = slugify(label);
    let id = base;
    let n = 2;
    while (groups.has(id) && id !== exceto) id = `${base}-${n++}`;
    return id;
  };

  const gravar = async (entries: Array<{ id: string; meta: VariantMeta | null }>) => {
    setErro(null);
    setSalvando(true);
    const msg = await saveGroup(entries);
    setSalvando(false);
    if (msg) setErro(msg);
    return !msg;
  };

  const criarAlbum = async (label: string, membros: Product[], primaryId?: string) => {
    const id = idDisponivel(label);
    const ok = await gravar(planGroup(id, label.trim(), membros.map(bruto), primaryId));
    if (ok) setCriando(false);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
          {albuns.length} {albuns.length === 1 ? "álbum" : "álbuns"} ·{" "}
          {albuns.reduce((s, g) => s + g.members.length, 0)} peças agrupadas
        </p>
        <button
          onClick={() => setCriando((v) => !v)}
          disabled={semColuna}
          className="inline-flex items-center gap-1.5 asc-btn-primary px-3 py-1.5 text-[10px] tracking-luxe uppercase disabled:opacity-40"
        >
          <Plus className="h-3 w-3" strokeWidth={2} /> Criar álbum
        </button>
      </div>

      <p className="mb-5 text-[11px] leading-relaxed text-muted-foreground">
        Um álbum reúne a mesma peça em cores diferentes. Na vitrine ela aparece uma vez só, com as
        bolinhas de cor embaixo da foto; cada bolinha abre a página daquela cor, com o preço, o
        estoque e o SKU dela. A peça principal é a que representa o álbum na vitrine, na busca e nos
        banners.
      </p>

      {/* Mesma escolha do painel de curadoria: dizer em português o que está
          fora do ar, em vez de despejar SQL na tela de quem cuida da loja. */}
      {semColuna && (
        <div className="mb-5 border border-border bg-muted/20 px-4 py-4">
          <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
            Álbuns indisponíveis
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Agrupar a mesma peça em várias cores ainda não está ativo — falta uma parte do banco de
            dados.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span className="text-foreground">Nada se perde:</span> cada cor continua existindo como
            peça própria na vitrine, com preço, estoque e SKU. O que falta é só juntá-las num card
            único com as bolinhas de cor.
          </p>
          <button
            onClick={() => void refresh()}
            className="mt-3 border border-border px-3 py-1.5 text-[10px] tracking-luxe uppercase text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            Verificar de novo
          </button>
        </div>
      )}

      {erro && (
        <p className="mb-4 border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {erro}
        </p>
      )}

      {criando && (
        <NovoAlbum
          candidatos={soltas}
          ocupado={salvando}
          onCancel={() => setCriando(false)}
          onSave={criarAlbum}
        />
      )}

      {albuns.length === 0 ? (
        <p className="border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          Nenhum álbum ainda. Crie o primeiro — ou aprove uma das sugestões abaixo.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {albuns.map((g) => (
            <AlbumEditor
              key={g.id}
              album={g}
              candidatos={soltas}
              ocupado={salvando}
              onSalvar={gravar}
            />
          ))}
        </div>
      )}

      {sugestoes.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
            <p className="text-[10px] tracking-luxe uppercase text-accent">
              Sugestões de agrupamento ({sugestoes.length})
            </p>
          </div>
          <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">
            Peças da mesma categoria cujo nome só difere na cor. Nada é agrupado sem a sua aprovação
            — confira as peças antes de aceitar.
          </p>
          <div className="flex flex-col gap-3">
            {sugestoes.map((s) => (
              <Sugestao
                key={s.id}
                sugestao={s}
                ocupado={salvando || semColuna}
                onAprovar={() => void criarAlbum(s.label, s.products)}
                onDispensar={() => setDispensadas((d) => [...d, s.id])}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Membro sem ajuste manual de cor — `planGroup` deduz o que faltar pelo nome. */
function bruto(product: Product) {
  return { product };
}

/* ---------- criar ---------- */

function NovoAlbum({
  candidatos,
  ocupado,
  onCancel,
  onSave,
}: {
  candidatos: Product[];
  ocupado: boolean;
  onCancel: () => void;
  onSave: (label: string, membros: Product[], primaryId?: string) => void | Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);

  const membros = escolhidos
    .map((id) => candidatos.find((p) => p.id === id))
    .filter((p): p is Product => !!p);

  // O nome do álbum sai do nome da primeira peça sem a parte de cor — é o que
  // o admin escreveria de qualquer jeito. Continua editável.
  const sugerido = membros.length ? nomeSemCor(membros[0].name) : "";
  const label = nome.trim() || sugerido;
  const podeSalvar = membros.length >= 2 && label.length > 0 && !ocupado;

  return (
    <div className="mb-6 border border-accent/40 bg-accent/[0.04] p-4">
      <p className="text-[10px] tracking-luxe uppercase text-accent">Novo álbum</p>

      <label className="mt-3 block">
        <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
          Nome do álbum
        </span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder={sugerido || "Ex: Camiseta Básica Polo Ralph Lauren"}
          className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <p className="mt-4 text-[10px] tracking-luxe uppercase text-muted-foreground">
        Peças do álbum ({membros.length})
      </p>
      <SeletorDePecas
        candidatos={candidatos}
        selecionados={escolhidos}
        onToggle={(id) =>
          setEscolhidos((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void onSave(label, membros, membros[0]?.id)}
          disabled={!podeSalvar}
          className="asc-btn-primary px-4 py-2 text-[10px] tracking-luxe uppercase disabled:opacity-40"
        >
          <Check className="mr-1.5 inline h-3 w-3" strokeWidth={2} /> Criar álbum
        </button>
        <button
          onClick={onCancel}
          className="border border-border px-3 py-2 text-[10px] tracking-luxe uppercase text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          Cancelar
        </button>
        {membros.length === 1 && (
          <span className="text-[10px] text-muted-foreground">
            Um álbum precisa de pelo menos duas cores.
          </span>
        )}
      </div>
    </div>
  );
}

/** Lista com busca para escolher peças — a mesma no criar e no adicionar cor. */
function SeletorDePecas({
  candidatos,
  selecionados,
  onToggle,
}: {
  candidatos: Product[];
  selecionados: string[];
  onToggle: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const q = normalizar(busca);
  const lista = q ? candidatos.filter((p) => normalizar(p.name).includes(q)) : candidatos;

  return (
    <>
      <div className="mt-2 flex items-center gap-2 border border-border bg-background px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar peça pelo nome"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>
      <div className="mt-2 max-h-64 overflow-y-auto border border-border">
        {lista.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Nenhuma peça livre com esse nome. Uma peça só pode estar em um álbum.
          </p>
        ) : (
          lista.map((p) => {
            const marcado = selecionados.includes(p.id);
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2 transition-colors last:border-b-0 ${
                  marcado ? "bg-accent/10" : "hover:bg-muted/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => onToggle(p.id)}
                  className="h-4 w-4 shrink-0 accent-[color:var(--gold)]"
                />
                {p.image && (
                  <img
                    src={productImageSrc(p.image, 480)}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    decoding="async"
                    className="h-10 w-8 flex-none border border-border/60 object-cover"
                  />
                )}
                <span
                  aria-hidden
                  className="h-4 w-4 flex-none rounded-full border border-asc-ink/20"
                  style={{ background: swatchBackground(p.variant, p.name) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-sm leading-tight">{p.name}</span>
                  <span className="block text-[10px] tracking-luxe uppercase text-muted-foreground">
                    {categoryLabel(p.category)}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
    </>
  );
}

/* ---------- editar ---------- */

function AlbumEditor({
  album,
  candidatos,
  ocupado,
  onSalvar,
}: {
  album: VariantGroup;
  candidatos: Product[];
  ocupado: boolean;
  onSalvar: (entries: Array<{ id: string; meta: VariantMeta | null }>) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [adicionando, setAdicionando] = useState<string[]>([]);
  // Ajustes de cor pendentes, por peça. Salvar a cada tecla digitada seria uma
  // escrita por caractere; o botão "Salvar cores" fecha a conta de uma vez.
  const [rascunho, setRascunho] = useState<Record<string, Partial<VariantMeta>>>({});

  const membros = album.members;
  const pendente = Object.keys(rascunho).length > 0;

  /** Grava a lista inteira; quem sair do álbum vai junto, com meta `null`. */
  const aplicar = async (
    ordem: Product[],
    primaryId: string,
    removidos: Product[] = [],
    metas: Record<string, Partial<VariantMeta>> = rascunho,
  ) => {
    const plano = planGroup(
      album.id,
      album.label,
      ordem.map((p) => ({ product: p, meta: metas[p.id] })),
      primaryId,
    );
    const ok = await onSalvar([...plano, ...removidos.map((p) => ({ id: p.id, meta: null }))]);
    if (ok) setRascunho({});
  };

  const principal = album.primary.id;

  const mover = (i: number, delta: number) => {
    const destino = i + delta;
    if (destino < 0 || destino >= membros.length) return;
    const ordem = [...membros];
    [ordem[i], ordem[destino]] = [ordem[destino], ordem[i]];
    void aplicar(ordem, principal);
  };

  const remover = (p: Product) => {
    const restantes = membros.filter((m) => m.id !== p.id);
    // Sobrando uma peça só, o álbum deixa de existir: `planGroup` devolve
    // `null` para ela, e a peça volta a ser um card solto na vitrine.
    void aplicar(
      restantes,
      restantes.some((m) => m.id === principal) ? principal : (restantes[0]?.id ?? ""),
      [p],
    );
  };

  const adicionar = () => {
    const novas = adicionando
      .map((id) => candidatos.find((p) => p.id === id))
      .filter((p): p is Product => !!p);
    if (!novas.length) return;
    setAdicionando([]);
    void aplicar([...membros, ...novas], principal);
  };

  return (
    <div className="border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {album.primary.image && (
            <img
              src={productImageSrc(album.primary.image, 480)}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="h-12 w-9 flex-none border border-border/60 object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-serif text-sm leading-tight">{album.label}</p>
            <p className="mt-0.5 text-[10px] tracking-luxe uppercase text-muted-foreground">
              {membros.length} cores · capa: {swatchLabel(album.primary)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {membros.map((m) => (
              <span
                key={m.id}
                title={swatchLabel(m)}
                aria-hidden
                className="h-4 w-4 rounded-full border border-asc-ink/20"
                style={{ background: swatchBackground(m.variant, m.name) }}
              />
            ))}
          </div>
          <button
            onClick={() => setAberto((v) => !v)}
            className="border border-border px-3 py-1.5 text-[10px] tracking-luxe uppercase text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            {aberto ? "Fechar" : "Editar"}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="px-4 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-luxe uppercase text-muted-foreground">
                <th className="py-2 pr-3">Ordem</th>
                <th className="py-2 pr-3">Peça</th>
                <th className="py-2 pr-3">Peça · Logo</th>
                <th className="py-2 pr-3">Nome da cor</th>
                <th className="py-2 pr-3 text-right">Principal</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {membros.map((m, i) => {
                const meta = { ...(m.variant ?? {}), ...(rascunho[m.id] ?? {}) };
                const auto = detectarCores(m.name);
                const ajustar = (patch: Partial<VariantMeta>) =>
                  setRascunho((r) => ({ ...r, [m.id]: { ...(r[m.id] ?? {}), ...patch } }));
                return (
                  <tr key={m.id} className="border-b border-border/50 align-middle">
                    <td className="py-2 pr-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => mover(i, -1)}
                          disabled={i === 0 || ocupado}
                          aria-label="Subir"
                          className="border border-border p-1 text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-30"
                        >
                          <ArrowUp className="h-3 w-3" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => mover(i, 1)}
                          disabled={i === membros.length - 1 || ocupado}
                          aria-label="Descer"
                          className="border border-border p-1 text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-30"
                        >
                          <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
                        </button>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {m.image && (
                          <img
                            src={productImageSrc(m.image, 480)}
                            alt=""
                            aria-hidden
                            loading="lazy"
                            decoding="async"
                            className="h-10 w-8 flex-none border border-border/60 object-cover"
                          />
                        )}
                        <span className="line-clamp-2 font-serif text-xs leading-tight">
                          {m.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={hexSeguro(meta.color ?? auto.color)}
                          onChange={(e) => ajustar({ color: e.target.value })}
                          aria-label={`Cor da peça — ${m.name}`}
                          className="h-7 w-7 cursor-pointer border border-border bg-transparent p-0"
                        />
                        <input
                          type="color"
                          value={hexSeguro(meta.accent ?? auto.accent)}
                          onChange={(e) => ajustar({ accent: e.target.value })}
                          aria-label={`Cor do logo — ${m.name}`}
                          className="h-7 w-7 cursor-pointer border border-border bg-transparent p-0"
                        />
                        <span
                          aria-hidden
                          title="Prévia do seletor"
                          className="h-6 w-6 rounded-full border border-asc-ink/20"
                          style={{ background: swatchBackground(meta as VariantMeta, m.name) }}
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={meta.colorLabel ?? auto.colorLabel ?? ""}
                        onChange={(e) => ajustar({ colorLabel: e.target.value })}
                        placeholder="Preta com logo vermelho"
                        className="w-full min-w-[10rem] border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        onClick={() => void aplicar(membros, m.id)}
                        disabled={ocupado}
                        aria-pressed={m.id === principal}
                        title={
                          m.id === principal
                            ? "Esta é a peça principal"
                            : "Definir como peça principal"
                        }
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap border px-2.5 py-1.5 text-[10px] tracking-luxe uppercase transition-colors disabled:opacity-40 ${
                          m.id === principal
                            ? "border-accent bg-accent text-asc-ink"
                            : "border-border text-muted-foreground hover:border-accent hover:text-accent"
                        }`}
                      >
                        <Star
                          className="h-3 w-3"
                          strokeWidth={1.5}
                          fill={m.id === principal ? "currentColor" : "none"}
                        />
                        {m.id === principal ? "Principal" : "Definir"}
                      </button>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => remover(m)}
                        disabled={ocupado}
                        aria-label={`Tirar ${m.name} do álbum`}
                        title="Tirar do álbum (a peça continua no catálogo)"
                        className="border border-destructive/50 p-1.5 text-destructive transition-colors hover:bg-destructive hover:text-ivory disabled:opacity-40"
                      >
                        <X className="h-3 w-3" strokeWidth={1.5} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void aplicar(membros, principal)}
              disabled={!pendente || ocupado}
              className="asc-btn-primary px-4 py-2 text-[10px] tracking-luxe uppercase disabled:opacity-40"
            >
              <Check className="mr-1.5 inline h-3 w-3" strokeWidth={2} /> Salvar cores
            </button>
            <button
              onClick={() => void aplicar([], "", membros)}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 border border-destructive/50 px-3 py-2 text-[10px] tracking-luxe uppercase text-destructive transition-colors hover:bg-destructive hover:text-ivory disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.5} /> Desfazer álbum
            </button>
            {pendente && (
              <span className="text-[10px] text-muted-foreground">Há cores não salvas.</span>
            )}
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
              Adicionar cor ao álbum
            </p>
            <SeletorDePecas
              candidatos={candidatos}
              selecionados={adicionando}
              onToggle={(id) =>
                setAdicionando((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
              }
            />
            <button
              onClick={adicionar}
              disabled={adicionando.length === 0 || ocupado}
              className="mt-3 inline-flex items-center gap-1.5 border border-accent px-3 py-2 text-[10px] tracking-luxe uppercase text-accent transition-colors hover:bg-accent hover:text-asc-ink disabled:opacity-40"
            >
              <Plus className="h-3 w-3" strokeWidth={2} /> Adicionar ao álbum
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- sugestões (opção B) ---------- */

function Sugestao({
  sugestao,
  ocupado,
  onAprovar,
  onDispensar,
}: {
  sugestao: SugestaoAlbum;
  ocupado: boolean;
  onAprovar: () => void;
  onDispensar: () => void;
}) {
  return (
    <div className="border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-serif text-sm">{sugestao.label}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={onAprovar}
            disabled={ocupado}
            className="asc-btn-primary px-3 py-1.5 text-[10px] tracking-luxe uppercase disabled:opacity-40"
          >
            Aprovar e agrupar
          </button>
          <button
            onClick={onDispensar}
            className="border border-border px-3 py-1.5 text-[10px] tracking-luxe uppercase text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            Dispensar
          </button>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-3">
        {sugestao.products.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="h-4 w-4 rounded-full border border-asc-ink/20"
              style={{ background: swatchBackground(p.variant, p.name) }}
            />
            {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O nome do álbum proposto a partir do nome de uma peça. */
function nomeSemCor(nome: string): string {
  const partes = nome.split(/\s[–—-]\s/);
  if (partes.length > 1 && detectarCores(partes.slice(1).join(" ")).color) return partes[0].trim();
  return nome.trim();
}
