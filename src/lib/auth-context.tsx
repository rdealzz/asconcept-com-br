import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { triggerWelcomeMail } from "./mail";

export type AppUser = {
  email: string;
  name?: string;
  isAdmin: boolean;
};

type StoredCustomer = { email: string; password: string; name?: string; createdAt?: string };

export type CustomerAddress = {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

type AuthCtx = {
  user: AppUser | null;
  loading: boolean;
  isOpen: boolean;
  openAuth: () => void;
  closeAuth: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (patch: { name?: string }) => void;
  getAddress: (email?: string) => CustomerAddress | null;
  saveAddress: (address: CustomerAddress) => void;
  listCustomers: () => { email: string; name?: string; createdAt?: string }[];
};

const Ctx = createContext<AuthCtx | null>(null);

const USERS_KEY = "as_customers";
const SESSION_KEY = "as_session";

// Contas administrativas (desenvolvedor + sócio)
const ADMINS: { id: string; password: string; name: string }[] = [
  { id: "rdealzz", password: "2311$", name: "rdealzz" },
  { id: "gui", password: "@Bonito123", name: "Gui" },
];

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
    const admin = ADMINS.find(
      (a) => a.id.toLowerCase() === id.toLowerCase() && a.password === password,
    );
    if (admin) {
      persist({ email: admin.id, name: admin.name, isAdmin: true });
      return { error: null };
    }
    const customers = readJSON<StoredCustomer[]>(USERS_KEY, []);
    const found = customers.find(
      (c) => c.email.toLowerCase() === id.toLowerCase() && c.password === password,
    );
    if (!found) return { error: "E-mail ou senha inválidos." };
    persist({ email: found.email, name: found.name, isAdmin: false });
    return { error: null };
  };

  const signUp: AuthCtx["signUp"] = async (email, password, name) => {
    const id = email.trim();
    if (!id || !password) return { error: "Preencha e-mail e senha." };
    if (ADMINS.some((a) => a.id.toLowerCase() === id.toLowerCase()))
      return { error: "Este identificador não está disponível." };
    if (password.length < 4) return { error: "A senha deve ter ao menos 4 caracteres." };
    const customers = readJSON<StoredCustomer[]>(USERS_KEY, []);
    if (customers.some((c) => c.email.toLowerCase() === id.toLowerCase()))
      return { error: "Já existe uma conta com este e-mail." };
    const cleanName = (name ?? "").trim() || undefined;
    const next = [
      ...customers,
      { email: id, password, name: cleanName, createdAt: new Date().toISOString() },
    ];
    writeJSON(USERS_KEY, next);
    persist({ email: id, name: cleanName, isAdmin: false });
    void triggerWelcomeMail(id, cleanName);
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
