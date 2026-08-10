-- Curadoria de vitrine: o admin escolhe quais peças aparecem na vitrine
-- giratória da home. Sem nenhuma marcada, a home exibe "Nova curadoria em breve".
--
-- Não mexe em RLS: as políticas "Admins update products" (app_private.has_role)
-- já cobrem esta coluna — quem não é admin não consegue destacar nada, mesmo
-- chamando a API direto.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

-- A home filtra por is_featured a cada visita; o índice parcial cobre só as
-- poucas linhas marcadas, que é exatamente a consulta que importa.
CREATE INDEX IF NOT EXISTS products_is_featured_idx
  ON public.products (is_featured)
  WHERE is_featured;

COMMENT ON COLUMN public.products.is_featured IS
  'Curadoria do admin: peça exibida na vitrine de destaques da home.';
