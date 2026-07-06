
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
  IF _size NOT IN ('P','M','G','GG') THEN
    RAISE EXCEPTION 'Invalid size';
  END IF;
  IF _qty <= 0 THEN
    RETURN;
  END IF;

  SELECT sizes INTO cur FROM public.products WHERE id = _product_id FOR UPDATE;
  IF cur IS NULL THEN
    RETURN;
  END IF;

  current_val := COALESCE((cur->>_size)::INT, 0);
  cur := jsonb_set(cur, ARRAY[_size], to_jsonb(GREATEST(0, current_val - _qty)));

  UPDATE public.products SET sizes = cur WHERE id = _product_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decrement_product_stock(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_product_stock(uuid, text, int) TO authenticated;
