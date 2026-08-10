import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/Wordmark";
import { PasswordStrength } from "@/components/PasswordStrength";
import { PASSWORD_MIN_LENGTH, isStrongPassword } from "@/lib/password-strength";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Nova senha — A&S Conccept" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const forte = isStrongPassword(password);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("type=recovery") || hash.includes("access_token=")) {
      setReady(true);
    } else {
      // Also accept authed session (Supabase already exchanged token)
      supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Mesma régua do cadastro: não faz sentido exigir senha forte para criar a
    // conta e aceitar qualquer coisa na recuperação.
    if (!forte) return setError("A senha precisa cumprir todos os requisitos abaixo.");
    if (password !== confirm) return setError("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    setSaved(true);
    setTimeout(() => navigate({ to: "/" }), 1600);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Voltar
          </Link>
          <Wordmark className="font-serif text-xl tracking-widest" />
          <span className="w-16" />
        </div>
      </header>
      <main className="mx-auto max-w-md px-6 py-16">
        <p className="text-[11px] tracking-luxe uppercase text-accent">Recuperação de acesso</p>
        <h1 className="mt-2 font-serif text-3xl">Definir nova senha</h1>
        {!ready ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Link inválido ou expirado. Solicite novamente em “Esqueci a senha”.
          </p>
        ) : saved ? (
          <p className="mt-6 text-sm text-accent">Senha atualizada. Redirecionando…</p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Nova senha
              </span>
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent"
              />
              <PasswordStrength value={password} />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-luxe uppercase text-muted-foreground">
                Confirmar nova senha
              </span>
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full border-b border-foreground/30 bg-transparent py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading || !forte}
              className="w-full asc-btn-primary py-4 text-[11px] tracking-luxe uppercase disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
