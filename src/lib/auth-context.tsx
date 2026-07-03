import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { triggerWelcomeMail } from "./mail";

export type AppUser = {
  email: string;
  isAdmin: boolean;
};

type StoredCustomer = { email: string; password: string };

type AuthCtx = {
  user: AppUser | null;
  loading: boolean;
  isOpen: boolean;
  openAuth: () => void;
  closeAuth: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const USERS_KEY = "as_customers";
const SESSION_KEY = "as_session";
const MASTER_USER = "rdealzz";
const MASTER_PASS = "2311$";

function readJSON<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
}
function writeJSON(k: string, v: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    setUser(readJSON<AppUser | null>(SESSION_KEY, null));
    setLoading(false);
  }, []);

  const persist = (u: AppUser | null) => {
    setUser(u);
    if (u) writeJSON(SESSION_KEY, u);
    else if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
  };

  const signIn: AuthCtx["signIn"] = async (email, password) => {
    const id = email.trim();
    if (id === MASTER_USER && password === MASTER_PASS) {
      persist({ email: MASTER_USER, isAdmin: true });
      return { error: null };
    }
    const customers = readJSON<StoredCustomer[]>(USERS_KEY, []);
    const found = customers.find(
      (c) => c.email.toLowerCase() === id.toLowerCase() && c.password === password,
    );
    if (!found) return { error: "E-mail ou senha inválidos." };
    persist({ email: found.email, isAdmin: false });
    return { error: null };
  };

  const signUp: AuthCtx["signUp"] = async (email, password) => {
    const id = email.trim();
    if (!id || !password) return { error: "Preencha e-mail e senha." };
    if (id.toLowerCase() === MASTER_USER.toLowerCase())
      return { error: "Este identificador não está disponível." };
    if (password.length < 4) return { error: "A senha deve ter ao menos 4 caracteres." };
    const customers = readJSON<StoredCustomer[]>(USERS_KEY, []);
    if (customers.some((c) => c.email.toLowerCase() === id.toLowerCase()))
      return { error: "Já existe uma conta com este e-mail." };
    const next = [...customers, { email: id, password }];
    writeJSON(USERS_KEY, next);
    persist({ email: id, isAdmin: false });
    return { error: null };
  };

  const signOut = async () => persist(null);

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
