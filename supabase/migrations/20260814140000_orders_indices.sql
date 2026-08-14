-- Índices de `orders`.
--
-- A tabela tinha exatamente dois: a chave primária e o UNIQUE de
-- `order_number`. Todo o resto do sistema lê pedido por outro caminho, e cada
-- uma dessas leituras varre a tabela inteira:
--
--   * a própria RLS. "Users view own orders" filtra por `auth.uid() = user_id`,
--     então TODA consulta de cliente logado — inclusive a que o site faz ao
--     abrir qualquer página — passa por um filtro sem índice;
--   * o painel, que lista tudo ordenado por `created_at DESC`;
--   * a busca por status, quando o admin quer ver só o que falta despachar;
--   * a busca pelo e-mail do cliente, que é como se acha o pedido de quem
--     escreveu no WhatsApp.
--
-- Com duzentos pedidos ninguém percebe: o Postgres lê a tabela inteira em
-- milissegundos e a conta fecha. O problema aparece exatamente quando a loja
-- der certo — e aí o sintoma é um painel lento, sem causa aparente, no dia de
-- maior movimento do ano.
--
-- Nada aqui muda comportamento: índice não altera resultado de consulta, só o
-- caminho até ele. E o script roda de novo sem susto, que é como ele acaba
-- sendo usado — colado no SQL Editor quando o deploy não aplica a migração.

-- Os pedidos de um cliente, do mais novo para o mais velho.
--
-- Cobre as duas coisas ao mesmo tempo: o filtro da RLS (`user_id`) e a
-- ordenação que a tela de "meus pedidos" usa. Índice composto, e não dois
-- separados, porque é assim que a consulta pergunta.
CREATE INDEX IF NOT EXISTS orders_user_recentes_idx
  ON public.orders (user_id, created_at DESC);

-- A listagem do painel: tudo, do mais recente para o mais antigo.
CREATE INDEX IF NOT EXISTS orders_recentes_idx
  ON public.orders (created_at DESC);

-- "O que ainda não despachei." O status é texto curto e de baixa variedade —
-- meia dúzia de valores para a tabela inteira —, então o índice só compensa
-- junto da data, que é o que desempata dentro de cada status.
CREATE INDEX IF NOT EXISTS orders_status_recentes_idx
  ON public.orders (status, created_at DESC);

-- Achar o pedido pelo e-mail de quem comprou.
--
-- Em `lower(...)` de propósito: o e-mail é gravado normalizado pelo servidor,
-- mas cadastro manual e pedido antigo podem ter maiúscula no meio, e a busca do
-- painel compara sem diferenciar. Índice sobre a coluna crua não seria usado
-- por uma consulta que chama `lower()`.
CREATE INDEX IF NOT EXISTS orders_email_idx
  ON public.orders (lower(customer_email));

-- Cadastro de cliente de balcão, achado pelo e-mail — o mesmo caminho que
-- `adminDeleteCustomer` usa para excluir.
CREATE INDEX IF NOT EXISTS manual_customers_email_idx
  ON public.manual_customers (lower(email));
