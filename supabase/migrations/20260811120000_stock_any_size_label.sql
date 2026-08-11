-- Baixa de estoque para grades que não são P/M/G/GG.
--
-- Cada espécie de peça tem a sua grade: roupa vai de P a GG, calça vai em
-- número (36–46), sneaker em número de pé (36–44) e acessório é tamanho único.
-- A coluna products.sizes é JSONB e sempre aceitou qualquer chave, mas a
-- consume_order_stock filtrava com `psize NOT IN ('P','M','G','GG')`: um pedido
-- de calça 42 passava batido no laço e o pedido era marcado como baixado sem
-- que o estoque de nada tivesse caído — silenciosamente, porque os chamadores
-- só logam o erro.
--
-- Agora o que vale é o próprio produto: só cai o tamanho que existe no JSON da
-- peça. Rótulo desconhecido continua sendo ignorado, como antes, mas por não
-- estar na peça — e não por não estar numa lista fixa dentro do banco.
--
-- O resto da função é o de 20260805230000: posse cobrada só quando há sessão
-- de usuário, e stock_decremented segurando a baixa dupla das notificações
-- repetidas do provedor de pagamento.

CREATE OR REPLACE FUNCTION app_private.consume_order_stock(_order_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ord public.orders%ROWTYPE;
  item jsonb;
  pid uuid;
  psize text;
  pqty int;
  cur jsonb;
  current_val int;
BEGIN
  IF _order_number IS NULL OR length(_order_number) = 0 THEN
    RAISE EXCEPTION 'Order number required';
  END IF;

  SELECT * INTO ord FROM public.orders WHERE order_number = _order_number FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF auth.uid() IS NOT NULL AND ord.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized for this order';
  END IF;

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

    SELECT sizes INTO cur FROM public.products WHERE id = pid FOR UPDATE;
    IF cur IS NULL THEN
      CONTINUE;
    END IF;

    -- Quem define os tamanhos válidos é a peça. Sem a chave, não há o que
    -- baixar — criá-la aqui inventaria uma grade que a loja não mostra.
    IF NOT (cur ? psize) THEN
      CONTINUE;
    END IF;

    current_val := COALESCE((cur->>psize)::int, 0);
    cur := jsonb_set(cur, ARRAY[psize], to_jsonb(GREATEST(0, current_val - pqty)));
    UPDATE public.products SET sizes = cur WHERE id = pid;
  END LOOP;

  UPDATE public.orders SET stock_decremented = true WHERE order_number = _order_number;
END;
$$;

REVOKE ALL ON FUNCTION app_private.consume_order_stock(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.consume_order_stock(text) TO authenticated, service_role;

-- Mesma correção na baixa avulsa. Hoje nenhuma tela a chama, mas ela existe com
-- EXECUTE concedido: deixá-la recusando "42" seria plantar o mesmo bug para
-- quem a usasse amanhã.
CREATE OR REPLACE FUNCTION public.decrement_product_stock(_product_id UUID, _size TEXT, _qty INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur JSONB;
  current_val INT;
BEGIN
  IF _size IS NULL OR length(_size) = 0 THEN
    RAISE EXCEPTION 'Invalid size';
  END IF;
  IF _qty <= 0 THEN
    RETURN;
  END IF;

  SELECT sizes INTO cur FROM public.products WHERE id = _product_id FOR UPDATE;
  IF cur IS NULL OR NOT (cur ? _size) THEN
    RETURN;
  END IF;

  current_val := COALESCE((cur->>_size)::INT, 0);
  cur := jsonb_set(cur, ARRAY[_size], to_jsonb(GREATEST(0, current_val - _qty)));

  UPDATE public.products SET sizes = cur WHERE id = _product_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decrement_product_stock(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_product_stock(uuid, text, int) TO authenticated;
