-- Bucket para as fotos das peças.
--
-- Até aqui a foto era gravada como data URL base64 dentro da própria linha do
-- produto (products.image TEXT e products.gallery JSONB). Isso custava caro na
-- vitrine por três motivos, todos consequência de a foto viajar dentro do JSON
-- da API em vez de ser um arquivo:
--
--   1. resposta REST não é cacheável — quem visitou a loja ontem rebaixava
--      tudo hoje, do zero, toda vez;
--   2. o loading="lazy" dos cards não adiava nada, porque os bytes já tinham
--      chegado antes de existir qualquer <img> na página;
--   3. base64 ainda infla ~33%, e as capas de todas as peças vinham numa
--      requisição só, que precisava terminar antes da primeira foto aparecer.
--
-- Com as fotos aqui, cada uma vira arquivo servido pela CDN com cache longo, e
-- o JSON do catálogo encolhe para os campos de texto.
--
-- Público na leitura: é vitrine, o navegador de qualquer visitante precisa
-- alcançar a foto sem sessão. A escrita fica restrita a admin, pela mesma
-- has_role() que já protege as escritas em public.products.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  TRUE,
  -- 8 MB por arquivo. O admin envia a foto já redimensionada e recomprimida
  -- pelo navegador, então na prática cada variante fica muito abaixo disso; o
  -- limite existe só para barrar um envio absurdo.
  8388608,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- As policies são recriadas do zero para a migração poder rodar de novo sem
-- estourar em "policy already exists".
DROP POLICY IF EXISTS "Product photos are public" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload product photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins update product photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete product photos" ON storage.objects;

CREATE POLICY "Product photos are public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-photos');

CREATE POLICY "Admins upload product photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update product photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-photos' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'product-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete product photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-photos' AND public.has_role(auth.uid(), 'admin'));
