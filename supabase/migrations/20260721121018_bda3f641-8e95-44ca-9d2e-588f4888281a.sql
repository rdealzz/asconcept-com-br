alter table public.orders add column if not exists stripe_session_id text;
create index if not exists idx_orders_stripe_session_id on public.orders(stripe_session_id);