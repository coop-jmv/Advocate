import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound, Loader2, Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cleanCode, verifyTotpCode } from "@/lib/mfa";

/**
 * Second sign-in step for accounts with two-factor login on. Shown after the
 * password is accepted; entering the code upgrades the session to aal2, which
 * is what the database requires before it returns any data.
 */
export function MfaChallengeScreen({
  factorId,
  onVerified,
}: {
  factorId: string;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyTotpCode(factorId, cleanCode(code));
      onVerified();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify that code.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </span>
          <span className="font-display text-base font-bold">LexDiary</span>
        </Link>
        <form onSubmit={handleSubmit} className="surface-panel rounded p-6">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold">
            <KeyRound className="size-5" /> Two-factor login
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app.
          </p>
          <input
            value={code}
            onChange={(event) => setCode(cleanCode(event.target.value))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            aria-label="6-digit code"
            className="mt-5 w-full rounded border border-input bg-background px-3 py-2.5 text-center font-mono text-2xl tracking-[0.4em]"
          />
          {error ? (
            <p className="mt-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Verify
          </button>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Lost your phone? Contact lexdiary.online@gmail.com to have two-factor login reset.
          </p>
          <button
            type="button"
            onClick={() => void switchAccount()}
            className="mt-2 w-full text-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Use a different account
          </button>
        </form>
      </div>
    </main>
  );
}
