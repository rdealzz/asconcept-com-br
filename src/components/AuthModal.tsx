import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/**
 * AuthModal — entrar / criar conta / recuperar senha.
 *
 * Mora no __root junto com a sacola: openAuth() é chamado de qualquer rota
 * (finalizar compra, aplicar cupom, ver pedidos), então o modal precisa
 * existir em todas elas. Antes vivia só na home e o clique não abria nada.
 */
export function AuthModal() {
  const { isOpen, closeAuth, signIn, signUp, resetPassword, user } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);

  useEffect(() => {
    if (user && isOpen) closeAuth();
  }, [user, isOpen, closeAuth]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setInfo(null);
      setSignedUpEmail(null);
      setConfirmPassword("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const switchMode = (m: "login" | "signup" | "forgot") => {
    setMode(m);
    setError(null);
    setInfo(null);
    setConfirmPassword("");
  };

  const passwordsMismatch =
    mode === "signup" && confirmPassword.length > 0 && confirmPassword !== password;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === "signup" && password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else if (mode === "signup") {
      const { error } = await signUp(email, password, name, phone);
      if (error) setError(error);
      else setSignedUpEmail(email.trim());
    } else {
      const { error } = await resetPassword(email);
      if (error) setError(error);
      else setInfo("Enviamos um link de recuperação para o seu e-mail.");
    }
    setLoading(false);
  };

  if (signedUpEmail) {
    return (
      <>
        <div
          onClick={closeAuth}
          className="fixed inset-0 z-[80] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
        />
        <div className="fixed inset-0 z-[90] flex items-end justify-center pointer-events-none sm:items-center sm:p-4">
          <div className="pointer-events-auto relative max-h-[95svh] w-full max-w-md overflow-y-auto bg-background p-6 animate-in fade-in zoom-in-95 duration-300 sm:p-8 md:p-10">
            <button
              onClick={closeAuth}
              aria-label="Fechar"
              className="absolute right-4 top-4 hover:text-accent"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <p className="text-[11px] tracking-luxe uppercase text-accent">Conta criada</p>
            <h2 className="mt-2 font-serif text-3xl">Confirme seu e-mail</h2>
            <p className="mt-4 text-sm font-light leading-relaxed text-muted-foreground">
              Enviamos um e-mail de confirmação para{" "}
              <span className="text-foreground">{signedUpEmail}</span>. Verifique sua caixa de
              entrada (e o spam) e confirme para acessar sua conta.
            </p>
            <button
              onClick={closeAuth}
              className="mt-8 w-full asc-btn-primary py-4 text-[11px] tracking-luxe uppercase"
            >
              Entendi
            </button>
          </div>
        </div>
      </>
    );
  }

  const title =
    mode === "login" ? "Entrar" : mode === "signup" ? "Criar Conta" : "Recuperar acesso";
  const eyebrow =
    mode === "login" ? "Bem-vindo de volta" : mode === "signup" ? "Nova conta" : "Esqueci a senha";

  return (
    <>
      <div
        onClick={closeAuth}
        className="fixed inset-0 z-[80] bg-charcoal/70 backdrop-blur-sm animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 z-[90] flex items-end justify-center pointer-events-none sm:items-center sm:p-4">
        <div className="pointer-events-auto relative max-h-[95svh] w-full max-w-md overflow-y-auto bg-background p-6 animate-in fade-in zoom-in-95 duration-300 sm:p-8 md:p-10">
          <button
            onClick={closeAuth}
            aria-label="Fechar"
            className="absolute right-4 top-4 hover:text-accent"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <p className="text-[11px] tracking-luxe uppercase text-accent">{eyebrow}</p>
          <h2 className="mt-2 font-serif text-3xl">{title}</h2>
          <p className="mt-2 text-sm font-light text-muted-foreground">
            {mode === "login"
              ? "Acesse sua conta para finalizar a compra."
              : mode === "signup"
                ? "Registre-se e ganhe 10% OFF na primeira compra."
                : "Digite o e-mail cadastrado para receber o link."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Celular (WhatsApp)
                  </label>
                  <input
                    type="tel"
                    required
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="(11) 98765-4321"
                    value={phone}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                      let out = d;
                      if (d.length > 2 && d.length <= 7) out = `(${d.slice(0, 2)}) ${d.slice(2)}`;
                      else if (d.length > 7)
                        out = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
                      else if (d.length > 0) out = `(${d}`;
                      setPhone(out);
                    }}
                    className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent transition-colors"
                  />
                  <p className="mt-1 text-[10px] font-light text-muted-foreground/70">
                    Usaremos apenas para contato do atelier sobre seus pedidos.
                  </p>
                </div>
              </>
            )}
            <div>
              <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                E-mail
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent transition-colors"
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                    Senha
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-[10px] tracking-luxe uppercase text-accent hover:underline underline-offset-4"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  minLength={mode === "signup" ? 6 : 4}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent transition-colors"
                />
              </div>
            )}
            {mode === "signup" && (
              <div>
                <label className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                  Confirmar senha
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`mt-1 w-full border-b bg-transparent py-2 text-sm outline-none transition-colors focus:border-accent ${
                    passwordsMismatch ? "border-destructive" : "border-foreground/30"
                  }`}
                />
                {passwordsMismatch && (
                  <p className="mt-1 text-[10px] text-destructive">As senhas não coincidem.</p>
                )}
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
            {info && <p className="text-xs text-accent">{info}</p>}

            <button
              type="submit"
              disabled={loading || passwordsMismatch}
              className="w-full asc-btn-primary py-4 text-[11px] tracking-luxe uppercase disabled:opacity-50"
            >
              {loading
                ? "Aguarde..."
                : mode === "login"
                  ? "Entrar"
                  : mode === "signup"
                    ? "Criar Conta"
                    : "Enviar link de recuperação"}
            </button>
          </form>

          <div className="mt-6 text-center text-xs font-light text-muted-foreground">
            {mode === "login" && (
              <>
                Não tem uma conta?{" "}
                <button
                  onClick={() => switchMode("signup")}
                  className="text-foreground hover:text-accent underline underline-offset-4"
                >
                  Criar conta
                </button>
              </>
            )}
            {mode === "signup" && (
              <>
                Já tem uma conta?{" "}
                <button
                  onClick={() => switchMode("login")}
                  className="text-foreground hover:text-accent underline underline-offset-4"
                >
                  Entrar
                </button>
              </>
            )}
            {mode === "forgot" && (
              <>
                Lembrou a senha?{" "}
                <button
                  onClick={() => switchMode("login")}
                  className="text-foreground hover:text-accent underline underline-offset-4"
                >
                  Voltar ao login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
