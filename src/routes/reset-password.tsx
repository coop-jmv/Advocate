import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Scale, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MIN_PASSWORD_LENGTH, passwordLengthError } from "@/lib/password-policy";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Reset password — LexDiary" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPasswordPage,
});

// Landing here from the recovery email link, the Supabase client (detectSessionInUrl
// is on by default) parses the recovery token in the URL and fires PASSWORD_RECOVERY
// once it has established a temporary session — only then is updateUser() valid.
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) setReady(true);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Those passwords don't match.");
      return;
    }
    const lengthError = passwordLengthError(password);
    if (lengthError) {
      setError(lengthError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset the password.");
    } finally {
      setBusy(false);
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
          {done ? (
            <>
              <h1 className="font-display text-xl font-bold">Password updated</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Your password has been reset. You're signed in — continue to your chamber.
              </p>
              <button
                type="button"
                onClick={() => void navigate({ to: "/app" })}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
              >
                Go to your chamber
              </button>
            </>
          ) : !ready ? (
            <>
              <h1 className="font-display text-xl font-bold">Reset link required</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Open this page from the reset-password link in your email. If the link has expired,
                request a new one from the sign-in page.
              </p>
              <Link
                to="/auth"
                className="mt-5 block w-full rounded border border-input px-4 py-2.5 text-center text-sm font-semibold transition-colors hover:bg-secondary"
              >
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl font-bold">Set a new password</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Choose a new password for your account.
              </p>
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <label className="block text-sm">
                  <span className="text-eyebrow">New password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    At least {MIN_PASSWORD_LENGTH} characters.
                  </span>
                </label>
                <label className="block text-sm">
                  <span className="text-eyebrow">Confirm password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>

                {error ? (
                  <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Update password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
