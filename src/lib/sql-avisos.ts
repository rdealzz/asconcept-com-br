/**
 * O SQL da migração de estoque e avisos, para o admin colar no Supabase.
 *
 * Cópia literal de `supabase/migrations/20260813120000_estoque_catalogo_avisos.sql`.
 * As duas têm de continuar iguais — `sql-avisos.test.ts` falha se divergirem,
 * e `scripts/gerar-sql-avisos.ts` regera este arquivo. Não edite à mão.
 *
 * Módulo separado porque são alguns kilobytes de texto: o painel o carrega sob
 * demanda (`await import`), só quando descobre que a tabela ainda não existe.
 */

export const SQL_AVISOS: string = `-- Estoque, catálogo e avisos do administrador.
--
-- A baixa de estoque já acontecia na aprovação do pagamento, mas ela era
-- silenciosa: \`consume_order_stock\` mexia no JSON dos tamanhos e ia embora.
-- Três coisas faltavam, e as três são o motivo desta migração:
--
--   1. **rastro.** Quando o admin desconfia do estoque de uma peça, não há a
--      quem perguntar — nada registra que o pedido AS-123456 tirou uma M da
--      camiseta preta. \`stock_ledger\` passa a guardar cada movimento, inclusive
--      os que a função decidiu ignorar (tamanho que não existe na peça, peça
--      apagada do catálogo depois da compra). São exatamente esses casos
--      silenciosos que faziam o estoque "não bater" sem explicação;
--
--   2. **aviso.** Quando a última M da camiseta preta sai, a variação some da
--      vitrine sozinha — e ninguém fica sabendo. \`admin_notifications\` grava o
--      aviso na hora, com nome, cor, tamanho, SKU, quantidade anterior,
--      horário e o pedido responsável;
--
--   3. **venda a descoberto à vista.** \`GREATEST(0, atual - qtd)\` grampeia em
--      zero: vender 3 de um estoque de 1 gravava 0 e seguia como se nada
--      tivesse acontecido. O grampo fica (o pagamento já foi aprovado; recusar
--      aqui não desfaz nada), mas agora vira aviso — que é o que o admin
--      precisa para separar a peça ou avisar o cliente.
--
-- Nada aqui muda quem pode fazer o quê: a baixa continua sendo do service role
-- (webhook do Mercado Pago e painel, sempre pelo servidor) e as duas tabelas
-- novas são leitura de admin.
--
-- O script inteiro roda de novo sem susto — é assim que ele acaba sendo usado,
-- colado no SQL Editor quando o deploy não aplica a migração.

-- ── 1. Avisos do administrador ───────────────────────────────────────────
--
-- Uma linha por acontecimento, não por estado: o aviso de "esgotou" continua
-- valendo como registro histórico mesmo depois de o admin repor o estoque.
-- \`read_at\` é a única coisa que ele muda daqui.
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'variacao_esgotada' | 'venda_sem_estoque' | 'baixa_ignorada'
  kind text NOT NULL,
  -- A peça pode ser apagada do catálogo depois; o aviso sobrevive à exclusão
  -- com os dados que já foram copiados para as colunas abaixo.
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL DEFAULT '',
  color_label text,
  size text,
  -- O SKU da loja é o id da variação — é ele que vai para o carrinho, para o
  -- pedido e para o JSON-LD da página (ver src/routes/produto.$id.tsx).
  sku text,
  previous_qty integer,
  requested_qty integer,
  order_number text,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_notifications IS
  'Avisos para o administrador: variação esgotada, venda sem estoque, baixa ignorada. Escrita só pelas rotinas de estoque; leitura só de admin.';

CREATE INDEX IF NOT EXISTS admin_notifications_recentes_idx
  ON public.admin_notifications (created_at DESC);

-- O sino do painel conta os não lidos a cada abertura; o índice parcial cobre
-- exatamente essa contagem e ignora o histórico, que é a maior parte.
CREATE INDEX IF NOT EXISTS admin_notifications_nao_lidos_idx
  ON public.admin_notifications (created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_notifications FROM PUBLIC, anon;
-- Sem INSERT para \`authenticated\`, de propósito: quem escreve aviso é a rotina
-- de baixa (SECURITY DEFINER, roda como dona da tabela) e o service role. Um
-- cliente logado não inventa aviso nem pelo console.
GRANT SELECT, UPDATE, DELETE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

DROP POLICY IF EXISTS "Admins read notifications" ON public.admin_notifications;
CREATE POLICY "Admins read notifications" ON public.admin_notifications
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins update notifications" ON public.admin_notifications;
CREATE POLICY "Admins update notifications" ON public.admin_notifications
  FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete notifications" ON public.admin_notifications;
CREATE POLICY "Admins delete notifications" ON public.admin_notifications
  FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

-- ── 2. Livro de movimentos do estoque ────────────────────────────────────
--
-- Sem FK para \`products\`: o valor deste registro é justamente sobreviver à
-- exclusão da peça — "o estoque da camiseta que você apagou saiu por causa do
-- pedido AS-123456" é a pergunta que ele existe para responder.
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text,
  product_id uuid,
  product_name text,
  size text,
  qty_requested integer NOT NULL DEFAULT 0,
  qty_before integer,
  qty_after integer,
  -- 'baixa' | 'baixa_sem_estoque' | 'tamanho_inexistente'
  -- | 'produto_inexistente' | 'item_invalido'
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stock_ledger IS
  'Auditoria da baixa de estoque: um registro por item de pedido, inclusive os ignorados. Só leitura, só admin.';

CREATE INDEX IF NOT EXISTS stock_ledger_recentes_idx
  ON public.stock_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS stock_ledger_pedido_idx
  ON public.stock_ledger (order_number);
CREATE INDEX IF NOT EXISTS stock_ledger_produto_idx
  ON public.stock_ledger (product_id, created_at DESC);

ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stock_ledger FROM PUBLIC, anon;
-- Livro de auditoria não se edita: só SELECT, e só de admin.
GRANT SELECT ON public.stock_ledger TO authenticated;
GRANT ALL ON public.stock_ledger TO service_role;

DROP POLICY IF EXISTS "Admins read stock ledger" ON public.stock_ledger;
CREATE POLICY "Admins read stock ledger" ON public.stock_ledger
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

-- ── 3. Quanto uma peça ainda tem, somando a grade inteira ────────────────
--
-- A coluna \`sizes\` é JSONB e aceita qualquer chave — e, em cadastro antigo,
-- qualquer valor. O \`CASE\` sobre \`jsonb_typeof\` é o que impede um \`"3"\` gravado
-- como texto (ou um \`null\`) de derrubar a soma com erro de conversão: o que não
-- for número conta zero, que é o lado seguro.
CREATE OR REPLACE FUNCTION app_private.total_em_estoque(_sizes jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN jsonb_typeof(value) = 'number' THEN GREATEST(0, floor(value::text::numeric)::int)
        ELSE 0
      END
    ),
    0
  )::int
  FROM jsonb_each(COALESCE(_sizes, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION app_private.total_em_estoque(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.total_em_estoque(jsonb) TO authenticated, service_role;

-- ── 4. A baixa, agora contando o que fez ─────────────────────────────────
--
-- O miolo é o mesmo de 20260812220902 — trava o pedido, \`stock_decremented\`
-- segura a baixa dupla das notificações repetidas do Mercado Pago, e o tamanho
-- válido é o que a própria peça tem gravado. O que muda é o entorno: cada item
-- deixa registro, e três situações viram aviso na hora.
CREATE OR REPLACE FUNCTION app_private.consume_order_stock(_order_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ord public.orders%ROWTYPE;
  prod public.products%ROWTYPE;
  item jsonb;
  pid uuid;
  psize text;
  pqty int;
  cur jsonb;
  antes int;
  depois int;
  variante jsonb;
  cor text;
  detalhe text;
  album text;
  restam_na_peca int;
  cores_com_estoque int;
BEGIN
  IF _order_number IS NULL OR length(_order_number) = 0 THEN
    RAISE EXCEPTION 'Order number required';
  END IF;

  SELECT * INTO ord FROM public.orders WHERE order_number = _order_number FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- A checagem de posse (auth.uid() = ord.user_id) não mora aqui: a rotina só é
  -- chamada pelo servidor (webhook do Mercado Pago e painel admin), que já
  -- decide quem pode agir. O acesso é fechado por GRANT — só service_role
  -- executa.
  IF ord.stock_decremented THEN
    RETURN;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(ord.items) LOOP
    pid   := NULLIF(item->>'id', '')::uuid;
    psize := NULLIF(item->>'size', '');
    pqty  := COALESCE((item->>'qty')::int, (item->>'quantity')::int, 0);

    -- Item que não diz peça, tamanho ou quantidade: nada a baixar. Antes ele
    -- sumia sem deixar rastro; agora fica no livro, que é onde o admin vai
    -- procurar quando a conta não fechar.
    IF pid IS NULL OR psize IS NULL OR pqty <= 0 THEN
      INSERT INTO public.stock_ledger
        (order_number, product_id, product_name, size, qty_requested, reason)
      VALUES
        (_order_number, pid, COALESCE(item->>'name', ''), psize, GREATEST(0, pqty), 'item_invalido');
      CONTINUE;
    END IF;

    SELECT * INTO prod FROM public.products WHERE id = pid FOR UPDATE;

    -- Peça apagada do catálogo depois da compra. O pedido é real e vai ser
    -- despachado; o estoque é que não existe mais para baixar.
    IF NOT FOUND THEN
      INSERT INTO public.stock_ledger
        (order_number, product_id, product_name, size, qty_requested, reason)
      VALUES
        (_order_number, pid, COALESCE(item->>'name', ''), psize, pqty, 'produto_inexistente');

      INSERT INTO public.admin_notifications
        (kind, product_id, product_name, size, sku, requested_qty, order_number, message, payload)
      VALUES (
        'baixa_ignorada', NULL, COALESCE(item->>'name', 'Peça sem cadastro'), psize, pid::text,
        pqty, _order_number,
        format(
          'O Pedido %s levou %s unidade(s) de "%s" (Tam: %s, SKU %s), mas a peça não está mais no catálogo. Nenhum estoque foi baixado — confira à mão.',
          _order_number, pqty, COALESCE(item->>'name', 'sem nome'), psize, pid
        ),
        jsonb_build_object('motivo', 'produto_inexistente')
      );
      CONTINUE;
    END IF;

    cur := COALESCE(prod.sizes, '{}'::jsonb);

    -- A cor vem do álbum, e o álbum mora em \`products.variant\` — coluna que só
    -- existe depois da migração das variações (20260812130000). Ler
    -- \`prod.variant\` direto estouraria "record has no field" num banco que
    -- ainda não a tem, e derrubaria a baixa de estoque inteira por causa de um
    -- rótulo. Passando pela linha inteira em jsonb, a chave ausente é só NULL.
    variante := to_jsonb(prod) -> 'variant';
    cor := NULLIF(variante->>'colorLabel', '');
    album := NULLIF(variante->>'group', '');

    -- Quem define os tamanhos válidos é a peça. Criar a chave aqui inventaria
    -- uma grade que a loja não mostra — então o item é ignorado, como antes,
    -- mas agora com aviso: um pedido pago num tamanho que a peça não tem é
    -- cadastro errado em algum lugar, e o admin precisa saber.
    IF NOT (cur ? psize) THEN
      INSERT INTO public.stock_ledger
        (order_number, product_id, product_name, size, qty_requested, reason)
      VALUES
        (_order_number, pid, prod.name, psize, pqty, 'tamanho_inexistente');

      INSERT INTO public.admin_notifications
        (kind, product_id, product_name, color_label, size, sku, requested_qty, order_number,
         message, payload)
      VALUES (
        'baixa_ignorada', prod.id, prod.name, cor, psize, prod.id::text, pqty, _order_number,
        format(
          'O Pedido %s levou %s unidade(s) de "%s" no tamanho %s, que não existe na grade cadastrada da peça. Nenhum estoque foi baixado — corrija a grade e confira o pedido.',
          _order_number, pqty, prod.name, psize
        ),
        jsonb_build_object('motivo', 'tamanho_inexistente', 'grade', cur)
      );
      CONTINUE;
    END IF;

    antes  := COALESCE((cur->>psize)::int, 0);
    depois := GREATEST(0, antes - pqty);

    UPDATE public.products
       SET sizes = jsonb_set(cur, ARRAY[psize], to_jsonb(depois)),
           updated_at = now()
     WHERE id = pid;

    INSERT INTO public.stock_ledger
      (order_number, product_id, product_name, size, qty_requested, qty_before, qty_after, reason)
    VALUES
      (_order_number, pid, prod.name, psize, pqty, antes, depois,
       CASE WHEN antes < pqty THEN 'baixa_sem_estoque' ELSE 'baixa' END);

    -- Como se lê o par cor/tamanho nas mensagens abaixo. Peça fora de álbum
    -- não tem cor gravada — aí só o tamanho aparece.
    detalhe := concat_ws(', ',
      CASE WHEN cor IS NOT NULL THEN 'Cor: ' || cor END,
      'Tam: ' || psize
    );

    -- Venda a descoberto: o grampo em zero manteve o catálogo coerente, mas
    -- alguém pagou por peça que não havia.
    IF antes < pqty THEN
      INSERT INTO public.admin_notifications
        (kind, product_id, product_name, color_label, size, sku, previous_qty, requested_qty,
         order_number, message, payload)
      VALUES (
        'venda_sem_estoque', prod.id, prod.name, cor, psize, prod.id::text, antes, pqty,
        _order_number,
        format(
          'Produto "%s" (%s) foi vendido em quantidade maior do que havia: o Pedido %s pediu %s e o estoque tinha %s. O estoque foi zerado e a variação saiu do catálogo — resolva o pedido com o cliente.',
          prod.name, detalhe, _order_number, pqty, antes
        ),
        jsonb_build_object('faltaram', pqty - antes)
      );
    END IF;

    -- Esgotou agora. \`antes > 0\` evita repetir o aviso a cada novo pedido de
    -- uma variação que já estava em zero.
    IF depois = 0 AND antes > 0 THEN
      SELECT app_private.total_em_estoque(sizes) INTO restam_na_peca
        FROM public.products WHERE id = pid;

      cores_com_estoque := 0;
      IF album IS NOT NULL THEN
        SELECT count(*) INTO cores_com_estoque
          FROM public.products p
         WHERE p.id <> pid
           AND p.variant->>'group' = album
           AND app_private.total_em_estoque(p.sizes) > 0;
      END IF;

      INSERT INTO public.admin_notifications
        (kind, product_id, product_name, color_label, size, sku, previous_qty, requested_qty,
         order_number, message, payload)
      VALUES (
        'variacao_esgotada', prod.id, prod.name, cor, psize, prod.id::text, antes, pqty,
        _order_number,
        format(
          'Produto "%s" (%s) esgotou após a aprovação do Pedido %s. A variação foi removida automaticamente do catálogo por falta de estoque.%s',
          prod.name, detalhe, _order_number,
          CASE
            WHEN restam_na_peca > 0 THEN
              format(' Os demais tamanhos desta cor seguem à venda (%s em estoque).', restam_na_peca)
            WHEN album IS NOT NULL AND cores_com_estoque > 0 THEN
              format(' A peça saiu da vitrine, mas o álbum continua: %s cor(es) ainda com estoque.', cores_com_estoque)
            WHEN album IS NOT NULL THEN
              ' Era a última cor com estoque do álbum — o álbum inteiro saiu da vitrine.'
            ELSE
              ' A peça saiu da vitrine.'
          END
        ),
        jsonb_build_object(
          'restam_na_peca', restam_na_peca,
          'album', album,
          'cores_com_estoque', cores_com_estoque,
          'esgotou_em', now()
        )
      );
    END IF;
  END LOOP;

  UPDATE public.orders SET stock_decremented = true WHERE order_number = _order_number;
END;
$$;

REVOKE ALL ON FUNCTION app_private.consume_order_stock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.consume_order_stock(text) TO service_role;

-- Casca fina para o PostgREST rotear o RPC enquanto o corpo privilegiado fica
-- em app_private. Continua SECURITY INVOKER: quem chama é o service role, que
-- tem EXECUTE na função de dentro.
CREATE OR REPLACE FUNCTION public.consume_order_stock(_order_number text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT app_private.consume_order_stock(_order_number);
$$;

REVOKE ALL ON FUNCTION public.consume_order_stock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_stock(text) TO service_role;

-- ── 5. Rede de segurança: pedido pago que não baixou ─────────────────────
--
-- A baixa acontece dentro do tratamento da notificação do Mercado Pago. Se
-- aquela chamada falhar (banco fora do ar por um instante, deploy no meio do
-- caminho), o pedido fica pago com \`stock_decremented = false\` e a peça
-- continua à venda — que é exatamente o buraco que já apareceu na loja antes.
--
-- Isto varre esses pedidos e completa a baixa. É idempotente pelo próprio
-- \`stock_decremented\`, e o painel a dispara ao abrir a aba de avisos.
CREATE OR REPLACE FUNCTION app_private.reconcile_order_stock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT order_number
      FROM public.orders
     WHERE stock_decremented IS NOT TRUE
       AND (
         mp_status = 'approved'
         OR status IN ('Preparando pedido', 'Em trânsito', 'Entregue')
       )
     ORDER BY created_at
     LIMIT 200
  LOOP
    PERFORM app_private.consume_order_stock(r.order_number);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION app_private.reconcile_order_stock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.reconcile_order_stock() TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_order_stock()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT app_private.reconcile_order_stock();
$$;

REVOKE ALL ON FUNCTION public.reconcile_order_stock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_order_stock() TO service_role;
`;
