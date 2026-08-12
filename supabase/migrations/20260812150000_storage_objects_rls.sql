-- Tranca a escrita no Storage.
--
-- O que o scanner achou: `storage.objects` sem RLS. Sem ela, qualquer pessoa
-- — inclusive anônima, com a chave publicável que vai no HTML da loja — podia
-- enviar, sobrescrever ou APAGAR arquivo em qualquer bucket. Na prática: trocar
-- a foto de uma peça por outra coisa, ou zerar o bucket inteiro.
--
-- Por que a tranca não estava lá, se a migração do bucket
-- (20260807200000_product_photos_bucket.sql) já criava as policies:
--
--   1. o papel que aplica migração no Lovable Cloud não é dono do schema
--      `storage`, então aquele trecho podia falhar e não deixar nada de pé —
--      é o que o próprio comentário de `product-photos.functions.ts` já
--      registrava;
--   2. e mesmo que tivesse passado, aquelas policies chamavam
--      `public.has_role()`, cuja permissão de execução foi revogada de
--      `authenticated` na 20260706111655. A função em uso hoje é
--      `app_private.has_role()`. As policies antigas, portanto, não valeriam
--      para ninguém.
--
-- Isto aqui refaz as duas coisas certas. Nada disso atrapalha o envio de fotos
-- pelo painel: o upload passa pelo servidor com o service role, que não
-- responde a RLS (ver `uploadProductPhotoVariant`). Nenhum código do navegador
-- fala com o Storage direto.
--
-- Tudo dentro de blocos com tratamento de exceção: se o papel da migração não
-- tiver privilégio no schema `storage`, a migração AVISA e segue — derrubar o
-- deploy inteiro por causa disso seria trocar um problema por outro. Quando
-- isso acontecer, o mesmo SQL está no painel (Admin · Produtos · Segurança do
-- Storage) para colar no SQL Editor do Supabase, onde o dono do projeto tem o
-- privilégio que falta.

DO $$
BEGIN
  -- 1) A tranca. Com RLS ligada e sem policy, a operação é negada — o padrão
  --    passa a ser "ninguém escreve", e as policies abaixo abrem só o que deve.
  BEGIN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
  EXCEPTION
    WHEN insufficient_privilege OR undefined_table THEN
      RAISE NOTICE '[storage] sem privilégio para ligar RLS em storage.objects — rode o SQL do painel no SQL Editor';
      RETURN;
  END;

  -- 2) Fora as antigas, que apontavam para a função errada.
  EXECUTE 'DROP POLICY IF EXISTS "Product photos are public" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Admins upload product photos" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Admins update product photos" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Admins delete product photos" ON storage.objects';

  -- 3) Leitura pública, só no bucket da vitrine. O bucket é público, então a
  --    foto na loja é um GET direto na CDN e nem passa por aqui; a policy
  --    existe para o dia em que ele deixar de ser.
  EXECUTE $p$
    CREATE POLICY "Product photos are public" ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'product-photos')
  $p$;

  -- 4) Escrita: só admin, e só no bucket da vitrine. Qualquer outro bucket
  --    fica sem policy nenhuma, ou seja, fechado para anon e authenticated.
  EXECUTE $p$
    CREATE POLICY "Admins upload product photos" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'product-photos'
        AND app_private.has_role(auth.uid(), 'admin'::public.app_role)
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY "Admins update product photos" ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'product-photos'
        AND app_private.has_role(auth.uid(), 'admin'::public.app_role)
      )
      WITH CHECK (
        bucket_id = 'product-photos'
        AND app_private.has_role(auth.uid(), 'admin'::public.app_role)
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY "Admins delete product photos" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'product-photos'
        AND app_private.has_role(auth.uid(), 'admin'::public.app_role)
      )
  $p$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE '[storage] sem privilégio para criar policies em storage.objects — rode o SQL do painel no SQL Editor';
END $$;

-- Sobre `public.coupon_uses`, o segundo aviso do scanner: ela ter só INSERT e
-- SELECT, sem UPDATE nem DELETE, é de propósito. Quem apaga e quem vincula uso
-- a pedido é o servidor com service role (`releaseCouponUse`,
-- `attachCouponOrder`), que não passa por RLS. Um cliente não pode apagar o
-- próprio registro de uso para gastar o cupom duas vezes — é exatamente o que
-- essa ausência de policy garante. Nada a fazer.
