import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, PackageX, RefreshCw } from "lucide-react";
import {
  corDoAviso,
  fetchAdminNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AdminNotification,
  type AdminNotificationKind,
} from "@/lib/admin-notifications";

/**
 * A aba de avisos do painel.
 *
 * O que ela resolve: a variação esgota, sai do catálogo sozinha, e ninguém
 * fica sabendo. Cada linha aqui é um acontecimento gravado pelo banco na hora
 * da baixa (ver a migração 20260813120000) — com peça, cor, tamanho, SKU,
 * quantidade anterior, horário e o pedido responsável.
 *
 * Ao abrir, a aba também manda o servidor completar a baixa de pedidos pagos
 * que ficaram para trás (`onReconcile`): se a chamada do webhook falhou, a peça
 * continuaria à venda em silêncio, e o lugar certo de descobrir isso é este.
 */

const ROTULOS: Record<AdminNotificationKind, { texto: string; tom: string }> = {
  variacao_esgotada: {
    texto: "Esgotou",
    tom: "border-accent/40 bg-accent/10 text-accent",
  },
  venda_sem_estoque: {
    texto: "Vendido sem estoque",
    tom: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  baixa_ignorada: {
    texto: "Baixa não aplicada",
    tom: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

function IconeDoAviso({ kind }: { kind: AdminNotificationKind }) {
  if (kind === "variacao_esgotada") {
    return <PackageX className="h-4 w-4 text-accent" strokeWidth={1.5} />;
  }
  return <AlertTriangle className="h-4 w-4 text-destructive" strokeWidth={1.5} />;
}

/** "13/08/2026 às 14h07" — como o admin lê hora em todo o resto do painel. */
function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function AdminNotifications({
  onReconcile,
  onUnreadChange,
}: {
  /**
   * Completa a baixa de pedidos pagos que ficaram para trás. Devolve quantos
   * pedidos foram tratados, ou `null` quando a rotina ainda não existe no banco.
   */
  onReconcile: () => Promise<number | null>;
  /** Mantém o número na aba do painel de acordo com o que já foi lido aqui. */
  onUnreadChange?: (n: number) => void;
}) {
  const [avisos, setAvisos] = useState<AdminNotification[]>([]);
  const [semTabela, setSemTabela] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sql, setSql] = useState<string | null>(null);
  const [sqlCopiado, setSqlCopiado] = useState(false);
  const [reconciliados, setReconciliados] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetchAdminNotifications();
    setAvisos(r.avisos);
    setSemTabela(r.semTabela);
    setErro(r.erro);
    setCarregando(false);
  }, []);

  // Primeiro a varredura, depois a lista: um pedido que baixe agora já entra
  // na lista desta mesma abertura, em vez de aparecer só na próxima.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const n = await onReconcile();
      if (!vivo) return;
      setReconciliados(n);
      await carregar();
    })();
    return () => {
      vivo = false;
    };
  }, [carregar, onReconcile]);

  // O SQL é grande e só interessa a quem ainda não rodou a migração.
  useEffect(() => {
    if (!semTabela || sql) return;
    void import("@/lib/sql-avisos").then((m) => setSql(m.SQL_AVISOS));
  }, [semTabela, sql]);

  const copiarSql = async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setSqlCopiado(true);
      window.setTimeout(() => setSqlCopiado(false), 2500);
    } catch {
      /* área de transferência indisponível — o SQL está à vista mesmo assim */
    }
  };

  const marcarUm = async (id: string) => {
    const agora = new Date().toISOString();
    setAvisos((prev) => prev.map((a) => (a.id === id ? { ...a, readAt: agora } : a)));
    if (!(await markNotificationRead(id))) await carregar();
  };

  const marcarTodos = async () => {
    const agora = new Date().toISOString();
    setAvisos((prev) => prev.map((a) => (a.readAt ? a : { ...a, readAt: agora })));
    if (!(await markAllNotificationsRead())) await carregar();
  };

  const naoLidos = avisos.filter((a) => !a.readAt).length;

  useEffect(() => {
    if (!carregando && !semTabela) onUnreadChange?.(naoLidos);
  }, [naoLidos, carregando, semTabela, onUnreadChange]);

  if (semTabela) {
    return (
      <div className="border border-accent/40 bg-accent/5 px-5 py-4">
        <p className="text-[11px] tracking-luxe uppercase text-accent">Migração pendente</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Os avisos de estoque ainda não existem no banco. Rode o SQL abaixo no Supabase (SQL
          Editor) — ele cria a tabela de avisos, o livro de movimentos do estoque e reescreve a
          baixa para registrar cada uma. Pode rodar mais de uma vez sem problema.
        </p>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words border border-border bg-muted/40 p-3 text-[10px] leading-relaxed text-muted-foreground">
          {sql ?? "Carregando o SQL…"}
        </pre>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void copiarSql()}
            disabled={!sql}
            className="asc-btn-primary px-3 py-1.5 text-[10px] tracking-luxe uppercase disabled:opacity-40"
          >
            {sqlCopiado ? "SQL copiado" : "Copiar SQL"}
          </button>
          <button
            onClick={() => void carregar()}
            className="border border-border px-3 py-1.5 text-[10px] tracking-luxe uppercase text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            Já rodei · verificar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">
          {naoLidos > 0 ? `${naoLidos} aviso(s) não lido(s)` : "Nenhum aviso pendente"} ·{" "}
          {avisos.length} no histórico
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void carregar()}
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[10px] tracking-luxe uppercase text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            <RefreshCw className="h-3 w-3" strokeWidth={1.5} /> Atualizar
          </button>
          {naoLidos > 0 && (
            <button
              onClick={() => void marcarTodos()}
              className="inline-flex items-center gap-1.5 asc-btn-primary px-3 py-1.5 text-[10px] tracking-luxe uppercase"
            >
              <Check className="h-3 w-3" strokeWidth={2} /> Marcar tudo como lido
            </button>
          )}
        </div>
      </div>

      <p className="mb-5 text-[11px] leading-relaxed text-muted-foreground">
        Cada linha é gravada pelo banco no momento da baixa de estoque, quando o pagamento é
        aprovado. Variação esgotada sai do catálogo sozinha — só aquela cor e aquele tamanho; as
        outras cores do álbum continuam à venda.
      </p>

      {reconciliados !== null && reconciliados > 0 && (
        <p className="mb-4 border border-accent/40 bg-accent/5 px-4 py-3 text-xs text-accent">
          {reconciliados} pedido(s) pago(s) estavam sem baixa de estoque e foram acertados agora.
        </p>
      )}

      {erro && (
        <p className="mb-4 border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {erro}
        </p>
      )}

      {carregando && avisos.length === 0 ? (
        <p className="border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          Carregando avisos…
        </p>
      ) : avisos.length === 0 ? (
        <p className="border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          Nenhum aviso até agora. Quando uma variação esgotar, ela aparece aqui.
        </p>
      ) : (
        <ul className="space-y-2">
          {avisos.map((a) => {
            const rotulo = ROTULOS[a.kind];
            const cor = corDoAviso(a);
            return (
              <li
                key={a.id}
                className={`border px-4 py-3 transition-colors ${
                  a.readAt ? "border-border/60 bg-transparent" : "border-accent/40 bg-accent/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex-none">
                    <IconeDoAviso kind={a.kind} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`border px-2 py-0.5 text-[9px] tracking-luxe uppercase ${rotulo.tom}`}
                      >
                        {rotulo.texto}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {quando(a.createdAt)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm leading-relaxed">{a.message}</p>

                    {/* A ficha da variação, para o admin agir sem abrir o pedido:
                        é o que ele copia para procurar a peça na arara. */}
                    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      <Ficha rotulo="Produto" valor={a.productName || "—"} />
                      {cor && <Ficha rotulo="Cor" valor={cor} />}
                      {a.size && <Ficha rotulo="Tamanho" valor={a.size} />}
                      {a.sku && <Ficha rotulo="SKU" valor={a.sku} />}
                      {a.previousQty !== null && (
                        <Ficha rotulo="Qtd. anterior" valor={String(a.previousQty)} />
                      )}
                      {a.requestedQty !== null && (
                        <Ficha rotulo="Qtd. do pedido" valor={String(a.requestedQty)} />
                      )}
                      {a.orderNumber && <Ficha rotulo="Pedido" valor={a.orderNumber} />}
                    </dl>
                  </div>

                  {!a.readAt && (
                    <button
                      onClick={() => void marcarUm(a.id)}
                      title="Marcar como lido"
                      aria-label="Marcar como lido"
                      className="flex-none border border-border p-1.5 text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                    >
                      <Check className="h-3 w-3" strokeWidth={2} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Ficha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <dt className="tracking-luxe uppercase">{rotulo}:</dt>
      <dd className="text-foreground">{valor}</dd>
    </span>
  );
}
