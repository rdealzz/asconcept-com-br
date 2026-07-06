
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address JSONB;

INSERT INTO public.products (name, description, price, category, image, sizes, sort_order) VALUES
('Camisa de Linho Cornwall','Linho italiano acabado à mão. Modelagem relaxada.',1590,'clothes','/src/assets/product-1.jpg','{"P":2,"M":2,"G":1,"GG":0}',1),
('Suéter de Cashmere Kensington','Cashmere puro da Mongólia em azul meia-noite.',3290,'clothes','/src/assets/product-2.jpg','{"P":1,"M":1,"G":1,"GG":0}',2),
('Blazer Trespassado Mayfair','Lã com lapela pico, alfaiataria napolitana.',7890,'clothes','/src/assets/product-3.jpg','{"P":0,"M":1,"G":0,"GG":0}',3),
('Calça de Prega Windsor','Cintura alta em crepe de lã marfim.',2590,'clothes','/src/assets/product-4.jpg','{"P":0,"M":0,"G":0,"GG":0}',4),
('Lenço de Seda Saint-Tropez','Twill de seda com bainha rolada à mão, estampado em Como.',1850,'clothes','/src/assets/product-5.jpg','{"P":2,"M":3,"G":2,"GG":1}',5),
('Mocassim Belgrave','Couro de bezerro costurado Blake, conhaque.',4290,'clothes','/src/assets/product-6.jpg','{"P":0,"M":1,"G":1,"GG":0}',6),
('Polo Trançado Hampton','Algodão egípcio com costuras finalizadas à mão.',2190,'clothes','/src/assets/product-7.jpg','{"P":0,"M":1,"G":0,"GG":0}',7),
('Lenço de Bolso Belgravia','Seda doze dobras, ourela marfim.',790,'clothes','/src/assets/product-8.jpg','{"P":1,"M":2,"G":1,"GG":0}',8)
ON CONFLICT DO NOTHING;
