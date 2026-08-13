import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { triggerWelcomeMail } from "./mail";
import { sanitizeText, sanitizeEmail } from "./sanitize";

/**
 * E-mail mestre com privilégio administrativo permanente.
 * Bypass de UI resiliente: se a RPC has_role atrasar/falhar, esta conta
 * continua com isAdmin=true no cliente. A camada de banco (RLS) permanece
 * como fonte real de verdade das permissões de escrita.
 */
export const MASTER_ADMIN_EMAIL = "ersutibiti@gmail.com";
const PENDING_WELCOME_KEY = "asconcept.pendingWelcome";

export const isMasterAdminEmail = (email?: string | null) =>
  !!email && email.trim().toLowerCase() === MASTER_ADMIN_EMAIL;

export type AppUser = {
  id: string;
  email: string;
  name?: string;
  isAdmin: boolean;
};

export type CustomerAddress = {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

export type CustomerRecord = {
  email: string;
  name?: string;
  phone?: string;
  createdAt?: string;
};

type AuthCtx = {
  user: AppUser | null;
  loading: boolean;
  isOpen: boolean;
  openAuth: () => void;
  closeAuth: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    name?: string,
    phone?: string,
  ) => Promise<{ error: string | null; justSignedUp?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  justSignedUp: boolean;
  clearJustSignedUp: () => void;
  updateProfile: (patch: { name?: string }) => Promise<void>;
  getAddress: (email?: string) => CustomerAddress | null;
  saveAddress: (address: CustomerAddress) => Promise<void>;
  listCustomers: () => CustomerRecord[];
  refreshCustomers: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

async function loadProfile(id: string) {
  const { data } = await supabase
    .from("profiles")
    .select("email, name, address")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function checkIsAdmin(id: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", id)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [address, setAddressState] = useState<CustomerAddress | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setOpen] = useState(false);

  const hydrateSession = useCallback(async (userId: string, email: string) => {
    const forcedAdmin = isMasterAdminEmail(email);
    // Aplica bypass de UI imediatamente para o e-mail mestre, sem esperar a RPC.
    if (forcedAdmin) {
      setUser((prev) => ({
        id: userId,
        email,
        name: prev?.name,
        isAdmin: true,
      }));
    }
    // Nunca deixamos uma falha de leitura derrubar a sessão: o usuário
    // continua logado (sem perfil/admin) em vez de ficar em limbo.
    const [profile, admin] = await Promise.all([
      loadProfile(userId).catch((err) => {
        console.error("[auth] loadProfile falhou", err);
        return null;
      }),
      checkIsAdmin(userId).catch((err) => {
        console.error("[auth] checkIsAdmin falhou", err);
        return false;
      }),
    ]);
    const resolvedEmail = profile?.email ?? email;
    setUser({
      id: userId,
      email: resolvedEmail,
      name: profile?.name ?? undefined,
      // Bypass permanente para o e-mail mestre, mesmo se a RPC não retornar admin.
      isAdmin: admin || isMasterAdminEmail(resolvedEmail),
    });
    setAddressState((profile?.address as CustomerAddress | null) ?? null);

    // Boas-vindas: dispara apenas quando a sessão está estabelecida
    // (garantindo bearer token) e uma única vez por conta.
    if (typeof window !== "undefined") {
      try {
        const pending = window.localStorage.getItem(PENDING_WELCOME_KEY);
        if (pending && pending.toLowerCase() === resolvedEmail.toLowerCase()) {
          window.localStorage.removeItem(PENDING_WELCOME_KEY);
          void triggerWelcomeMail(resolvedEmail, profile?.name ?? undefined);
        }
      } catch {
        /* localStorage indisponível — ignora silenciosamente */
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // O `finally` é essencial: se a hidratação falhar (perfil, RPC de admin,
    // rede), `loading` precisa virar false mesmo assim — caso contrário o
    // checkout fica preso no spinner para sempre.
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const session = data.session;
        if (session?.user) {
          await hydrateSession(session.user.id, session.user.email ?? "");
        }
      } catch (err) {
        console.error("[auth] bootstrap falhou", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setUser(null);
        setAddressState(null);
        setCustomers([]);
        return;
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        // Defer to avoid deadlocks
        setTimeout(() => {
          void hydrateSession(session.user.id, session.user.email ?? "").catch((err) =>
            console.error("[auth] hidratação falhou", err),
          );
        }, 0);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [hydrateSession]);

  const refreshCustomers = useCallback(async () => {
    if (!user?.isAdmin) return;
    const { data } = await supabase
      .from("profiles")
      .select("email, name, phone, created_at")
      .order("created_at", { ascending: false });
    if (data) {
      setCustomers(
        data.map((r) => ({
          email: r.email,
          name: r.name ?? undefined,
          phone: (r as { phone?: string | null }).phone ?? undefined,
          createdAt: r.created_at,
        })),
      );
    }
  }, [user?.isAdmin]);

  useEffect(() => {
    if (user?.isAdmin) void refreshCustomers();
  }, [user?.isAdmin, refreshCustomers]);

  const signIn: AuthCtx["signIn"] = async (email, password) => {
    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail) return { error: "Informe um e-mail válido." };
    if (typeof password !== "string" || password.length < 1 || password.length > 200)
      return { error: "Senha inválida." };
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) return { error: "E-mail ou senha inválidos." };
    return { error: null };
  };

  const [justSignedUp, setJustSignedUp] = useState(false);

  const signUp: AuthCtx["signUp"] = async (email, password, name, phone) => {
    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail) return { error: "Informe um e-mail válido." };
    if (typeof password !== "string" || password.length < 6 || password.length > 200)
      return { error: "A senha deve ter ao menos 6 caracteres." };
    const cleanName = sanitizeText(name, { maxLength: 80 });
    if (cleanName.length < 2) return { error: "Informe seu nome completo." };
    const cleanPhone = sanitizeText(phone, { maxLength: 20 });
    const digits = cleanPhone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11)
      return { error: "Informe um número de celular válido com DDD." };
    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { name: cleanName, full_name: cleanName, phone: cleanPhone },
      },
    });
    /**
     * `contaNova` distingue os dois caminhos que levam à MESMA tela.
     *
     * Quando o cadastro é de verdade, marcamos o e-mail de boas-vindas para
     * sair no primeiro login. Quando a conta já existia, não marcamos: quem já
     * é cliente receberia um "bem-vindo" fora de hora, e o e-mail é justamente
     * o que denunciaria que a conta existe.
     */
    const finishSignUp = (contaNova = true) => {
      if (contaNova && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(PENDING_WELCOME_KEY, cleanEmail);
        } catch {
          /* localStorage indisponível — envio será tentado no próximo login */
        }
      }
      setJustSignedUp(true);
      return { error: null, justSignedUp: true };
    };

    if (error) {
      // Sem este log, toda falha virava a mesma frase na tela e não sobrava
      // nada para diagnosticar — nem no navegador, nem no relato do cliente.
      console.error("[auth] signUp falhou", {
        status: error.status,
        code: error.code,
        message: error.message,
      });

      const message = error.message.toLowerCase();
      const code = (error.code ?? "").toLowerCase();

      // Conta já existente NÃO é confirmada para quem perguntou.
      //
      // Dizer "já existe uma conta com este e-mail" transforma o formulário de
      // cadastro em consulta: com uma lista de e-mails vazados, um atacante
      // descobre em minutos quais deles são clientes da loja — insumo pronto
      // para phishing dirigido e para credential stuffing.
      //
      // O caminho daqui é o mesmo do cadastro bem-sucedido: a tela "confirme
      // seu e-mail". As duas respostas ficam indistinguíveis de fora, que é o
      // ponto. Quem realmente esqueceu que já tinha conta não fica preso —
      // aquela tela diz, em texto, para entrar normalmente ou usar "esqueci
      // minha senha" (ver AuthModal).
      if (code === "user_already_exists" || message.includes("already")) return finishSignUp(false);

      const isRateLimit =
        error.status === 429 || message.includes("rate limit") || message.includes("rate_limit");
      // Falha do lado do servidor: o erro fala do ENVIO do e-mail ou do banco,
      // não da validação do formulário. Nesses casos não dá para saber pela
      // resposta se a conta chegou a existir — o Auth às vezes cria o usuário e
      // só depois tropeça no e-mail. Sondamos com as credenciais que o próprio
      // visitante acabou de digitar para decidir qual tela mostrar (nenhum dado
      // de terceiros é exposto).
      const isServerSide =
        isRateLimit ||
        (error.status ?? 0) >= 500 ||
        message.includes("database error") ||
        message.includes("sending");

      if (isServerSide) {
        const probe = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        const probeMsg = (probe.error?.message ?? "").toLowerCase();
        const accountExists =
          !probe.error || probeMsg.includes("not confirmed") || probeMsg.includes("não confirmado");
        if (accountExists) return finishSignUp();

        if (isRateLimit)
          return {
            error: "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.",
          };
        return {
          error:
            "Nosso servidor não conseguiu concluir o cadastro agora. Tente novamente em alguns minutos.",
        };
      }

      // Daqui para baixo o servidor recusou o que foi digitado — a mensagem
      // precisa dizer o quê, senão o visitante repete o mesmo erro.
      if (code === "signup_disabled" || message.includes("not allowed"))
        return {
          error: "O cadastro está temporariamente indisponível. Tente novamente mais tarde.",
        };
      if (code === "weak_password" || message.includes("password"))
        return { error: "Escolha uma senha mais forte, com ao menos 6 caracteres." };
      if (code === "email_address_invalid" || message.includes("email"))
        return { error: "Este e-mail não foi aceito. Confira o endereço e tente novamente." };

      return { error: "Não foi possível concluir o cadastro." };
    }
    return finishSignUp();
  };

  /** Reenvia o link de confirmação para quem criou a conta e não recebeu. */
  const resendConfirmation: AuthCtx["resendConfirmation"] = async (email) => {
    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail) return { error: "Informe um e-mail válido." };
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: cleanEmail,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) {
      console.error("[auth] resend falhou", { status: error.status, message: error.message });
      return { error: "Não foi possível reenviar agora. Aguarde alguns minutos e tente de novo." };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword: AuthCtx["resetPassword"] = async (email) => {
    const id = email.trim();
    if (!id) return { error: "Informe o e-mail cadastrado." };
    const { error } = await supabase.auth.resetPasswordForEmail(id, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const updateProfile: AuthCtx["updateProfile"] = async (patch) => {
    if (!user) return;
    const nextName = sanitizeText(patch.name, { maxLength: 80 }) || null;
    const { error } = await supabase.from("profiles").update({ name: nextName }).eq("id", user.id);
    if (!error) {
      setUser({ ...user, name: nextName ?? undefined });
    }
  };

  const getAddress: AuthCtx["getAddress"] = (email) => {
    if (email && user && email.toLowerCase() !== user.email.toLowerCase()) return null;
    return address;
  };

  const saveAddress: AuthCtx["saveAddress"] = async (next) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ address: next }).eq("id", user.id);
    if (!error) setAddressState(next);
  };

  const listCustomers: AuthCtx["listCustomers"] = () => customers;

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        isOpen,
        openAuth: () => setOpen(true),
        closeAuth: () => setOpen(false),
        signIn,
        signUp,
        signOut,
        resetPassword,
        resendConfirmation,
        justSignedUp,
        clearJustSignedUp: () => setJustSignedUp(false),
        updateProfile,
        getAddress,
        saveAddress,
        listCustomers,
        refreshCustomers,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
