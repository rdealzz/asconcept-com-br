
-- Allow admins to insert orders (manual admin entry)
CREATE POLICY "Admins insert orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

-- Manual customers table for admin-added leads (do not tie to auth.users)
CREATE TABLE public.manual_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_customers TO authenticated;
GRANT ALL ON public.manual_customers TO service_role;

ALTER TABLE public.manual_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage manual customers" ON public.manual_customers
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));
