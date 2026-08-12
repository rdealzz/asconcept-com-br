-- Auditoria: quem pode MODIFICAR o que.
--
-- A regra da casa é uma só — escrita é do admin; para o resto do mundo a loja
-- é leitura. Passando tabela por tabela, três lugares não cumpriam isso. Todos
-- são coisa que um cliente logado comum conseguia fazer com a chave publicável
-- que vai no HTML da loja: não precisa invadir nada, basta abrir o console.
--
-- As duas exceções que FICAM, e por quê:
--
--   * `profiles`: o cliente edita o próprio cadastro (nome, telefone). É dado
--     dele, não da loja, e a policy já amarra em `auth.uid() = id`;
--   * `newsletter_subscribers`: qualquer visitante insere o próprio e-mail —
--     é o formulário de assinatura. Ler a lista continua sendo só do admin.

-- ── 1. A função que zerava o estoque de qualquer peça ────────────────────
--
-- `decrement_product_stock` é SECURITY DEFINER (roda com os poderes do dono,
-- por cima da RLS) e estava com EXECUTE liberado para `authenticated`. Ou
-- seja: qualquer cliente logado podia chamar
--
--   supabase.rpc('decrement_product_stock', { _product_id: '…', _size: 'M', _qty: 999 })
--
-- e derrubar o estoque de qualquer peça a zero — a peça sumia da vitrine como
-- "Esgotado". Não vaza dado nenhum; estraga a loja, que é pior de perceber.
--
-- E ela é código morto: quem baixa estoque hoje é `consume_order_stock`, que
-- só o service role executa (é chamada pelo webhook do Mercado Pago e pelo
-- painel, sempre pelo servidor). Some inteira, então — função que não existe
-- não precisa de permissão certa.
DROP FUNCTION IF EXISTS public.decrement_product_stock(uuid, text, int);

-- ── 2. Pedido forjado pelo cliente ───────────────────────────────────────
--
-- A policy de INSERT em `orders` dizia apenas "o pedido tem de ser seu"
-- (`auth.uid() = user_id`). Com isso um cliente logado conseguia gravar um
-- pedido com o total que quisesse e — o que importa — com o status que
-- quisesse: um "Aguardando Aprovação" forjado aparece no painel exatamente
-- como um pedido pago, e o risco é despachar peça que ninguém comprou.
--
-- O checkout de verdade nunca dependeu dessa policy: o pedido nasce no
-- servidor, com service role, depois de recalcular preço, frete e cupom pelo
-- banco (ver `createPendingOrderCore`). Quem insere pedido pelo navegador é só
-- o cadastro manual do painel — que é do admin.
DROP POLICY IF EXISTS "Users create own orders" ON public.orders;

CREATE POLICY "Admins create orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

-- ── 3. Registro de uso de cupom gravado à mão ────────────────────────────
--
-- Mesmo caso: quem reserva o cupom é o servidor com service role
-- (`claimCouponUse`), e a policy de INSERT só dava ao cliente a chance de
-- mexer no próprio controle de uso. Fica só leitura — que é o que a tela do
-- cupom precisa para saber se ele já foi usado.
DROP POLICY IF EXISTS "users insert own coupon uses" ON public.coupon_uses;
REVOKE INSERT ON public.coupon_uses FROM authenticated;

-- ── 4. `public.has_role` ainda executável por anon ───────────────────────
--
-- A função virou `app_private.has_role` faz tempo, e todas as policies foram
-- reescritas para a nova (20260709002223). A antiga continuou com EXECUTE
-- liberado para `anon` e `authenticated` — o que permite perguntar ao banco se
-- um dado id de usuário é admin. É vazamento pequeno (precisa do UUID), mas é
-- permissão que ninguém usa.
--
-- A retirada é condicional de propósito: se ALGUMA policy ainda chamar a
-- versão antiga, tirar o EXECUTE quebraria as escritas do admin. Então o banco
-- confere primeiro e, se achar alguma, não mexe e avisa.
DO $$
DECLARE
  usando_antiga int;
BEGIN
  SELECT count(*) INTO usando_antiga
  FROM pg_policies
  WHERE replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                'app_private.has_role', '') ILIKE '%has_role%';

  IF usando_antiga = 0 THEN
    REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
  ELSE
    RAISE NOTICE '[rls] % policy(s) ainda usam public.has_role — EXECUTE mantido', usando_antiga;
  END IF;
EXCEPTION
  WHEN insufficient_privilege OR undefined_function THEN
    RAISE NOTICE '[rls] sem privilégio para mexer em public.has_role — sem problema, nada depende disso';
END $$;
