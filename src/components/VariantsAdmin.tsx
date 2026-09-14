import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FolderTree,
  Layers,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { formatBRL, type Product } from "@/lib/cart-context";
import { totalStock, useCatalog, type SizeStock } from "@/lib/catalog-context";
import {
  categoryLabel,
  coerceCategory,
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from "@/lib/categories";
import { productImageSrc } from "@/lib/product-images";
import {
  albumCategories,
  albumSizes,
  detectarCores,
  normalizar,
  PRECO_MINIMO,
  parsePreco,
  planCategories,
  planGroup,
  planPrices,
  planStock,
  slugify,
  suggestGroups,
  swatchBackground,
  swatchLabel,
  type AjustePreco,
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
  const {
    products,
    groups,
    stock,
    saveGroup,
    setPrices,
    setStocks,
    setCategories,
    missingColumns,
    refresh,
  } = useCatalog();
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

  const gravarPrecos = async (entries: Array<{ id: string; price: number }>) => {
    setErro(null);
    setSalvando(true);
    const msg = await setPrices(entries);
    setSalvando(false);
    if (msg) setErro(msg);
    return !msg;
  };

  const gravarEstoque = async (entries: Array<{ id: string; stock: SizeStock }>) => {
    setErro(null);
    setSalvando(true);
    const msg = await setStocks(entries);
    setSalvando(false);
    if (msg) setErro(msg);
    return !msg;
  };

  const gravarCategoria = async (entries: Array<{ id: string; category: ProductCategory }>) => {
    setErro(null);
    setSalvando(true);
    const msg = await setCategories(entries);
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
              onPrecos={gravarPrecos}
              estoque={stock}
              onEstoque={gravarEstoque}
              onCategoria={gravarCategoria}
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
  onPrecos,
  estoque,
  onEstoque,
  onCategoria,
}: {
  album: VariantGroup;
  candidatos: Product[];
  ocupado: boolean;
  onSalvar: (entries: Array<{ id: string; meta: VariantMeta | null }>) => Promise<boolean>;
  onPrecos: (entries: Array<{ id: string; price: number }>) => Promise<boolean>;
  estoque: Record<string, SizeStock>;
  onEstoque: (entries: Array<{ id: string; stock: SizeStock }>) => Promise<boolean>;
  onCategoria: (entries: Array<{ id: string; category: ProductCategory }>) => Promise<boolean>;
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
                <th className="py-2 pr-3 text-right">Preço</th>
                <th className="py-2 pr-3 text-right">Estoque</th>
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
                    <td className="py-2 pr-3 text-right font-serif text-xs tabular-nums">
                      {Number(m.price) > 0 ? (
                        formatBRL(m.price)
                      ) : (
                        <span
                          className="text-destructive"
                          title="Peça sem preço: aparece como R$ 0,00 na vitrine e o pagamento é recusado."
                        >
                          Sem preço
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right text-xs tabular-nums">
                      {totalStock(estoque[m.id]) > 0 ? (
                        `${totalStock(estoque[m.id])} un.`
                      ) : (
                        <span className="text-destructive">Esgotado</span>
                      )}
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

          <PrecoDoAlbum membros={membros} ocupado={ocupado} onAplicar={onPrecos} />

          <EstoqueDoAlbum
            membros={membros}
            principal={album.primary}
            estoque={estoque}
            ocupado={ocupado}
            onAplicar={onEstoque}
          />

          <CategoriaDoAlbum membros={membros} ocupado={ocupado} onAplicar={onCategoria} />

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

/* ---------- preço do álbum ---------- */

const MODOS: ReadonlyArray<{ id: AjustePreco["modo"]; rotulo: string; ajuda: string }> = [
  {
    id: "igualar",
    rotulo: "Mesmo preço",
    ajuda: "Todas as cores passam a custar o valor digitado.",
  },
  {
    id: "percentual",
    rotulo: "Porcentagem",
    ajuda: "Cada cor muda na mesma proporção — a que custava mais continua custando mais.",
  },
  {
    id: "reais",
    rotulo: "Valor em R$",
    ajuda: "Cada cor muda no mesmo número de reais.",
  },
];

/**
 * O preço do álbum inteiro, numa conta só.
 *
 * Cada cor é uma peça própria no catálogo — é isso que faz carrinho, checkout e
 * estoque saírem certos —, e o preço mora nela. O efeito colateral é que baixar
 * uma linha de sete cores significava abrir sete peças, com a chance de a
 * sétima ficar pelo preço velho na vitrine. Aqui o admin escolhe o quanto, vê
 * como cada cor fica e grava as sete de uma vez.
 *
 * Nada vai para o banco antes da prévia: o valor digitado só vira gravação no
 * botão, e a lista abaixo mostra de quanto para quanto cada cor vai.
 */
function PrecoDoAlbum({
  membros,
  ocupado,
  onAplicar,
}: {
  membros: Product[];
  ocupado: boolean;
  onAplicar: (entries: Array<{ id: string; price: number }>) => Promise<boolean>;
}) {
  const [modo, setModo] = useState<AjustePreco["modo"]>("igualar");
  const [direcao, setDirecao] = useState<"baixar" | "subir">("baixar");
  const [texto, setTexto] = useState("");

  const digitado = parsePreco(texto);
  // Sinal só existe em porcentagem e em reais: "mesmo preço" é um destino, não
  // um movimento. Zero e negativo digitado não valem — o sinal vem do botão.
  const ajuste: AjustePreco | null =
    digitado === null || digitado <= 0
      ? null
      : modo === "igualar"
        ? { modo: "igualar", valor: digitado }
        : { modo, valor: direcao === "baixar" ? -digitado : digitado };

  const plano = ajuste ? planPrices(membros, ajuste) : [];
  const novos = new Map(plano.map((e) => [e.id, e.price]));
  const noPiso = plano.some((e) => e.price === PRECO_MINIMO);

  const aplicar = async () => {
    if (!plano.length) return;
    const ok = await onAplicar(plano);
    if (ok) setTexto("");
  };

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <Tag className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
          Preço de todas as cores
        </p>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Muda de uma vez o preço das {membros.length} cores deste álbum — sem abrir peça por peça.
        Confira a prévia antes de gravar.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {MODOS.map((m) => (
          <button
            key={m.id}
            onClick={() => setModo(m.id)}
            aria-pressed={modo === m.id}
            className={`border px-3 py-1.5 text-[10px] tracking-luxe uppercase transition-colors ${
              modo === m.id
                ? "border-accent bg-accent text-asc-ink"
                : "border-border text-muted-foreground hover:border-accent hover:text-accent"
            }`}
          >
            {m.rotulo}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {MODOS.find((m) => m.id === modo)?.ajuda}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {modo !== "igualar" &&
          (["baixar", "subir"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirecao(d)}
              aria-pressed={direcao === d}
              className={`border px-3 py-2 text-[10px] tracking-luxe uppercase transition-colors ${
                direcao === d
                  ? "border-accent text-accent"
                  : "border-border text-muted-foreground hover:border-accent hover:text-accent"
              }`}
            >
              {d === "baixar" ? "Baixar" : "Subir"}
            </button>
          ))}

        <div className="flex items-center gap-1.5 border border-border bg-background px-3 py-2">
          {modo !== "percentual" && <span className="text-xs text-muted-foreground">R$</span>}
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            inputMode="decimal"
            placeholder={modo === "percentual" ? "10" : "199,90"}
            aria-label={
              modo === "igualar"
                ? "Novo preço de todas as cores"
                : modo === "percentual"
                  ? "Porcentagem"
                  : "Valor em reais"
            }
            className="w-24 bg-transparent text-sm outline-none"
          />
          {modo === "percentual" && <span className="text-xs text-muted-foreground">%</span>}
        </div>

        <button
          onClick={() => void aplicar()}
          disabled={plano.length === 0 || ocupado}
          className="asc-btn-primary px-4 py-2 text-[10px] tracking-luxe uppercase disabled:opacity-40"
        >
          <Check className="mr-1.5 inline h-3 w-3" strokeWidth={2} /> Aplicar a todas as cores
        </button>
      </div>

      {ajuste &&
        (plano.length === 0 ? (
          <p className="mt-3 text-[10px] text-muted-foreground">
            Nenhuma cor muda de preço com esse valor.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5 border border-border/60 px-3 py-2">
            {membros.map((m) => {
              const novo = novos.get(m.id);
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 flex-none rounded-full border border-asc-ink/20"
                      style={{ background: swatchBackground(m.variant, m.name) }}
                    />
                    <span className="truncate text-muted-foreground">{swatchLabel(m)}</span>
                  </span>
                  <span className="flex-none whitespace-nowrap tabular-nums">
                    <span className={novo === undefined ? "text-muted-foreground" : "line-through"}>
                      {formatBRL(m.price)}
                    </span>
                    {novo !== undefined && (
                      <span className="ml-2 font-serif text-accent">{formatBRL(novo)}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ))}

      {noPiso && (
        <p className="mt-2 text-[10px] leading-relaxed text-destructive">
          O desconto zeraria o preço de alguma cor. Peça sem preço tem o pagamento recusado, então
          ela para em {formatBRL(PRECO_MINIMO)} — confira a prévia antes de aplicar.
        </p>
      )}
    </div>
  );
}

/* ---------- estoque do álbum ---------- */

/**
 * A grade de tamanhos do álbum, digitada uma vez e gravada em todas as cores.
 *
 * O mesmo motivo do preço: a grade chega igual para todas as cores do modelo —
 * duas de cada tamanho, em todas —, e gravá-la significava abrir cor por cor e
 * repetir os mesmos números, com a chance de a última ficar esgotada na vitrine
 * sem ninguém notar. O botão "Copiar de" puxa o que uma cor já tem, para o caso
 * comum de o álbum ganhar uma cor nova depois.
 *
 * O que for aplicado substitui a grade da cor inteira, inclusive apagando um
 * tamanho que ela tinha e o álbum não tem — é assim que uma grade mista
 * (resquício de cadastro antigo) se conserta de uma vez. Nada vai para o banco
 * antes da prévia.
 */
function EstoqueDoAlbum({
  membros,
  principal,
  estoque,
  ocupado,
  onAplicar,
}: {
  membros: Product[];
  principal: Product;
  estoque: Record<string, SizeStock>;
  ocupado: boolean;
  onAplicar: (entries: Array<{ id: string; stock: SizeStock }>) => Promise<boolean>;
}) {
  // Tamanho tirado da grade some do campo e, ao aplicar, some do cadastro de
  // todas as cores — é o conserto de uma grade mista ("P" e "40" na mesma peça,
  // resquício de cadastro antigo), que a vitrine hoje mostra como esgotado.
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const tamanhos = albumSizes(membros, estoque).filter((t) => !excluidos.includes(t));
  // Começa na grade da peça principal, e não em zero: o valor de partida do
  // campo é o que já está no ar, para quem abrir o painel e clicar em aplicar
  // sem ler não esgotar o álbum inteiro sem querer.
  const [rascunho, setRascunho] = useState<Record<string, string>>(() =>
    Object.fromEntries(tamanhos.map((t) => [t, String(estoque[principal.id]?.[t] ?? 0)])),
  );

  const grade: SizeStock = Object.fromEntries(
    tamanhos.map((t) => [t, Math.max(0, Math.floor(Number(rascunho[t]) || 0))]),
  );
  const porCor = totalStock(grade);
  const plano = planStock(membros, estoque, grade);

  const copiarDe = (p: Product) =>
    setRascunho(Object.fromEntries(tamanhos.map((t) => [t, String(estoque[p.id]?.[t] ?? 0)])));

  const aplicar = async () => {
    if (!plano.length) return;
    const ok = await onAplicar(plano);
    // Gravou: o tamanho tirado já não existe em nenhuma cor, então a união das
    // grades volta a ser a verdade e a exclusão local deixa de ser necessária.
    if (ok) setExcluidos([]);
  };

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
          Estoque de todas as cores
        </p>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Digite a grade uma vez e ela vale para as {membros.length} cores deste álbum. A grade
        aplicada substitui a da cor inteira — confira a prévia antes de gravar.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">Copiar de</span>
        {membros.map((m) => (
          <button
            key={m.id}
            onClick={() => copiarDe(m)}
            title={`Preencher com o estoque de ${swatchLabel(m)}`}
            className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1.5 text-[10px] tracking-luxe uppercase text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            <span
              aria-hidden
              className="h-3 w-3 rounded-full border border-asc-ink/20"
              style={{ background: swatchBackground(m.variant, m.name) }}
            />
            {totalStock(estoque[m.id])} un.
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {tamanhos.map((t) => (
          <div key={t} className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] tracking-luxe uppercase text-muted-foreground">
              {t}
              <button
                onClick={() => setExcluidos((v) => [...v, t])}
                aria-label={`Tirar o tamanho ${t} da grade`}
                title="Tirar este tamanho da grade do álbum"
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-2.5 w-2.5" strokeWidth={2.5} />
              </button>
            </span>
            <input
              value={rascunho[t] ?? "0"}
              onChange={(e) => setRascunho((r) => ({ ...r, [t]: e.target.value }))}
              inputMode="numeric"
              aria-label={`Quantidade do tamanho ${t}`}
              className="w-16 border border-border bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent"
            />
          </div>
        ))}
        <button
          onClick={() => void aplicar()}
          disabled={plano.length === 0 || ocupado}
          className="asc-btn-primary px-4 py-2 text-[10px] tracking-luxe uppercase disabled:opacity-40"
        >
          <Check className="mr-1.5 inline h-3 w-3" strokeWidth={2} /> Aplicar a todas as cores
        </button>
      </div>

      {tamanhos.length === 0 ? (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Sem tamanho na grade não há o que gravar — o estoque de uma peça é a grade dela.
        </p>
      ) : plano.length === 0 ? (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Todas as cores já estão nessa grade.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5 border border-border/60 px-3 py-2">
          {membros.map((m) => {
            const muda = plano.some((e) => e.id === m.id);
            const antes = totalStock(estoque[m.id]);
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 flex-none rounded-full border border-asc-ink/20"
                    style={{ background: swatchBackground(m.variant, m.name) }}
                  />
                  <span className="truncate text-muted-foreground">{swatchLabel(m)}</span>
                </span>
                <span className="flex-none whitespace-nowrap tabular-nums">
                  <span className={muda ? "line-through" : "text-muted-foreground"}>
                    {antes} un.
                  </span>
                  {muda && <span className="ml-2 font-serif text-accent">{porCor} un.</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {porCor === 0 && plano.length > 0 && (
        <p className="mt-2 text-[10px] leading-relaxed text-destructive">
          A grade está toda em zero: aplicar assim deixa as {membros.length} cores esgotadas na
          vitrine.
        </p>
      )}
    </div>
  );
}

/* ---------- categoria do álbum ---------- */

/**
 * A categoria das cores do álbum, escolhida uma vez para todas.
 *
 * Aqui não é só conveniência: a vitrine filtra por categoria **antes** de juntar
 * o álbum num card só, então uma cor cadastrada em outra aba não vira uma
 * bolinha a mais — vira um card solto lá, e o mesmo modelo passa a aparecer
 * duas vezes na loja, com capas diferentes. Quando isso acontece, o painel diz
 * em que abas o álbum está espalhado, em vez de deixar o admin descobrir pela
 * vitrine.
 */
function CategoriaDoAlbum({
  membros,
  ocupado,
  onAplicar,
}: {
  membros: Product[];
  ocupado: boolean;
  onAplicar: (entries: Array<{ id: string; category: ProductCategory }>) => Promise<boolean>;
}) {
  const atuais = albumCategories(membros);
  const espalhado = atuais.length > 1;
  // Álbum inteiro numa categoria só: o botão dela já chega marcado, e não há o
  // que aplicar até o admin escolher outra. Espalhado, ninguém chega escolhido —
  // qual das abas é a certa é decisão dele.
  const [escolhida, setEscolhida] = useState<ProductCategory | null>(
    espalhado ? null : (atuais[0] ?? null),
  );

  const plano = escolhida ? planCategories(membros, escolhida) : [];
  const quantasMudam = `${plano.length} ${plano.length === 1 ? "cor muda" : "cores mudam"}`;

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <FolderTree className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
          Categoria de todas as cores
        </p>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Manda as {membros.length} cores deste álbum para a mesma aba da vitrine — Roupas, Sneakers
        ou Acessórios.
      </p>

      {espalhado && (
        <p className="mt-2 text-[10px] leading-relaxed text-[color:var(--gold)]">
          As cores estão em abas diferentes ({atuais.map(categoryLabel).join(" e ")}), então o mesmo
          modelo aparece mais de uma vez na vitrine. Escolha a aba certa e aplique.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {PRODUCT_CATEGORIES.map((c) => {
          const quantas = membros.filter((m) => coerceCategory(m.category) === c).length;
          return (
            <button
              key={c}
              onClick={() => setEscolhida(c)}
              aria-pressed={escolhida === c}
              className={`border px-3 py-1.5 text-[10px] tracking-luxe uppercase transition-colors ${
                escolhida === c
                  ? "border-accent bg-accent text-asc-ink"
                  : "border-border text-muted-foreground hover:border-accent hover:text-accent"
              }`}
            >
              {categoryLabel(c)}
              {quantas > 0 && ` · ${quantas}`}
            </button>
          );
        })}

        <button
          onClick={() => void onAplicar(plano)}
          disabled={plano.length === 0 || ocupado}
          className="asc-btn-primary px-4 py-2 text-[10px] tracking-luxe uppercase disabled:opacity-40"
        >
          <Check className="mr-1.5 inline h-3 w-3" strokeWidth={2} /> Aplicar a todas as cores
        </button>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {escolhida === null
          ? "Escolha a aba em que este álbum deve ficar."
          : plano.length === 0
            ? `Todas as cores já estão em ${categoryLabel(escolhida)}.`
            : `${quantasMudam} para ${categoryLabel(escolhida)}.`}
      </p>
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
