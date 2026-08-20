import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Scale, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/edge-functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — LexDiary" },
      {
        name: "description",
        content:
          "Sign in to your chamber workspace to manage matters, court diary, documents and AI drafting for your practice.",
      },
      { property: "og:title", content: "Sign in — LexDiary" },
      {
        property: "og:description",
        content: "Secure sign-in for Indian advocates using LexDiary.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

// On a phone the sidebar collapses to a Menu button, so signing in lands on
// the launcher (every section as a tile) rather than straight into the
// dashboard. Wider screens keep the sidebar and go to the dashboard as before.
function landingRoute(): "/app" | "/app/menu" {
  if (typeof window === "undefined") return "/app";
  return window.matchMedia("(max-width: 767px)").matches ? "/app/menu" : "/app";
}

function AuthPage() {
  const navigate = useNavigate();
  // ?mode=signup lets the pricing and landing CTAs open registration directly
  // rather than dropping people on the sign-in form.
  const [mode, setMode] = useState<"signin" | "signup">(() => {
    if (typeof window === "undefined") return "signin";
    return new URLSearchParams(window.location.search).get("mode") === "signup"
      ? "signup"
      : "signin";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) void navigate({ to: landingRoute() });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "signup" && !agreedToPrivacy) {
      setError("Please confirm you have read the privacy notice before creating an account.");
      return;
    }
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
          void navigate({ to: landingRoute() });
          return;
        }
        setNotice("Check your inbox to confirm the email address, then sign in.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      void navigate({ to: landingRoute() });
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
          <span className="font-display text-base font-bold">LexDiary</span>
        </Link>

        <div className="surface-panel rounded p-6">
          <h1 className="font-display text-xl font-bold">
            {mode === "signin" ? "Sign in to your chamber" : "Start your 15-day free trial"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Your matters, diary, documents and AI drafts stay private to your login."
              : "Every feature included — OCR, WhatsApp, drafting and a 3-seat chamber. No card required."}
          </p>

          {mode === "signup" ? (
            <ul className="mt-4 space-y-1.5 rounded border border-accent/30 bg-accent/10 p-3 text-sm">
              {[
                "All features unlocked for 15 days",
                "No card, no payment details, nothing to cancel",
                "Invite up to 2 teammates and try roles and seats",
                "When it ends your data stays readable and exportable",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}

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

            {mode === "signup" ? (
              <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={agreedToPrivacy}
                  onChange={(event) => setAgreedToPrivacy(event.target.checked)}
                  required
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  I have read and agree to the{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline"
                  >
                    privacy notice
                  </a>
                  , including how my account data is used and my rights under the DPDP Act.
                </span>
              </label>
            ) : null}

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
              disabled={busy || (mode === "signup" && !agreedToPrivacy)}
              className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to LexDiary?" : "Already have an account?"}{" "}
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
