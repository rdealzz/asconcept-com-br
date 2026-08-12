-- Storage: tira as policies de escrita que ninguém usa.
--
-- Depois de ligar a RLS (20260812150000), o scanner passou a apontar que as
-- policies de escrita do bucket `product-photos` liberam por `bucket_id` e
-- papel de admin, sem amarrar a posse de cada arquivo. Ele mesmo classifica
-- como aviso e diz que não é explorável hoje, "caso envios direto do navegador
-- sejam habilitados um dia".
--
-- A resposta certa não é amarrar posse: é tirar a permissão. Envio direto do
-- navegador não existe neste projeto e não vai existir — é uma decisão de
-- desenho, tomada quando aquele caminho se mostrou dependente de estados do
-- banco que a aplicação não controla (ver o cabeçalho de
-- `product-photos.functions.ts`). A ÚNICA escrita no Storage em todo o código
-- é `supabaseAdmin.storage.from(...).upload(...)`, no servidor, com service
-- role — que não passa por RLS e portanto não precisa de policy nenhuma.
--
-- Com as três policies fora, a conta de qualquer pessoa logada — admin
-- inclusive — deixa de conseguir escrever no bucket pela API pública. Sobra a
-- leitura, que é o que a vitrine precisa. Menos privilégio concedido do que
-- antes, e nada deixa de funcionar: o painel continua enviando foto pelo
-- servidor, como sempre fez.
--
-- Se um dia o envio direto do navegador voltar a ser desejado, o caminho é
-- recriar a policy de INSERT já com a posse amarrada — e aí o aviso do scanner
-- volta a fazer sentido.

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins upload product photos" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Admins update product photos" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Admins delete product photos" ON storage.objects';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE '[storage] sem privilégio para remover as policies de escrita — rode o DROP POLICY no SQL Editor';
END $$;

-- A policy de leitura fica: é ela que serve a foto na vitrine se o bucket
-- deixar de ser público um dia.
--
-- E `public.coupon_uses` continua sem UPDATE nem DELETE de propósito, que é o
-- segundo aviso do scanner: é essa ausência que impede um cliente de apagar o
-- próprio registro de uso e gastar o cupom duas vezes. Quem corrige, quando
-- precisa, é o servidor com service role.
