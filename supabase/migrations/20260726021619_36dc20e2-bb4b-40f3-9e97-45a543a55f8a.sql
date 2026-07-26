ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS mp_status text,
  ADD COLUMN IF NOT EXISTS installments integer;

CREATE INDEX IF NOT EXISTS orders_mp_payment_id_idx ON public.orders (mp_payment_id);