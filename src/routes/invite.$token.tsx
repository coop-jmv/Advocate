import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Scale, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/edge-functions";
import { FieldError, invalidClass, MobileInput, Req } from "@/components/app/form-fields";
import { passwordLengthError, MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { cn } from "@/lib/utils";
import {
  collectErrors,
  hasErrors,
  joinName,
  LIMITS,
  mobileError,
  namePartError,
  toE164Mobile,
  type FieldErrors,
} from "@/lib/validation";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "You're invited — LexDiary" }] }),
  component: InvitePage,
});

// tenant_name/email/role are only populated while the invite is still usable:
// get_invite_info() nulls them out once it has been accepted, revoked or
// expired, so a forwarded link stops disclosing who was invited to which
// chamber. Only the `valid: false` branch below renders without them.
type InviteInfo = {
  tenant_name: string | null;
  email: string | null;
  role: string | null;
  valid: boolean;
};

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    FieldErrors<"firstName" | "lastName" | "phone" | "password" | "privacy">
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc("get_invite_info", { p_token: token }).then(({ data, error: rpcError }) => {
      if (rpcError || !data || data.length === 0) {
        setLoadError("This invite link isn't valid.");
        return;
      }
      setInfo(data[0] as InviteInfo);
    });
  }, [token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // The form only renders on the valid branch, where get_invite_info() has
    // populated email — this narrows that for the compiler too.
    if (!info?.valid || !info.email) return;
    const errors = collectErrors({
      firstName: namePartError(firstName, "First name"),
      lastName: namePartError(lastName, "Surname"),
      phone: mobileError(phone),
      password: passwordLengthError(password),
      privacy: agreedToPrivacy ? null : "Please confirm you have read the privacy notice.",
    });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: info.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
          data: {
            full_name: joinName(firstName, lastName),
            phone: toE164Mobile(phone),
            invite_token: token,
          },
        },
      });
      if (signUpError) throw signUpError;
      void logAuthEvent({ event: "signup", email: info.email, userId: signUpData.user?.id });

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        void navigate({ to: "/app" });
        return;
      }
      setNotice(
        "Check your inbox to confirm the email address, then sign in — you'll land in your chamber's account.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not accept this invite. If you already have an account, sign in normally instead.",
      );
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
          {loadError ? (
            <>
              <h1 className="font-display text-xl font-bold">Invite not valid</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {loadError} It may have expired or already been used — ask whoever invited you to
                send a new one.
              </p>
              <Link to="/auth" className="mt-4 inline-block text-sm text-primary hover:underline">
                Go to sign in
              </Link>
            </>
          ) : !info ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking your invite…
            </p>
          ) : !info.valid ? (
            <>
              <h1 className="font-display text-xl font-bold">This invite has expired</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask whoever invited you to send a new invite.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl font-bold">Join {info.tenant_name}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                You've been invited as a {info.role} for <strong>{info.email}</strong>.
              </p>

              <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-eyebrow">
                      First name
                      <Req />
                    </span>
                    <input
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      required
                      maxLength={LIMITS.namePart}
                      autoComplete="given-name"
                      aria-invalid={fieldErrors.firstName ? true : undefined}
                      className={cn(
                        "mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm",
                        invalidClass(fieldErrors.firstName),
                      )}
                      placeholder="Priya"
                    />
                    <FieldError message={fieldErrors.firstName} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-eyebrow">
                      Surname
                      <Req />
                    </span>
                    <input
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      required
                      maxLength={LIMITS.namePart}
                      autoComplete="family-name"
                      aria-invalid={fieldErrors.lastName ? true : undefined}
                      className={cn(
                        "mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm",
                        invalidClass(fieldErrors.lastName),
                      )}
                      placeholder="Nair"
                    />
                    <FieldError message={fieldErrors.lastName} />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="text-eyebrow">
                    Mobile number
                    <Req />
                  </span>
                  <MobileInput
                    value={phone}
                    onChange={setPhone}
                    error={fieldErrors.phone}
                    className="mt-1.5"
                  />
                  <FieldError message={fieldErrors.phone} />
                </label>
                <label className="block text-sm">
                  <span className="text-eyebrow">
                    Set a password
                    <Req />
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={72}
                    autoComplete="new-password"
                    aria-invalid={fieldErrors.password ? true : undefined}
                    className={cn(
                      "mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm",
                      invalidClass(fieldErrors.password),
                    )}
                  />
                  <FieldError message={fieldErrors.password} />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    At least {MIN_PASSWORD_LENGTH} characters.
                  </span>
                </label>
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
                    <FieldError message={fieldErrors.privacy} />
                  </span>
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
                  Accept invite &amp; create account
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  to="/auth"
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
