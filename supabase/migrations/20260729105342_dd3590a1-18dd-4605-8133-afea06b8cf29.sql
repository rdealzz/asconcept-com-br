alter table public.orders
  add column if not exists mail_sent boolean not null default false;