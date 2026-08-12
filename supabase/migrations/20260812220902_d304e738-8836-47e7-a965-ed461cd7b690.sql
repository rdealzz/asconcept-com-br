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

  -- A checagem de posse (auth.uid() = ord.user_id) saiu daqui: a rotina só é
  -- chamada pelo servidor (webhook do Mercado Pago e painel admin), que já
  -- decide quem pode agir. Quando a requisição carregava qualquer JWT de
  -- usuário, o guard recusava a baixa de pedidos pagos e o estoque ficava
  -- intacto (risco de vender a mesma peça duas vezes). O acesso agora é
  -- fechado por GRANT: só service_role executa.

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

REVOKE ALL ON FUNCTION app_private.consume_order_stock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.consume_order_stock(text) TO service_role;

REVOKE ALL ON FUNCTION public.consume_order_stock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_stock(text) TO service_role;