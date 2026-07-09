DROP FUNCTION IF EXISTS public.consume_order_stock(text);

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

  IF ord.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized for this order';
  END IF;

  IF ord.stock_decremented THEN
    RETURN;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(ord.items) LOOP
    pid   := NULLIF(item->>'id', '')::uuid;
    psize := item->>'size';
    pqty  := COALESCE((item->>'qty')::int, (item->>'quantity')::int, 0);

    IF pid IS NULL OR psize NOT IN ('P','M','G','GG') OR pqty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT sizes INTO cur FROM public.products WHERE id = pid FOR UPDATE;
    IF cur IS NULL THEN
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
GRANT EXECUTE ON FUNCTION app_private.consume_order_stock(text) TO authenticated;

-- Expose a thin public wrapper so PostgREST can route the RPC call while the
-- privileged body stays in app_private. Wrapper is SECURITY INVOKER.
CREATE OR REPLACE FUNCTION public.consume_order_stock(_order_number text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT app_private.consume_order_stock(_order_number);
$$;

REVOKE ALL ON FUNCTION public.consume_order_stock(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_order_stock(text) TO authenticated;