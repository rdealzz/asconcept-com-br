-- Checkout sem cadastro.
--
-- Exigir conta antes de pagar é o maior ponto de fuga do funil: quem chegou
-- pelo Instagram, decidiu comprar e esbarra num cadastro com confirmação de
-- e-mail costuma não voltar. A partir daqui o cliente compra como convidado, e
-- a conta nasce sozinha depois que o pagamento é aprovado.
--
-- Como isso funciona, e por que não foi preciso reescrever o pagamento
-- ----------------------------------------------------------------------
-- O convidado entra numa SESSÃO ANÔNIMA do próprio Supabase Auth
-- (`signInAnonymously`). Ele é um usuário de verdade em `auth.users` — só não
-- tem e-mail nem senha. Com isso, tudo que já existe continua valendo sem uma
-- linha alterada: o middleware confere o JWT do mesmo jeito, a RLS amarra o
-- pedido em `auth.uid() = user_id` do mesmo jeito, e `loadOwnOrder` continua
-- recusando pedido de outro dono. Nenhuma porta nova foi aberta no checkout —
-- que é exatamente o que se quer numa área que move dinheiro.
--
-- Quando o pagamento é aprovado, o servidor promove essa conta anônima a conta
-- de verdade, com o e-mail que a pessoa digitou no checkout (ver
-- `promoverConvidado`, em payments-core.server.ts). O pedido já estava amarrado
-- naquele id, então o histórico aparece inteiro no primeiro login.
--
-- O que esta migração conserta
-- ----------------------------
-- `handle_new_user` roda para TODO usuário novo e insere em `public.profiles`,
-- cuja coluna `email` é NOT NULL. Um convidado não tem e-mail: o INSERT viola a
-- restrição, o gatilho estoura, e o Supabase devolve erro na criação do usuário
-- anônimo. Ou seja: sem esta migração, o checkout de convidado não nasce — ele
-- falha no primeiro passo, com uma mensagem de erro de banco.
--
-- Duas mudanças, então:
--
--   1. o gatilho IGNORA quem não tem e-mail. Convidado não vira linha em
--      `profiles` — e isso não é só para não estourar: a lista de clientes do
--      painel lê `profiles`, e ela encheria de cadastros vazios, um por pessoa
--      que abriu o checkout e desistiu;
--   2. um gatilho novo, no momento em que o e-mail é preenchido. É ali que o
--      convidado vira cliente, e é ali que o perfil e o papel nascem — pela
--      MESMA função, que já sabe fazer isso e já é idempotente.
--
-- Antes de isto valer, é preciso ligar "Anonymous sign-ins" nas configurações
-- de Auth do projeto. Sem isso, o botão de convidado no checkout devolve erro —
-- e a tela, de propósito, continua oferecendo o login normal como saída.
--
-- O script roda de novo sem susto, que é como ele acaba sendo usado — colado no
-- SQL Editor quando o deploy não aplica a migração.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Convidado: sessão anônima, sem e-mail. Não tem perfil a criar — ele nasce
  -- quando (e se) a conta for promovida, pelo gatilho de UPDATE abaixo.
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        name  = COALESCE(EXCLUDED.name,  public.profiles.name);

  IF NEW.email = 'ersutibiti@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- O convidado virando cliente.
--
-- A promoção é um UPDATE em `auth.users` (o e-mail sai de nulo), e o gatilho de
-- INSERT não vê UPDATE. Sem este, a conta promovida ficaria sem perfil: o nome
-- não apareceria em lugar nenhum e a lista de clientes do painel não a
-- mostraria — apesar de a pessoa ter comprado.
DROP TRIGGER IF EXISTS on_auth_user_email_added ON auth.users;
CREATE TRIGGER on_auth_user_email_added
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (
    (OLD.email IS NULL OR OLD.email = '')
    AND NEW.email IS NOT NULL
    AND NEW.email <> ''
  )
  EXECUTE FUNCTION public.handle_new_user();
