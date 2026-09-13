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

// Supabase redirects a failed recovery link back here with the reason in the URL
// (#error=access_denied&error_code=otp_expired&error_description=…). auth-js
// detects that during initialize() but only returns it internally: it emits no
// auth event and does not clear the hash, so without reading it ourselves the
// page could only say "Reset link required" — which tells someone holding a
// link from their inbox nothing about why it didn't work.
//
// The most common real cause is otp_expired on a link the person has never
// clicked: some mail providers and corporate link-scanners open every URL in an
// incoming email to check it, which spends the one-time token before a human
// ever sees it. Saying so is the difference between "try again" and "the reset
// feature is broken".
function recoveryLinkError(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  // PKCE-style redirects put the error in the query string instead.
  for (const [key, value] of new URLSearchParams(window.location.search)) {
    if (!params.has(key)) params.set(key, value);
  }
  const code = params.get("error_code");
  if (!code && !params.get("error") && !params.get("error_description")) return null;

  if (code === "otp_expired") {
    return "This reset link has expired or has already been used. Some email providers open links automatically to scan them, which uses the link up — request a new one and open it straight away.";
  }
  return "This reset link isn't valid. Request a new one from the sign-in page.";
}

// Landing here from the recovery email link, the Supabase client (detectSessionInUrl
// is on by default) parses the recovery token in the URL and fires PASSWORD_RECOVERY
// once it has established a temporary session — only then is updateUser() valid.
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // A failed link takes precedence over any session already in storage, so an
    // expired link is never masked by an unrelated earlier sign-in.
    const failure = recoveryLinkError();
    if (failure) {
      setLinkError(failure);
      return;
    }

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
          ) : linkError ? (
            <>
              <h1 className="font-display text-xl font-bold">This reset link didn't work</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{linkError}</p>
              <Link
                to="/auth"
                className="mt-5 block w-full rounded bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
              >
                Request a new link
              </Link>
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
