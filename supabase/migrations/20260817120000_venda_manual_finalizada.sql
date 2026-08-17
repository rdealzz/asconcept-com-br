-- Venda de balcão: baixa de estoque que recusa vender o que não existe.
--
-- O cadastro manual do painel registra uma venda que JÁ aconteceu — feira,
-- WhatsApp, boca a boca. A peça saiu da prateleira antes de alguém abrir o
-- formulário, então o pedido nasce "Finalizado" e o estoque cai junto com a
-- gravação, sem passar pelas etapas do ateliê.
--
-- `consume_order_stock` não serve sozinha para isso. Ela é a baixa do checkout,
-- e lá o pedido já está pago: quando o estoque não cobre o pedido ela grampeia
-- em zero, grava o aviso de venda a descoberto e segue — desfazer a compra do
-- cliente seria pior. No balcão a ordem é a oposta: nada foi gravado ainda, e a
-- resposta certa para "não tem essa peça" é recusar o cadastro e dizer o
-- motivo, antes de existir pedido nenhum.
--
-- Daí esta casca. Ela confere item a item com as peças travadas (FOR UPDATE) e,
-- passando a conferência, chama a baixa de sempre dentro da MESMA transação —
-- as travas seguram até o fim, então entre "tem estoque" e "baixou" não cabe
-- outra venda. Se algum item não couber, a exceção derruba a transação inteira:
-- nada baixa, nada fica pela metade, e quem chamou recebe a frase pronta para a
-- tela do admin.
--
-- O que NÃO muda: pedidos manuais antigos ficam onde estão, com o status que
-- têm. Isto vale para o que for cadastrado daqui em diante.

CREATE OR REPLACE FUNCTION app_private.consume_order_stock_strict(_order_number text)
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
  disponivel int;
  -- Duas linhas da mesma peça+tamanho no mesmo pedido somam antes de comparar:
  -- conferidas isoladas, duas de 1 unidade passariam contra um estoque de 1.
  pedido_por_variacao jsonb := '{}'::jsonb;
  chave text;
BEGIN
  IF _order_number IS NULL OR length(_order_number) = 0 THEN
    RAISE EXCEPTION 'Order number required';
  END IF;

  SELECT * INTO ord FROM public.orders WHERE order_number = _order_number FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Já baixou (chamada repetida): não é erro, e conferir de novo compararia o
  -- pedido com um estoque de onde ele já saiu.
  IF ord.stock_decremented THEN
    RETURN;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(ord.items) LOOP
    pid   := NULLIF(item->>'id', '')::uuid;
    psize := NULLIF(item->>'size', '');
    pqty  := COALESCE((item->>'qty')::int, (item->>'quantity')::int, 0);

    IF pid IS NULL OR psize IS NULL OR pqty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO prod FROM public.products WHERE id = pid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estoque insuficiente: a peça "%" não está mais no catálogo.',
        COALESCE(NULLIF(item->>'name', ''), pid::text);
    END IF;

    cur := COALESCE(prod.sizes, '{}'::jsonb);

    -- Peça sem grade cadastrada passa: não há o que conferir nem o que baixar,
    -- e barrar aqui impediria a venda de um cadastro antigo que ainda funciona.
    -- É a mesma regra da conferência do checkout e da baixa de sempre.
    IF cur = '{}'::jsonb THEN
      CONTINUE;
    END IF;

    IF NOT (cur ? psize) THEN
      RAISE EXCEPTION 'Estoque insuficiente: "%" não tem o tamanho % na grade cadastrada.',
        prod.name, psize;
    END IF;

    chave := pid::text || '|' || psize;
    pqty := pqty + COALESCE((pedido_por_variacao->>chave)::int, 0);
    pedido_por_variacao := jsonb_set(pedido_por_variacao, ARRAY[chave], to_jsonb(pqty));

    disponivel := GREATEST(0, COALESCE((cur->>psize)::int, 0));
    IF disponivel < pqty THEN
      RAISE EXCEPTION
        'Estoque insuficiente: "%" tem % unidade(s) no tamanho %, e o pedido leva %.',
        prod.name, disponivel, psize, pqty;
    END IF;
  END LOOP;

  -- Conferido e travado. A baixa em si continua sendo uma só — com livro de
  -- movimentos e avisos — para que a venda de balcão e a do site deixem
  -- exatamente o mesmo rastro.
  PERFORM app_private.consume_order_stock(_order_number);

  -- Marca no livro o que o pedido é: venda registrada à mão, que já nasceu
  -- fechada. Sem isto, a auditoria mostraria a baixa sem dizer de onde veio.
  INSERT INTO public.stock_ledger (order_number, qty_requested, reason)
  VALUES (_order_number, 0, 'venda_manual');
END;
$$;

COMMENT ON FUNCTION app_private.consume_order_stock_strict(text) IS
  'Baixa de estoque do cadastro manual: recusa o pedido inteiro (exceção) quando falta peça, em vez de grampear em zero.';

REVOKE ALL ON FUNCTION app_private.consume_order_stock_strict(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.consume_order_stock_strict(text) TO service_role;

-- Casca fina para o PostgREST rotear o RPC, como as demais.
CREATE OR REPLACE FUNCTION public.consume_order_stock_strict(_order_number text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT app_private.consume_order_stock_strict(_order_number);
$$;

REVOKE ALL ON FUNCTION public.consume_order_stock_strict(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_stock_strict(text) TO service_role;

-- ── Rede de segurança também para a venda de balcão ──────────────────────
--
-- `reconcile_order_stock` varre pedidos que deveriam ter baixado e não
-- baixaram. A lista de status era só a do ateliê; um pedido "Finalizado" que
-- ficasse com `stock_decremented = false` (queda de rede entre a gravação e a
-- baixa) passaria despercebido para sempre. O painel dispara esta rotina ao
-- abrir a aba de avisos.
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
         OR status IN ('Preparando pedido', 'Em trânsito', 'Entregue', 'Finalizado')
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
