import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";

export const Route = createFileRoute("/unsubscribe")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cancelar inscrição · A&S Conccept" },
      {
        name: "description",
        content: "Cancele o recebimento de comunicações por e-mail da A&S Conccept em um clique.",
      },
      { property: "og:title", content: "Cancelar inscrição · A&S Conccept" },
      {
        property: "og:description",
        content: "Gerencie suas preferências de e-mail da A&S Conccept.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnsubscribePage,
});

type State = "loading" | "valid" | "invalid" | "already" | "done" | "error";

function UnsubscribePage() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) {
      setState("invalid");
      return;
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) return setState("invalid");
        if (body.valid) return setState("valid");
        if (body.reason === "already_unsubscribed") return setState("already");
        setState("invalid");
      })
      .catch(() => setState("error"));
  }, []);

  const confirm = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await r.json().catch(() => ({}));
      if (body.success) setState("done");
      else if (body.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-24">
      <section className="w-full max-w-md text-center">
        <Wordmark className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground" />
        <h1 className="mt-6 font-serif text-3xl text-foreground">Preferências de e-mail</h1>

        <div className="mt-8 text-sm text-muted-foreground leading-relaxed">
          {state === "loading" && <p>Verificando seu link…</p>}
          {state === "valid" && (
            <p>Confirme abaixo para deixar de receber nossas comunicações por e-mail.</p>
          )}
          {state === "already" && <p>Este endereço já foi removido da nossa lista de envios.</p>}
          {state === "done" && <p>Pronto. Você não receberá mais e-mails da A&amp;S Conccept.</p>}
          {state === "invalid" && (
            <p>Link inválido ou expirado. Solicite um novo link de cancelamento.</p>
          )}
          {state === "error" && (
            <p>Não foi possível concluir agora. Tente novamente em instantes.</p>
          )}
        </div>

        {state === "valid" && (
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="mt-10 w-full border border-foreground/20 bg-foreground text-background text-[11px] tracking-[0.2em] uppercase py-4 disabled:opacity-60"
          >
            {busy ? "Processando…" : "Confirmar cancelamento"}
          </button>
        )}

        <a
          href="/"
          className="mt-8 inline-block text-[11px] tracking-[0.2em] uppercase text-muted-foreground underline underline-offset-4"
        >
          Voltar à loja
        </a>
      </section>
    </main>
  );
}
