import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Scale, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/edge-functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Wakilio" },
      {
        name: "description",
        content:
          "Sign in to your chamber workspace to manage matters, court diary, documents and AI drafting for your practice.",
      },
      { property: "og:title", content: "Sign in — Wakilio" },
      {
        property: "og:description",
        content: "Secure sign-in for Indian advocates using Wakilio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) void navigate({ to: "/app" });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { full_name: fullName, firm_name: firmName },
          },
        });
        if (signUpError) throw signUpError;
        void logAuthEvent({ event: "signup", email, userId: signUpData.user?.id });
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          void navigate({ to: "/app" });
          return;
        }
        setNotice("Check your inbox to confirm the email address, then sign in.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      void navigate({ to: "/app" });
    } catch (cause) {
      if (mode === "signin") void logAuthEvent({ event: "login_failed", email });
      setError(cause instanceof Error ? cause.message : "Could not complete that request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (oauthError) {
      void logAuthEvent({ event: "login_failed", email: "(google oauth)" });
      setError(oauthError.message);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </span>
          <span className="font-display text-base font-bold">Wakilio</span>
        </Link>

        <div className="surface-panel rounded p-6">
          <h1 className="font-display text-xl font-bold">
            {mode === "signin" ? "Sign in to your chamber" : "Create your chamber account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your matters, diary, documents and AI drafts stay private to your login.
          </p>

          <button
            type="button"
            onClick={handleGoogle}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded border border-input px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
          >
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use email
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" ? (
              <>
                <label className="block text-sm">
                  <span className="text-eyebrow">Advocate name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Adv. Priya Nair"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-eyebrow">Chamber / firm</span>
                  <input
                    value={firmName}
                    onChange={(event) => setFirmName(event.target.value)}
                    className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Nair & Associates"
                  />
                </label>
              </>
            ) : null}
            <label className="block text-sm">
              <span className="text-eyebrow">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-eyebrow">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            {error ? (
              <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="rounded border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to Wakilio?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
