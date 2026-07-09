-- Fix: authenticated role needs EXECUTE on has_role for RLS policies to work
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;

-- Ensure master admin has admin role even if signup happened before the trigger seeded roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'ersutibiti@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Fix seeded product images: point at public/ URLs served by the site
UPDATE public.products SET image = '/products/product-1.jpg' WHERE image = '/src/assets/product-1.jpg';
UPDATE public.products SET image = '/products/product-2.jpg' WHERE image = '/src/assets/product-2.jpg';
UPDATE public.products SET image = '/products/product-3.jpg' WHERE image = '/src/assets/product-3.jpg';
UPDATE public.products SET image = '/products/product-4.jpg' WHERE image = '/src/assets/product-4.jpg';
UPDATE public.products SET image = '/products/product-5.jpg' WHERE image = '/src/assets/product-5.jpg';
UPDATE public.products SET image = '/products/product-6.jpg' WHERE image = '/src/assets/product-6.jpg';
UPDATE public.products SET image = '/products/product-7.jpg' WHERE image = '/src/assets/product-7.jpg';
UPDATE public.products SET image = '/products/product-8.jpg' WHERE image = '/src/assets/product-8.jpg';