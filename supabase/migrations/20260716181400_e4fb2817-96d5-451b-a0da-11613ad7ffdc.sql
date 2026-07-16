
CREATE POLICY "Admins delete orders" ON public.orders FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete profiles" ON public.profiles FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));
