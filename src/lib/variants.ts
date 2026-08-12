import type { Product } from "@/lib/cart-context";
import { coerceCategory } from "@/lib/categories";

/**
 * Variações de cor — o álbum de uma peça.
 *
 * O catálogo continua sendo uma peça por linha: a camiseta preta com logo
 * branco e a preta com logo vermelho são dois produtos, com foto, preço,
 * estoque, SKU e URL próprios. Isso é o que faz carrinho, checkout, pedido e
 * e-mail já saírem certos — nada disso precisou aprender o que é variação.
 *
 * O que muda é a vitrine: peças do mesmo álbum aparecem como um card só, o da
 * peça principal, com os seletores de cor embaixo da foto. Clicar num seletor
 * abre a variação — que é uma página de produto normal, a dela.
 *
 * Tudo que amarra um álbum mora numa coluna JSONB só (`products.variant`).
 * Poderiam ser sete colunas; seria sete vezes o risco de o código subir antes
 * da migração e a loja ficar sem catálogo (ver a escada de colunas opcionais em
 * `catalog-context`). O agrupamento é lido inteiro no navegador, e não filtrado
 * no banco, então não há nada a indexar aqui.
 */

export type VariantMeta = {
  /** Identificador do álbum. Slug do nome escolhido pelo admin. */
  group: string;
  /** Nome do álbum, exibido no painel. Todos os membros gravam o mesmo. */
  label?: string;
  /** Ordem dos seletores de cor. Menor primeiro; empate desempata pelo nome. */
  position?: number;
  /** A peça que representa o álbum na vitrine, na busca e nos banners. */
  primary?: boolean;
  /** Cor principal da peça, em hex. É a primeira metade do seletor. */
  color?: string;
  /** Cor do logo, em hex. Quando existe, o seletor sai dividido ao meio. */
  accent?: string;
  /** Como a cor se chama ("Preta com logo vermelho"). Vai para o alt e o title. */
  colorLabel?: string;
};

export type VariantGroup = {
  id: string;
  label: string;
  /** Membros na ordem dos seletores. Nunca vazio. */
  members: Product[];
  /** Peça exibida na vitrine: a marcada como principal, ou a primeira. */
  primary: Product;
};

/* ---------- normalização ---------- */

/** Sem acento e em caixa baixa — a forma em que nomes são comparados aqui. */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Slug de URL e de identificador de álbum: só letras, números e hífen.
 *
 * Vazio vira "peca" — um slug em branco quebraria a URL da variação, e é
 * melhor uma URL feia que uma URL inválida.
 */
export function slugify(texto: string): string {
  const s = normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || "peca";
}

/* ---------- URL amigável ---------- */

/**
 * O parâmetro da rota `/produto/$id`.
 *
 * Era o UUID puro. Passa a ser `nome-da-peca--<uuid>`: o nome é o que o cliente
 * (e o robô de busca) lê na barra de endereço, e o UUID no fim é o que a página
 * usa para achar a peça. O separador é duplo de propósito — o slug já usa hífen
 * simples, e é o `--` que diz onde ele termina.
 *
 * Nada quebra nos links antigos: `productIdFromParam` aceita o UUID sozinho.
 */
