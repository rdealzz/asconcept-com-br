-- 1) Move has_role out of the API-exposed public schema
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Rewrite every policy that referenced public.has_role to use app_private.has_role
DROP POLICY IF EXISTS "admin read subscribers" ON public.newsletter_subscribers;
CREATE POLICY "admin read subscribers" ON public.newsletter_subscribers
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "users view own coupon uses" ON public.coupon_uses;
CREATE POLICY "users view own coupon uses" ON public.coupon_uses
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin delete testimonials" ON public.testimonials;
CREATE POLICY "admin delete testimonials" ON public.testimonials
  FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin insert testimonials" ON public.testimonials;
CREATE POLICY "admin insert testimonials" ON public.testimonials
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin update testimonials" ON public.testimonials;
CREATE POLICY "admin update testimonials" ON public.testimonials
  FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING ((auth.uid() = id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete products" ON public.products;
CREATE POLICY "Admins delete products" ON public.products
  FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins insert products" ON public.products;
CREATE POLICY "Admins insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins update products" ON public.products;
CREATE POLICY "Admins update products" ON public.products
  FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins update orders" ON public.orders;
CREATE POLICY "Admins update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users view own orders" ON public.orders;
CREATE POLICY "Users view own orders" ON public.orders
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

-- Drop the old public wrapper now that no policies reference it
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 2) Newsletter: replace WITH CHECK (true) with a real e-mail format check
DROP POLICY IF EXISTS "public subscribe" ON public.newsletter_subscribers;
CREATE POLICY "public subscribe" ON public.newsletter_subscribers
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND length(email) BETWEEN 5 AND 254
    AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );

-- 3) Rebuild stock decrement so it can only be triggered from a real order the caller owns, once per order
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_decremented boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.decrement_product_stock(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.consume_order_stock(_order_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ord public.orders%ROWTYPE;
  item jsonb;
  pid uuid;
  psize text;
  pqty int;
  cur jsonb;
  current_val int;
BEGIN
  IF _order_number IS NULL OR length(_order_number) = 0 THEN
    RAISE EXCEPTION 'Order number required';
  END IF;

  SELECT * INTO ord FROM public.orders WHERE order_number = _order_number FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF ord.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized for this order';
  END IF;

  IF ord.stock_decremented THEN
    RETURN;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(ord.items) LOOP
    pid   := NULLIF(item->>'id', '')::uuid;
    psize := item->>'size';
    pqty  := COALESCE((item->>'qty')::int, (item->>'quantity')::int, 0);

    IF pid IS NULL OR psize NOT IN ('P','M','G','GG') OR pqty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT sizes INTO cur FROM public.products WHERE id = pid FOR UPDATE;
    IF cur IS NULL THEN
      CONTINUE;
    END IF;
    current_val := COALESCE((cur->>psize)::int, 0);
    cur := jsonb_set(cur, ARRAY[psize], to_jsonb(GREATEST(0, current_val - pqty)));
    UPDATE public.products SET sizes = cur WHERE id = pid;
  END LOOP;

  UPDATE public.orders SET stock_decremented = true WHERE order_number = _order_number;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_order_stock(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_order_stock(text) TO authenticated;