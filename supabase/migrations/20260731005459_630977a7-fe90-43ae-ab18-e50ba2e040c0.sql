ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preparation_mail_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipped_mail_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivered_mail_sent boolean NOT NULL DEFAULT false;