export function productParam(p: { id: string; name?: string | null }): string {
  const nome = (p.name ?? "").trim();
  return nome ? `${slugify(nome)}--${p.id}` : p.id;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * O id da peça dentro do parâmetro da rota.
 *
 * Aceita as três formas que podem chegar: `slug--uuid` (a de hoje), `uuid`
 * puro (links compartilhados antes desta mudança) e qualquer outra coisa, que
 * volta intocada — id de catálogo antigo não era necessariamente UUID, e
 * devolver a entrada deixa a busca no catálogo decidir se existe ou não.
 */
export function productIdFromParam(param: string): string {
  if (!param) return "";
  const corte = param.lastIndexOf("--");
  const cauda = corte >= 0 ? param.slice(corte + 2) : param;
  const m = UUID.exec(cauda);
  if (m) return m[0];
  return corte >= 0 ? cauda : param;
}

/* ---------- cores ---------- */

/**
 * Cores que aparecem nos nomes das peças, com o hex que o seletor pinta.
 *
 * Serve para o cadastro não começar do zero: ao montar um álbum, o painel já
 * chega com a cor da peça e a do logo preenchidas a partir do nome
 * ("Preta com Logo Vermelho"). O admin corrige o que quiser — quem manda no
 * seletor é o que está gravado, não o palpite.
 *
 * As entradas de duas palavras precisam vir antes das de uma ("azul marinho"
 * antes de "azul"), e a busca abaixo respeita essa ordem.
 */
export const CORES: ReadonlyArray<readonly [string, string]> = [
  ["azul marinho", "#1B2A4A"],
  ["azul bebe", "#A8C8E8"],
  ["azul claro", "#7FB2E5"],
  ["azul royal", "#1E3FAE"],
  ["verde militar", "#4A5240"],
  ["verde oliva", "#6B6B3A"],
  ["verde musgo", "#3E4A32"],
  ["off white", "#F2EFE9"],
  ["branco", "#FFFFFF"],
  ["branca", "#FFFFFF"],
  ["preto", "#111111"],
  ["preta", "#111111"],
  ["vermelho", "#C1121F"],
  ["vermelha", "#C1121F"],
  ["amarelo", "#E6B422"],
  ["amarela", "#E6B422"],
  ["laranja", "#D2691E"],
  ["rosa", "#E8A0B4"],
  ["roxo", "#5B3A82"],
  ["roxa", "#5B3A82"],
  ["lilas", "#B39DDB"],
  ["marrom", "#5B3A26"],
  ["caramelo", "#A9713B"],
  ["camel", "#B98A5A"],
  ["bege", "#D9C7A8"],
  ["areia", "#DCCBA9"],
  ["creme", "#EFE6D3"],
  ["cru", "#E6DCC8"],
  ["nude", "#DFC3AE"],
  ["gelo", "#EDF1F2"],
  ["cinza", "#8A8A8A"],
  ["grafite", "#3C3F44"],
  ["chumbo", "#4B4F54"],
  ["prata", "#C0C4C9"],
  ["dourado", "#C5A059"],
  ["dourada", "#C5A059"],
  ["vinho", "#5C1A26"],
  ["bordo", "#5C1A26"],
  ["mostarda", "#C9922B"],
  ["salmao", "#F1A08A"],
  ["turquesa", "#3FB6B0"],
  ["azul", "#2E5AAC"],
  ["verde", "#2E6B45"],
];

export type CorDetectada = {
  /** Cor da peça. */
  color?: string;
  /** Cor do logo, quando o nome menciona uma segunda cor. */
  accent?: string;
  /** As palavras de cor achadas, na ordem ("Preta com logo vermelho"). */
  colorLabel?: string;
};

/** Acha a primeira cor do texto e devolve também onde ela termina. */
function primeiraCor(texto: string): { nome: string; hex: string; fim: number } | null {
  let melhor: { nome: string; hex: string; inicio: number; fim: number } | null = null;
  for (const [nome, hex] of CORES) {
    // `\b` não serve: "azul" está dentro de "azulado", mas também precisa casar
    // em "azul-marinho". A borda aqui é "não-letra ou ponta do texto".
    const re = new RegExp(`(^|[^a-z])${nome}([^a-z]|$)`);
    const m = re.exec(texto);
    if (!m) continue;
    const inicio = m.index + m[1].length;
    if (!melhor || inicio < melhor.inicio) {
      melhor = { nome, hex, inicio, fim: inicio + nome.length };
    }
  }
  return melhor ? { nome: melhor.nome, hex: melhor.hex, fim: melhor.fim } : null;
}

/**
 * Lê as cores do nome da peça.
 *
 * O caso que motivou tudo isto: "Camiseta Básica Polo Ralph Lauren – Preta com
 * Logo Vermelho". Duas cores, e um quadradinho preto sozinho não distingue essa
 * peça da preta com logo branco. A primeira cor é a da peça; a que vier depois
 * da palavra "logo" é a do logo.
 */
export function detectarCores(nome: string): CorDetectada {
  const texto = normalizar(nome);
  const marcaLogo = texto.search(/\blogo\b/);

  const antes = marcaLogo >= 0 ? texto.slice(0, marcaLogo) : texto;
  const depois = marcaLogo >= 0 ? texto.slice(marcaLogo) : "";

  const corPeca = primeiraCor(antes);
  const corLogo = depois ? primeiraCor(depois) : null;

  // Nome que só cita a cor depois do "logo" ("Camiseta com Logo Vermelho"):
  // a única cor que existe é a do logo, e ela vira a cor da peça — melhor um
  // seletor de uma cor só do que nenhum.
  if (!corPeca && corLogo) {
    return { color: corLogo.hex, colorLabel: capitalizar(corLogo.nome) };
  }
  if (!corPeca) return {};

  const rotulo = corLogo
    ? `${capitalizar(corPeca.nome)} com logo ${corLogo.nome}`
    : capitalizar(corPeca.nome);

  return {
    color: corPeca.hex,
    accent: corLogo?.hex,
    colorLabel: rotulo,
  };
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * O nome sem a parte que só descreve a cor.
 *
 * "Camiseta Básica Polo Ralph Lauren – Preta com Logo Vermelho" vira "camiseta
 * basica polo ralph lauren". É a chave que a sugestão automática usa para
 * desconfiar que duas peças são o mesmo modelo.
 */
export function nomeBase(nome: string): string {
  let texto = normalizar(nome);

  // O traço separa modelo de cor na convenção da loja. Só corta se o que vem
  // depois for mesmo descrição de cor — "Camisa - Edição Inverno" não é.
  const partes = texto.split(/\s[–—-]\s|\s[–—-]$/);
  if (partes.length > 1) {
    const cauda = partes.slice(1).join(" ");
    if (primeiraCor(cauda)) texto = partes[0];
  }

  for (const [cor] of CORES) {
    texto = texto.replace(new RegExp(`(^|[^a-z])${cor}([^a-z]|$)`, "g"), "$1$2");
  }
  return texto
    .replace(/\blogo\b|\bcom\b|\bcor\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ---------- leitura da coluna ---------- */

/**
 * Normaliza o JSONB gravado. Linha sem álbum (ou com lixo antigo) devolve
 * `null` — o resto do app trata "sem variação" como o caso comum, que é.
 */
export function coerceVariant(v: unknown): VariantMeta | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const group = typeof o.group === "string" ? o.group.trim() : "";
  if (!group) return null;

  const meta: VariantMeta = { group };
  if (typeof o.label === "string" && o.label.trim()) meta.label = o.label.trim();
  if (Number.isFinite(Number(o.position))) meta.position = Number(o.position);
  if (o.primary === true) meta.primary = true;
  if (typeof o.color === "string" && o.color.trim()) meta.color = o.color.trim();
  if (typeof o.accent === "string" && o.accent.trim()) meta.accent = o.accent.trim();
  if (typeof o.colorLabel === "string" && o.colorLabel.trim())
    meta.colorLabel = o.colorLabel.trim();
  return meta;
}

/* ---------- agrupamento ---------- */

function ordenarMembros(a: Product, b: Product): number {
  const pa = a.variant?.position ?? Number.MAX_SAFE_INTEGER;
  const pb = b.variant?.position ?? Number.MAX_SAFE_INTEGER;
  if (pa !== pb) return pa - pb;
  return a.name.localeCompare(b.name, "pt-BR");
}

/**
 * Os álbuns do catálogo, por id de álbum.
 *
 * Álbum de um membro só não é álbum: ele sai daqui, e a peça volta a ser uma
 * peça solta na vitrine. É o que acontece quando o admin tira a penúltima cor
 * do grupo — sem isso a peça restante mostraria um seletor com uma bolinha.
 */
export function buildGroups(products: readonly Product[]): Map<string, VariantGroup> {
  const porGrupo = new Map<string, Product[]>();
  for (const p of products) {
    const g = p.variant?.group;
    if (!g) continue;
    const lista = porGrupo.get(g);
    if (lista) lista.push(p);
    else porGrupo.set(g, [p]);
  }

  const out = new Map<string, VariantGroup>();
  for (const [id, membros] of porGrupo) {
    if (membros.length < 2) continue;
    membros.sort(ordenarMembros);
    const primary = membros.find((m) => m.variant?.primary === true) ?? membros[0];
    const label = membros.find((m) => m.variant?.label)?.variant?.label ?? primary.name;
    out.set(id, { id, label, members: membros, primary });
  }
  return out;
}

/**
 * A lista que a vitrine mostra: um card por álbum, no lugar de um por cor.
 *
 * @param representante Peça que deve representar o álbum, quando não for a
 *   principal. É o que a busca usa: procurar por "camisa preta" tem de trazer
 *   a preta, ainda que a capa do álbum seja a branca.
 *
 * A posição do card é a do primeiro membro do álbum na lista de entrada, para
 * que a ordenação da vitrine (curadoria, data) continue valendo.
 */
export function collapseVariants(
  products: readonly Product[],
  groups: Map<string, VariantGroup>,
  representante?: (grupo: VariantGroup) => Product | undefined,
): Product[] {
  const vistos = new Set<string>();
  const presentes = new Set(products.map((p) => p.id));
  const out: Product[] = [];
  for (const p of products) {
    const id = p.variant?.group;
    const grupo = id ? groups.get(id) : undefined;
    if (!grupo) {
      out.push(p);
      continue;
    }
    if (vistos.has(grupo.id)) continue;
    vistos.add(grupo.id);
    const escolhida = representante?.(grupo) ?? grupo.primary;
    // A escolhida pode ter sido filtrada fora da lista de entrada (esgotada,
    // fora da aba). Nesse caso vale a peça que chegou aqui.
    out.push(presentes.has(escolhida.id) ? escolhida : p);
  }
  return out;
}

/** O álbum de uma peça, se ela estiver em um. */
export function groupOf(
  p: Product | null | undefined,
  groups: Map<string, VariantGroup>,
): VariantGroup | null {
  const id = p?.variant?.group;
  return id ? (groups.get(id) ?? null) : null;
}

/* ---------- seletor ---------- */

/** Cor de partida de quem não tem nada gravado nem nada a deduzir do nome. */
const COR_PADRAO = "#C9C4BC";

/**
 * O `background` do seletor.
 *
 * Uma cor: bolinha chapada. Duas: dividida ao meio na diagonal — metade a cor
 * da peça, metade a do logo. É o que separa a preta de logo branco da preta de
 * logo vermelho, que era o problema que começou tudo.
 */
export function swatchBackground(meta: VariantMeta | null | undefined, nome = ""): string {
  const auto = meta?.color ? null : detectarCores(nome);
  const cor = meta?.color ?? auto?.color ?? COR_PADRAO;
  const logo = meta?.accent ?? (meta?.color ? undefined : auto?.accent);
  return logo
    ? `linear-gradient(135deg, ${cor} 0 50%, ${logo} 50% 100%)`
    : `linear-gradient(${cor}, ${cor})`;
}

/**
 * Como a cor se chama: o rótulo gravado ou o deduzido do nome. `undefined`
 * quando não há nem um nem outro — aí não há o que escrever, e quem chama
 * decide se cai para o nome da peça (`swatchLabel`) ou se some da tela.
 */
export function colorName(p: Product): string | undefined {
  return p.variant?.colorLabel ?? detectarCores(p.name).colorLabel;
}

/** Como a cor se chama na tela: o rótulo da cor, ou o nome da peça. */
export function swatchLabel(p: Product): string {
  return colorName(p) ?? p.name;
}

/* ---------- sugestão automática (opção B) ---------- */

export type SugestaoAlbum = {
  /** Chave da sugestão — categoria + nome sem cor. */
  id: string;
  /** Nome proposto para o álbum. */
  label: string;
  products: Product[];
};

/** Palavras que não dizem nada sobre o modelo — não contam na comparação. */
const CONECTORES = new Set(["de", "da", "do", "das", "dos", "com", "em", "para", "the"]);

/** Palavras significativas do nome, já sem cor e sem conectores. */
function palavras(base: string): Set<string> {
  return new Set(base.split(/\s+/).filter((t) => t.length >= 3 && !CONECTORES.has(t)));
}

/** Quanto dois nomes se parecem, de 0 a 1 (interseção sobre união). */
function semelhanca(a: Set<string>, b: Set<string>): number {
  let comuns = 0;
  for (const t of a) if (b.has(t)) comuns++;
  const uniao = a.size + b.size - comuns;
  return uniao ? comuns / uniao : 0;
}

/** A partir daqui dois nomes são parecidos o bastante para virar proposta. */
const LIMIAR = 0.5;

/**
 * Desconfia de peças que são o mesmo modelo em cores diferentes.
 *
 * Nunca agrupa nada: devolve propostas para o admin aprovar, uma a uma.
 *
 * A primeira versão exigia o nome IDÊNTICO depois de tirar a cor, e na loja
 * real isso quase nunca acontece: "Shorts de Praia Premium Polo Ralph Lauren"
 * e "Shorts de Banho/Praia Polo Ralph Lauren" são o mesmo modelo em duas
 * cores, e nenhuma proposta aparecia. Agora a comparação é por palavras em
 * comum, com duas travas contra proposta boba:
 *
 *   1. **mesma espécie de peça** — a primeira palavra do nome tem de ser a
 *      mesma. É ela que separa "Camiseta Polo Ralph Lauren" de "Camisa Polo
 *      Ralph Lauren", que compartilham três palavras de marca e não são o
 *      mesmo modelo;
 *   2. **metade das palavras em comum**, contando só as que significam algo
 *      (fora "de", "com", "para") e ignorando as de cor.
 *
 * Mesmo passando nas duas, nada é agrupado sem o admin aprovar — e as peças
 * ficam à vista na proposta, com foto e cor, para ele conferir.
 */
export function suggestGroups(products: readonly Product[]): SugestaoAlbum[] {
  type Candidato = {
    produto: Product;
    /** Espécie da peça: a primeira palavra do nome sem cor ("shorts"). */
    especie: string;
    palavras: Set<string>;
    categoria: string;
    chave: string;
  };

  const candidatos: Candidato[] = [];
  for (const p of products) {
    if (p.variant?.group) continue;
    const base = nomeBase(p.name);
    // Nome que sobra em nada (a peça se chama só "Preta") não entra: juntaria
    // coisas sem relação nenhuma.
    if (base.length < 4) continue;
    if (!detectarCores(p.name).color) continue;
    const categoria = coerceCategory(p.category);
    candidatos.push({
      produto: p,
      especie: base.split(/\s+/)[0] ?? "",
      palavras: palavras(base),
      categoria,
      chave: `${categoria}:${base}`,
    });
  }

  const usados = new Set<string>();
  const out: SugestaoAlbum[] = [];

  for (const semente of candidatos) {
    if (usados.has(semente.produto.id)) continue;
    usados.add(semente.produto.id);

    const grupo = [semente];
    for (const outro of candidatos) {
      if (usados.has(outro.produto.id)) continue;
      if (outro.categoria !== semente.categoria) continue;
      if (outro.especie !== semente.especie) continue;
      if (semelhanca(semente.palavras, outro.palavras) < LIMIAR) continue;
      grupo.push(outro);
      usados.add(outro.produto.id);
    }

    if (grupo.length < 2) {
      // Sozinha não vira proposta — e volta para a fila, porque pode ser
      // parecida com uma peça que ainda nem foi visitada.
      usados.delete(semente.produto.id);
      continue;
    }

    // Todas da mesma cor não é álbum de cores: é repetição de cadastro, e
    // agrupar isso esconderia peça na vitrine sem dar escolha nenhuma.
    const membros = grupo.map((c) => c.produto);
    const cores = new Set(membros.map((m) => JSON.stringify(detectarCores(m.name))));
    if (cores.size < 2) {
      for (const c of grupo) usados.delete(c.produto.id);
      usados.add(semente.produto.id);
      continue;
    }

    membros.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    out.push({ id: semente.chave, label: rotuloDaSugestao(membros), products: membros });
  }

  return out.sort((a, b) => b.products.length - a.products.length);
}

/**
 * Nome do álbum proposto: o nome da primeira peça sem a parte de cor, com as
 * maiúsculas do original preservadas.
 */
function rotuloDaSugestao(membros: readonly Product[]): string {
  const nome = membros[0].name;
  const partes = nome.split(/\s[–—-]\s/);
  if (partes.length > 1 && detectarCores(partes.slice(1).join(" ")).color) return partes[0].trim();
  return nome.trim();
}

/* ---------- gravação ---------- */

/**
 * O que gravar em cada peça de um álbum, na ordem em que a lista chega.
 *
 * Uma peça só (ou nenhuma) desfaz o álbum: devolve `null` para todas, que é o
 * que apaga a coluna. É a mesma conta usada ao criar, ao reordenar e ao
 * remover uma cor do grupo — um lugar só decide posição, principal e rótulo.
 */
export function planGroup(
  groupId: string,
  label: string,
  membros: ReadonlyArray<{ product: Product; meta?: Partial<VariantMeta> }>,
  primaryId?: string,
): Array<{ id: string; meta: VariantMeta | null }> {
  if (membros.length < 2) {
    return membros.map(({ product }) => ({ id: product.id, meta: null }));
  }
  const principal = membros.some((m) => m.product.id === primaryId)
    ? primaryId
    : membros[0].product.id;

  return membros.map(({ product, meta }, i) => {
    const atual = product.variant ?? undefined;
    const auto = detectarCores(product.name);
    const out: VariantMeta = {
      group: groupId,
      label,
      position: i,
      color: meta?.color ?? atual?.color ?? auto.color ?? COR_PADRAO,
    };
    const accent = meta?.accent ?? atual?.accent ?? auto.accent;
    if (accent) out.accent = accent;
    const colorLabel = meta?.colorLabel ?? atual?.colorLabel ?? auto.colorLabel;
    if (colorLabel) out.colorLabel = colorLabel;
    if (product.id === principal) out.primary = true;
    return { id: product.id, meta: out };
  });
}
