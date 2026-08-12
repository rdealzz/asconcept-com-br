-- Álbuns de cor: a mesma peça em cores diferentes vira um card só na vitrine.
--
-- Cada cor continua sendo um produto inteiro — foto, preço, estoque, SKU e URL
-- próprios — e é por isso que carrinho, checkout, pedido e e-mail não precisaram
-- mudar: eles já gravam a variação comprada. Esta coluna só diz quais produtos
-- a vitrine mostra junto, em que ordem, e de que cor é o seletor de cada um.
--
-- Uma coluna JSONB, e não sete colunas: o agrupamento é lido inteiro no
-- navegador (o catálogo já vem todo), então não há consulta a indexar, e uma
-- coluna só é um degrau só na escada de colunas opcionais do catálogo — o app
-- continua de pé enquanto esta migração não roda.
--
-- Formato:
--   {
--     "group": "camiseta-basica-polo-ralph-lauren",  -- id do álbum
--     "label": "Camiseta Básica Polo Ralph Lauren",  -- nome exibido no painel
--     "position": 0,                                  -- ordem do seletor
--     "primary": true,                                -- capa do álbum
--     "color": "#111111",                             -- cor da peça
--     "accent": "#C1121F",                            -- cor do logo (opcional)
--     "colorLabel": "Preta com logo vermelho"
--   }
--
-- Não mexe em RLS: a política "Admins update products" (app_private.has_role)
-- já cobre a coluna nova — quem não é admin não agrupa nada, mesmo chamando a
-- API direto.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant JSONB;

COMMENT ON COLUMN public.products.variant IS
  'Álbum de cores da peça: grupo, ordem, peça principal e cores do seletor. Ver src/lib/variants.ts.';

-- O painel lista os álbuns existentes; o índice cobre exatamente essa leitura e
-- ignora as peças soltas, que são a maioria.
CREATE INDEX IF NOT EXISTS products_variant_group_idx
  ON public.products ((variant ->> 'group'))
  WHERE variant IS NOT NULL;
