
-- 1) Grant admin role to the designated master email (both immediate + on future signup)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'ersutibiti@gmail.com'
ON CONFLICT DO NOTHING;

-- Update handle_new_user to auto-grant admin to the master email at signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email = 'ersutibiti@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Coupon usage tracking (one-shot per user)
CREATE TABLE IF NOT EXISTS public.coupon_uses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  used_at timestamp with time zone NOT NULL DEFAULT now(),
  order_id text,
  UNIQUE (user_id, code)
);
GRANT SELECT, INSERT ON public.coupon_uses TO authenticated;
GRANT ALL ON public.coupon_uses TO service_role;
ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own coupon uses" ON public.coupon_uses FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "users insert own coupon uses" ON public.coupon_uses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3) Add coupon fields to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;

-- 4) Testimonials (public read, admin write)
CREATE TABLE IF NOT EXISTS public.testimonials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name text NOT NULL,
  content text NOT NULL,
  rating integer NOT NULL DEFAULT 5,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.testimonials TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.testimonials TO authenticated;
GRANT ALL ON public.testimonials TO service_role;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read testimonials" ON public.testimonials FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin insert testimonials" ON public.testimonials FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update testimonials" ON public.testimonials FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete testimonials" ON public.testimonials FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_testimonials_updated_at
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 4 luxurious testimonials
INSERT INTO public.testimonials (customer_name, content, rating, sort_order) VALUES
  ('Isabela Marques', 'O caimento é impecável — tecido nobre, costuras artesanais e uma discrição que só peças verdadeiramente refinadas oferecem.', 5, 1),
  ('Rafael Andrade', 'Investimento certeiro. A qualidade do cashmere e o acabamento europeu justificam cada detalhe. Nunca mais retorno ao comum.', 5, 2),
  ('Camila Vasconcellos', 'Vestir A&S é uma experiência sensorial. O toque do tecido, a modelagem precisa — luxo silencioso em sua forma mais pura.', 5, 3),
  ('Henrique Toledo', 'Elegância atemporal. Estas peças transitam do escritório ao jantar sem esforço. Serviço impecável, entrega refinada.', 4, 4)
ON CONFLICT DO NOTHING;

-- 5) Newsletter subscribers (public insert, admin read)
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT INSERT ON public.newsletter_subscribers TO anon, authenticated;
GRANT SELECT ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public subscribe" ON public.newsletter_subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin read subscribers" ON public.newsletter_subscribers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
