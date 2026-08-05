-- Faz a baixa de estoque voltar a funcionar depois do pagamento aprovado.
--
-- Sintoma: nenhum pedido pago dava baixa. O que aparentava ser "estoque caindo
-- sem pagar" era só um decremento visual no navegador (já removido); no banco
-- o número nunca mudava.
--
-- Causa: consume_order_stock é chamada pelo servidor com a chave de serviço,
-- em persistPayment (Mercado Pago, quando o status vira "approved") e em
-- confirmStripePayment. Nesse contexto:
--
--   1. auth.uid() é NULL, então a checagem
--        IF ord.user_id IS DISTINCT FROM auth.uid()
--      dava sempre verdadeiro e levantava 'Not authorized for this order';
--   2. o EXECUTE só tinha sido concedido a `authenticated` — o Supabase deixou
--      de dar acesso ao schema public para service_role por padrão, como a
--      própria migração 20260729143053_email_infra.sql registra.
--
-- Os dois chamadores envolvem a RPC em try/catch e só logam, então a falha
-- passava silenciosa e o pedido seguia com stock_decremented = false.
--
-- Correção: a checagem de dono passa a valer apenas quando existe um usuário
-- autenticado na sessão. Isso NÃO afrouxa o acesso do cliente: `anon` continua
-- sem EXECUTE, e todo chamador `authenticated` tem auth.uid() não-nulo, logo
-- continua obrigado a ser o dono do pedido. O único caminho novo é o do
-- servidor, que já é confiável.
--
-- A proteção contra baixa dupla continua sendo o próprio stock_decremented,
-- verificado dentro da função com o pedido travado por FOR UPDATE — importante
-- porque o Mercado Pago costuma notificar o mesmo pagamento mais de uma vez.

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

  -- Só cobra a posse quando há sessão de usuário. Com a chave de serviço
  -- (auth.uid() nulo) a chamada vem do nosso próprio servidor, depois de o
  -- provedor de pagamento confirmar a aprovação.
  IF auth.uid() IS NOT NULL AND ord.user_id IS DISTINCT FROM auth.uid() THEN
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

-- Mantém anon fora e devolve o acesso aos dois chamadores legítimos.
REVOKE ALL ON FUNCTION app_private.consume_order_stock(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.consume_order_stock(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.consume_order_stock(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_order_stock(text) TO authenticated, service_role;
