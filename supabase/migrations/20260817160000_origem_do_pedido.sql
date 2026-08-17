-- De onde veio a venda: da loja ou do balcão.
--
-- Os dois fluxos não se parecem. O pedido do site percorre preparação, envio e
-- entrega, e cada etapa dispara e-mail; o de balcão costuma nascer pronto,
-- porque a peça já foi entregue quando alguém abriu o formulário. Enquanto os
-- dois moravam na mesma lista sem rótulo, o painel tratava tudo como uma fila
-- só — e a única pista do tipo era o `payment_method`, que diz outra coisa.
--
-- A coluna é `text` e não enum: enum novo é migração travada por dependência
-- toda vez que aparece um caso a mais. O CHECK segura os dois valores válidos e
-- aceita NULL, que é como fica todo pedido gravado por uma versão do app mais
-- antiga que esta migração — o código deduz a origem nesse caso.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS origin text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_origin_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_origin_check CHECK (origin IS NULL OR origin IN ('online', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN public.orders.origin IS
  'online = checkout da loja; manual = venda registrada no painel (balcão, WhatsApp). NULL em pedido anterior à coluna — o app deduz.';

-- Preenche o que já está gravado, com as mesmas duas marcas que o app usa para
-- deduzir. Nenhuma delas aparece num cadastro manual:
--
--   1. passou pelo Mercado Pago (payment_method mp_*, ou id/status gravado);
--   2. tem endereço de entrega — o formulário do painel nunca pediu um.
--
-- Só mexe em linha com origin NULL, e só na coluna nova: status, estoque e
-- valores dos pedidos antigos ficam exatamente onde estão.
UPDATE public.orders
   SET origin = CASE
     WHEN payment_method LIKE 'mp\_%' THEN 'online'
     WHEN mp_payment_id IS NOT NULL OR mp_status IS NOT NULL THEN 'online'
     WHEN COALESCE(btrim(address->>'cep'), '') <> '' THEN 'online'
     ELSE 'manual'
   END
 WHERE origin IS NULL;

-- O painel filtra por origem em cima de uma lista já carregada, então o índice
-- não é para a tela: é para o dia em que o relatório perguntar "quanto vendi
-- fora da loja no mês", que é uma varredura por origem e data.
CREATE INDEX IF NOT EXISTS orders_origin_criado_idx
  ON public.orders (origin, created_at DESC);
