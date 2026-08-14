-- Tag "Novidade" por decisão do admin, não por data.
--
-- Até aqui a tag saía de `created_at`: peça cadastrada nos últimos 15 dias
-- recebia o selo sozinha. Isso tirava do admin o controle sobre a vitrine —
-- uma reposição cadastrada hoje virava "novidade", e uma peça que ele quer
-- anunciar como novidade perdia o selo no décimo sexto dia, sem aviso.
--
-- Com a coluna, a regra passa a ser a mesma de `force_last_item`: a tag existe
-- se, e somente se, o admin marcou a peça.
--
-- Índice parcial pelo mesmo motivo do de `is_featured`: quem consulta quer as
-- marcadas, que são poucas.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS force_new BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS products_force_new_idx
  ON public.products (force_new)
  WHERE force_new;