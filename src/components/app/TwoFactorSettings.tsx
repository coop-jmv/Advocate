import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tag } from "@/components/app/primitives";
import { confirmDestructive } from "@/lib/confirm";
import { cleanCode, clearUnverifiedFactors, verifiedTotpFactor, verifyTotpCode } from "@/lib/mfa";

type Enrolment = { factorId: string; qrCode: string; secret: string };

/**
 * Profile section for authenticator-app two-factor login.
 * `required` is set for platform admins, for whom 2FA is mandatory.
 */
export function TwoFactorSettings({ required = false }: { required?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [factor, setFactor] = useState<{ id: string; createdAt: string } | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    setFactor(await verifiedTotpFactor());
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function startSetup() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await clearUnverifiedFactors();
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
      });
      if (enrollError) throw enrollError;
      setEnrolment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start two-factor setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(event: React.FormEvent) {
    event.preventDefault();
    if (!enrolment) return;
    setBusy(true);
    setError(null);
    try {
      await verifyTotpCode(enrolment.factorId, cleanCode(code));
      setEnrolment(null);
      setCode("");
      setNotice("Two-factor login is on. You'll be asked for a code each time you sign in.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify that code.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSetup() {
    if (enrolment) await supabase.auth.mfa.unenroll({ factorId: enrolment.factorId });
    setEnrolment(null);
    setCode("");
    setError(null);
  }

  async function turnOff() {
    if (!factor) return;
    if (
      !confirmDestructive(
        required
          ? "Turn off two-factor login? As a platform admin you will lose access to the admin console until you set it up again."
          : "Turn off two-factor login? Your account will be protected by your password alone.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) throw unenrollError;
      setNotice("Two-factor login is off.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not turn off two-factor login.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-panel rounded p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <KeyRound className="size-4" />
        Two-factor login
        {!loading ? <Tag tone={factor ? "success" : "neutral"}>{factor ? "On" : "Off"}</Tag> : null}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Protects your account with a 6-digit code from an authenticator app (Google Authenticator,
        Microsoft Authenticator, Authy…) as well as your password, so a leaked password alone can't
        open your chamber's files.
        {required ? (
          <strong className="text-foreground">
            {" "}
            Required for platform admins — the admin console stays locked until it's on.
          </strong>
        ) : null}
      </p>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking…
        </p>
      ) : factor ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            On since{" "}
            {new Date(factor.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}.
          </p>
          <button
            type="button"
            onClick={() => void turnOff()}
            disabled={busy}
            className="rounded border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            Turn off
          </button>
        </div>
      ) : enrolment ? (
        <form onSubmit={confirmSetup} className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr]">
          <img
            src={enrolment.qrCode}
            alt="QR code to add LexDiary to your authenticator app"
            width={176}
            height={176}
            className="rounded border border-border bg-white p-2"
          />
          <div className="space-y-3 text-sm">
            <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
              <li>Open your authenticator app and scan this QR code.</li>
              <li>
                Can't scan? Enter this key instead:{" "}
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs break-all text-foreground">
                  {enrolment.secret}
                </code>
              </li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <input
              value={code}
              onChange={(event) => setCode(cleanCode(event.target.value))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              aria-label="6-digit code"
              className="w-40 rounded border border-input bg-background px-3 py-2 font-mono text-lg tracking-widest"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="flex items-center gap-2 rounded bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Turn on
              </button>
              <button
                type="button"
                onClick={() => void cancelSetup()}
                disabled={busy}
                className="rounded border border-input px-4 py-2 hover:bg-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => void startSetup()}
          disabled={busy}
          className="mt-4 flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Set up two-factor login
        </button>
      )}

      {notice ? <p className="mt-3 text-sm text-success">{notice}</p> : null}
      {error ? (
        <p className="mt-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
