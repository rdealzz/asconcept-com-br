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
    const [profile, admin] = await Promise.all([
      loadProfile(userId),
      checkIsAdmin(userId),
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
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const session = data.session;
      if (session?.user) {
        await hydrateSession(session.user.id, session.user.email ?? "");
      }
      setLoading(false);
    });

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
          void hydrateSession(session.user.id, session.user.email ?? "");
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
    if (error) {
      if (error.message.toLowerCase().includes("already"))
        return { error: "Já existe uma conta com este e-mail." };
      return { error: "Não foi possível concluir o cadastro." };
    }
    void triggerWelcomeMail(cleanEmail, cleanName);
    setJustSignedUp(true);
    return { error: null, justSignedUp: true };
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
    const { error } = await supabase
      .from("profiles")
      .update({ name: nextName })
      .eq("id", user.id);
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
    const { error } = await supabase
      .from("profiles")
      .update({ address: next })
      .eq("id", user.id);
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
