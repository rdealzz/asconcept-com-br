import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Mail, Phone, User, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { travarRolagem, destravarRolagem } from "@/lib/smooth-scroll";

/**
 * AuthModal — entrar / criar conta / recuperar senha.
 *
 * Mora no __root junto com a sacola: openAuth() é chamado de qualquer rota
 * (finalizar compra, aplicar cupom, ver pedidos), então o modal precisa
 * existir em todas elas.
 *
 * O painel é escuro nos dois temas (`asc-on-dark`): é uma superfície de
 * confiança, e o dourado sobre obsidiana é a assinatura da marca. Nenhuma regra
 * de autenticação vive aqui — só a apresentação.
 */

type Mode = "login" | "signup" | "forgot";

/** Campo com ícone à esquerda e contorno que acende no foco. */
function CampoAuth({
  icone,
  children,
  erro,
}: {
  icone: React.ReactNode;
  children: React.ReactNode;
  erro?: boolean;
}) {
  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border bg-asc-ink/[0.04] px-4 transition-all duration-asc ease-asc focus-within:bg-asc-ink/[0.07] ${
        erro
          ? "border-destructive/70"
          : "border-asc-line focus-within:border-asc-gold focus-within:shadow-[0_0_0_3px_rgba(197,160,89,0.14)]"
      }`}
    >
      <span className="text-asc-ink-muted transition-colors duration-asc ease-asc group-focus-within:text-asc-gold">
        {icone}
      </span>
      {children}
    </div>
  );
}

const entradaCls =
  "w-full bg-transparent py-3.5 text-sm text-asc-ink outline-none placeholder:text-asc-ink-muted/60";

const rotuloCls = "mb-1.5 block text-[10px] tracking-luxe uppercase text-asc-ink-inverse-muted";

/**
 * Cortina + painel do modal.
 *
 * Precisa morar FORA do componente. Declarada dentro, ela virava um tipo de
 * componente novo a cada render — e o React, vendo tipo diferente, desmontava e
 * remontava tudo por baixo: o campo perdia o foco a cada tecla digitada.
 */
function MolduraModal({
  onClose,
  rotulo,
  children,
}: {
  onClose: () => void;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[80] animate-in bg-black/75 fade-in backdrop-blur-md duration-300"
      />
      <div className="pointer-events-none fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={rotulo}
          className="asc-on-dark pointer-events-auto relative max-h-[95svh] w-full max-w-md animate-in overflow-y-auto rounded-t-3xl border border-asc-line bg-[#0D0F12] p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] fade-in slide-in-from-bottom-4 duration-300 sm:rounded-3xl sm:p-9 sm:zoom-in-95 sm:slide-in-from-bottom-0"
        >
          {/* Fio dourado no topo — a mesma assinatura das seções escuras. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-asc-gold/70 to-transparent"
          />
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 rounded-full p-1.5 text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:bg-asc-ink/10 hover:text-asc-gold"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {children}
        </div>
      </div>
    </>
  );
}

export function AuthModal() {
  const { isOpen, closeAuth, signIn, signUp, resetPassword, user } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
      setShowPassword(false);
      setShowConfirm(false);
    }
  }, [isOpen]);

  // Esc fecha, e a página atrás para de rolar enquanto o modal está aberto.
  useEffect(() => {
    if (!isOpen) return;
    travarRolagem();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAuth();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      destravarRolagem();
    };
  }, [isOpen, closeAuth]);

  if (!isOpen) return null;

  const switchMode = (m: Mode) => {
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
      <MolduraModal onClose={closeAuth} rotulo="Conta criada">
        <p className="asc-label text-[10px] text-asc-gold">Conta criada</p>
        <h2 className="mt-2 font-serif text-3xl text-asc-ink">Confirme seu e-mail</h2>
        <p className="mt-4 text-sm font-light leading-relaxed text-asc-ink-inverse-muted">
          Enviamos um e-mail de confirmação para{" "}
          <span className="text-asc-ink">{signedUpEmail}</span>. Verifique sua caixa de entrada (e o
          spam) e confirme para acessar sua conta.
        </p>
        <button onClick={closeAuth} className="asc-btn-gold mt-8 w-full py-4">
          Entendi
        </button>
      </MolduraModal>
    );
  }

  const eyebrow =
    mode === "login" ? "Bem-vindo de volta" : mode === "signup" ? "Nova conta" : "Esqueci a senha";
  const title =
    mode === "login" ? "Entrar" : mode === "signup" ? "Criar Conta" : "Recuperar acesso";

  return (
    <MolduraModal onClose={closeAuth} rotulo={mode === "signup" ? "Criar conta" : "Entrar"}>
      <p className="asc-label text-[10px] text-asc-gold">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-3xl text-asc-ink">{title}</h2>

      {/* Abas: o indicador desliza entre as duas, e o conteúdo troca com um
          fade curto — a transição é o que faz parecer um painel só. */}
      {mode !== "forgot" && (
        <div className="relative mt-6 grid grid-cols-2 rounded-full border border-asc-line bg-asc-ink/[0.04] p-1">
          <span
            aria-hidden
            className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-asc-gold transition-transform duration-asc ease-asc"
            style={{ transform: mode === "signup" ? "translateX(calc(100% + 0.5rem))" : "none" }}
          />
          {(
            [
              { id: "login", label: "Entrar" },
              { id: "signup", label: "Criar conta" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchMode(t.id)}
              aria-pressed={mode === t.id}
              className={`relative z-10 rounded-full py-2 text-[11px] font-medium tracking-luxe uppercase transition-colors duration-asc ease-asc ${
                mode === t.id ? "text-asc-bg" : "text-asc-ink-inverse-muted hover:text-asc-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <p className="mt-5 text-sm font-light text-asc-ink-inverse-muted">
        {mode === "login"
          ? "Acesse sua conta para finalizar a compra."
          : mode === "signup"
            ? "Registre-se e ganhe 10% OFF na primeira compra."
            : "Digite o e-mail cadastrado para receber o link."}
      </p>

      <form
        onSubmit={onSubmit}
        key={mode}
        className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        {mode === "signup" && (
          <>
            <div>
              <label className={rotuloCls} htmlFor="auth-nome">
                Nome completo
              </label>
              <CampoAuth icone={<User className="h-4 w-4" strokeWidth={1.5} />}>
                <input
                  id="auth-nome"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Como devemos chamá-lo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={entradaCls}
                />
              </CampoAuth>
            </div>
            <div>
              <label className={rotuloCls} htmlFor="auth-tel">
                Celular (WhatsApp)
              </label>
              <CampoAuth icone={<Phone className="h-4 w-4" strokeWidth={1.5} />}>
                <input
                  id="auth-tel"
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
                  className={entradaCls}
                />
              </CampoAuth>
              <p className="mt-1.5 text-[10px] font-light text-asc-ink-inverse-muted/70">
                Usaremos apenas para contato do ateliê sobre seus pedidos.
              </p>
            </div>
          </>
        )}

        <div>
          <label className={rotuloCls} htmlFor="auth-email">
            E-mail
          </label>
          <CampoAuth icone={<Mail className="h-4 w-4" strokeWidth={1.5} />}>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={entradaCls}
            />
          </CampoAuth>
        </div>

        {mode !== "forgot" && (
          <div>
            <div className="flex items-center justify-between">
              <label className={rotuloCls} htmlFor="auth-senha">
                Senha
              </label>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="mb-1.5 text-[10px] tracking-luxe uppercase text-asc-gold underline-offset-4 hover:underline"
                >
                  Esqueceu a senha?
                </button>
              )}
            </div>
            <CampoAuth icone={<Lock className="h-4 w-4" strokeWidth={1.5} />}>
              <input
                id="auth-senha"
                type={showPassword ? "text" : "password"}
                required
                minLength={mode === "signup" ? 6 : 4}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "signup" ? "Mínimo de 6 caracteres" : "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={entradaCls}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="shrink-0 rounded-full p-1 text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-gold"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <Eye className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
            </CampoAuth>
          </div>
        )}

        {mode === "signup" && (
          <div>
            <label className={rotuloCls} htmlFor="auth-senha2">
              Confirmar senha
            </label>
            <CampoAuth
              icone={<Lock className="h-4 w-4" strokeWidth={1.5} />}
              erro={passwordsMismatch}
            >
              <input
                id="auth-senha2"
                type={showConfirm ? "text" : "password"}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={entradaCls}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Ocultar senha" : "Mostrar senha"}
                className="shrink-0 rounded-full p-1 text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-gold"
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <Eye className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
            </CampoAuth>
            {passwordsMismatch && (
              <p className="mt-1.5 text-[11px] text-destructive">As senhas não coincidem.</p>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-lg border border-asc-gold/40 bg-asc-gold/10 px-3 py-2 text-xs text-asc-gold-soft">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || passwordsMismatch}
          className="asc-btn-gold mt-2 w-full py-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Aguarde…"
            : mode === "login"
              ? "Entrar"
              : mode === "signup"
                ? "Criar Conta"
                : "Enviar link de recuperação"}
        </button>
      </form>

      {mode === "forgot" && (
        <div className="mt-6 text-center text-xs font-light text-asc-ink-inverse-muted">
          Lembrou a senha?{" "}
          <button
            onClick={() => switchMode("login")}
            className="text-asc-ink underline underline-offset-4 hover:text-asc-gold"
          >
            Voltar ao login
          </button>
        </div>
      )}
    </MolduraModal>
  );
}
