import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Scale, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/edge-functions";
import { MIN_PASSWORD_LENGTH, passwordLengthError } from "@/lib/password-policy";
import { cn } from "@/lib/utils";
import { needsMfaChallenge, verifiedTotpFactor } from "@/lib/mfa";
import { PREMIUM_MAX_SEATS, PREMIUM_SEAT_PRICE_INR, inr } from "@/lib/premium";
import {
  collectErrors,
  emailError,
  hasErrors,
  joinName,
  LIMITS,
  mobileError,
  namePartError,
  optionalText,
  toE164Mobile,
  type FieldErrors,
} from "@/lib/validation";
import {
  FieldError,
  FieldHint,
  FormErrorSummary,
  invalidClass,
  MobileInput,
  Req,
} from "@/components/app/form-fields";
import { PriceBreakdown, SeatStepper } from "@/components/app/premium-ui";
import { MfaChallengeScreen } from "@/components/app/MfaChallengeScreen";
import heroSignIn from "@/assets/hero-signin-courthouse.jpg";
import heroSignUp from "@/assets/hero-signup-signing.jpg";

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

type SignupField =
  "firstName" | "lastName" | "firmName" | "phone" | "email" | "password" | "privacy";

function AuthPage() {
  const navigate = useNavigate();
  // ?mode=signup lets the pricing and landing CTAs open registration directly
  // rather than dropping people on the sign-in form.
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(() => {
    if (typeof window === "undefined") return "signin";
    return new URLSearchParams(window.location.search).get("mode") === "signup"
      ? "signup"
      : "signin";
  });
  const heroCopy =
    mode === "signup"
      ? {
          image: heroSignUp,
          alt: "Close-up of a hand signing a document with a fountain pen",
          heading: "A disciplined practice, run from a single workspace.",
          body: "Matters, hearing diary, documents, clients and billing — brought together for how litigation is practised in Indian courts.",
        }
      : mode === "forgot"
        ? {
            image: heroSignIn,
            alt: "Colonnade inside a courthouse, columns receding toward a lit doorway",
            heading: "Back into your chamber in a moment.",
            body: "We'll email a reset link to the address on file so you're back to your matters and diary quickly.",
          }
        : {
            image: heroSignIn,
            alt: "Colonnade inside a courthouse, columns receding toward a lit doorway",
            heading: "Welcome back to your chamber.",
            body: "Sign in to pick up your matters, hearing diary, documents and billing right where you left off.",
          };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firmName, setFirmName] = useState("");
  // The 10 national digits; stored as +91XXXXXXXXXX.
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignupField>>({});
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  // ?plan=premium lets the pricing page open registration with Premium chosen.
  const [plan, setPlan] = useState<"free" | "premium">(() => {
    if (typeof window === "undefined") return "free";
    return new URLSearchParams(window.location.search).get("plan") === "premium"
      ? "premium"
      : "free";
  });
  const [premiumSeats, setPremiumSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] = useState(false);
  // Set when the password was accepted but the account has two-factor login on:
  // the session is only aal1, and the database refuses data until the code is in.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);

  // Where to go after sign-in. Only in-app paths are honoured (the /admin guard
  // sends admins here with ?next=/admin), so this can't become an open redirect.
  function destination(): "/app" | "/admin" {
    if (typeof window === "undefined") return "/app";
    return new URLSearchParams(window.location.search).get("next") === "/admin" ? "/admin" : "/app";
  }

  // After a password is accepted (or on arriving already signed in): ask for the
  // authenticator code if this account needs one, otherwise go straight in.
  async function continueSignedIn() {
    if (await needsMfaChallenge()) {
      const factor = await verifiedTotpFactor();
      if (factor) {
        setMfaFactorId(factor.id);
        return;
      }
    }
    void navigate({ to: destination() });
  }

  useEffect(() => {
    setFieldErrors({});
  }, [mode]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) void continueSignedIn();
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = collectErrors<SignupField>({
      firstName: mode === "signup" ? namePartError(firstName, "First name") : null,
      lastName: mode === "signup" ? namePartError(lastName, "Surname") : null,
      firmName:
        mode === "signup" ? optionalText(firmName, "Chamber / firm", LIMITS.shortText) : null,
      phone: mode === "signup" ? mobileError(phone) : null,
      email: emailError(email),
      password:
        mode === "forgot"
          ? null
          : mode === "signup"
            ? passwordLengthError(password)
            : password
              ? null
              : "Password is required.",
      privacy:
        mode === "signup" && !agreedToPrivacy
          ? "Please confirm you have read the privacy notice."
          : null,
    });
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      setError(null);
      return;
    }
    // A pasted address often carries a trailing space; send the clean one.
    const cleanEmail = email.trim();
    setBusy(true);
    setError(null);
    setNotice(null);
    setExistingAccount(false);
    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setNotice("If that email has an account, a reset link is on its way. Check your inbox.");
        return;
      }
      if (mode === "signup") {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: {
              full_name: joinName(firstName, lastName),
              firm_name: firmName.trim(),
              phone: toE164Mobile(phone),
              // Every account starts on Free; this sends the first sign-in to
              // checkout for these seats (see _authenticated/route.tsx).
              ...(plan === "premium"
                ? { plan_intent: "premium", premium_seats: premiumSeats }
                : {}),
            },
          },
        });
        if (signUpError) throw signUpError;
        // With email confirmation on, Supabase answers an already-registered
        // address with a user that has no identities instead of an error, and
        // sends nothing — so "check your inbox" would be a dead end.
        if (signUpData.user && signUpData.user.identities?.length === 0) {
          setExistingAccount(true);
          return;
        }
        void logAuthEvent({ event: "signup", email: cleanEmail, userId: signUpData.user?.id });
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          void navigate({ to: "/app" });
          return;
        }
        setNotice(
          plan === "premium"
            ? "Check your inbox to confirm the email address, then sign in — you'll go straight to payment for Premium."
            : "Check your inbox to confirm the email address, then sign in.",
        );
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (signInError) throw signInError;
      await continueSignedIn();
    } catch (cause) {
      // Without email confirmation, the same case arrives as an error instead.
      if (
        mode === "signup" &&
        cause instanceof Error &&
        (cause as Error & { code?: string }).code === "user_already_exists"
      ) {
        setExistingAccount(true);
        return;
      }
      if (mode === "signin") void logAuthEvent({ event: "login_failed", email: cleanEmail });
      // A network-level failure — sign-in service unreachable, DNS not resolving,
      // device offline — arrives as AuthRetryableFetchError carrying the browser's
      // own text ("Failed to fetch" in Chromium, "Load failed" in Safari), which
      // reads as if this button were broken. Matched on name rather than
      // instanceof: auth-js sets the name as a string literal in the constructor,
      // so it survives bundling and doesn't rely on supabase-js re-exporting it.
      setError(
        cause instanceof Error && cause.name === "AuthRetryableFetchError"
          ? "We can't reach the sign-in service right now. Check your connection and try again in a few minutes."
          : cause instanceof Error
            ? cause.message
            : "Could not complete that request.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (mfaFactorId) {
    return (
      <MfaChallengeScreen
        factorId={mfaFactorId}
        onVerified={() => void navigate({ to: destination() })}
      />
    );
  }

  return (
    <main className="grid h-screen overflow-hidden lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brief text-primary-foreground lg:flex lg:flex-col lg:p-8">
        <div className="absolute -top-16 -right-16 size-72 rounded-full bg-docket-amber/60 blur-3xl" />
        <div className="absolute -bottom-20 -left-16 size-80 rounded-full bg-docket-teal/50 blur-3xl" />

        <Link to="/" className="relative z-10 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded bg-primary-foreground/10 text-primary-foreground ring-1 ring-primary-foreground/20">
            <Scale className="size-4" />
          </span>
          <span className="font-display text-base font-bold">LexDiary</span>
        </Link>

        <div className="relative z-10 mt-6 flex min-h-0 flex-1 flex-col">
          <span className="text-eyebrow inline-flex items-center self-start rounded-full bg-docket-amber px-3 py-1 text-docket-amber-foreground">
            Practice management · India
          </span>
          <h2 className="mt-4 max-w-sm font-display text-3xl leading-tight font-bold">
            {heroCopy.heading}
          </h2>
          <p className="mt-3 max-w-sm text-sm text-primary-foreground/75">{heroCopy.body}</p>
          <img
            src={heroCopy.image}
            alt={heroCopy.alt}
            className="mt-4 w-full min-h-0 flex-1 rounded object-cover object-top shadow-lift"
          />
        </div>
      </div>

      <div className="flex h-screen items-center justify-center overflow-y-auto bg-secondary/40 px-4 py-2">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-2 flex items-center justify-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded bg-primary text-primary-foreground">
              <Scale className="size-4" />
            </span>
            <span className="font-display text-base font-bold">LexDiary</span>
          </Link>

          <div className="surface-panel relative overflow-hidden rounded p-4">
            <div className="absolute inset-x-0 top-0 flex h-1.5">
              <span className="flex-1 bg-docket-sapphire" />
              <span className="flex-1 bg-docket-amber" />
              <span className="flex-1 bg-docket-teal" />
              <span className="flex-1 bg-docket-rose" />
              <span className="flex-1 bg-docket-emerald" />
              <span className="flex-1 bg-docket-violet" />
            </div>
            <span
              className={cn(
                "text-eyebrow mt-2 inline-flex items-center rounded-full px-3 py-1",
                mode === "signin"
                  ? "bg-docket-sapphire text-docket-sapphire-foreground"
                  : mode === "signup"
                    ? "bg-docket-amber text-docket-amber-foreground"
                    : "bg-docket-teal text-docket-teal-foreground",
              )}
            >
              {mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? plan === "premium"
                    ? "Premium"
                    : "Free forever"
                  : "Reset password"}
            </span>
            <h1 className="mt-2 font-display text-xl font-bold">
              {mode === "signin"
                ? "Sign in to your chamber"
                : mode === "signup"
                  ? plan === "premium"
                    ? "Create your Premium chamber"
                    : "Create your free chamber"
                  : "Reset your password"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Your matters, diary, documents and AI drafts stay private to your login."
                : mode === "signup"
                  ? plan === "premium"
                    ? "Create your account first; you'll pay on Razorpay after confirming your email."
                    : "The Free plan never expires. Upgrade to Premium whenever you need more."
                  : "Enter the email on your account and we'll send you a link to set a new password."}
            </p>

            {mode === "signup" ? (
              <fieldset className="mt-3">
                <legend className="sr-only">Plan</legend>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: "free",
                        title: "Free",
                        price: "₹0, forever",
                        lines: [
                          "One advocate login",
                          "Up to 25 matters and clients",
                          "AI case analysis — 5 a day",
                        ],
                      },
                      {
                        value: "premium",
                        title: "Premium",
                        price: `${inr(PREMIUM_SEAT_PRICE_INR)}/user/month + GST`,
                        lines: [
                          "Just you, or your whole team",
                          "Unlimited matters and clients",
                          "AI case analysis — 100 a day",
                        ],
                      },
                    ] as const
                  ).map((option) => {
                    const selected = plan === option.value;
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "relative cursor-pointer rounded border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                          selected
                            ? "border-primary bg-secondary ring-1 ring-primary"
                            : "border-input bg-background hover:border-accent",
                        )}
                      >
                        <input
                          type="radio"
                          name="plan"
                          value={option.value}
                          checked={selected}
                          onChange={() => setPlan(option.value)}
                          className="sr-only"
                        />
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-display text-base font-bold">{option.title}</span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-0.5 size-4 shrink-0 rounded-full border",
                              selected ? "border-4 border-primary bg-background" : "border-input",
                            )}
                          />
                        </span>
                        <span className="mt-0.5 block text-xs font-semibold">{option.price}</span>
                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {option.lines.map((line) => (
                            <li key={line} className="flex gap-1.5">
                              <Check className="mt-0.5 size-3 shrink-0 text-docket-emerald" />
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </label>
                    );
                  })}
                </div>
                {plan === "premium" ? (
                  <div className="mt-2.5 space-y-2.5 rounded border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-eyebrow w-full">Users</span>
                      <SeatStepper value={premiumSeats} onChange={setPremiumSeats} />
                      <span className="text-xs text-muted-foreground">
                        Choose 1–{PREMIUM_MAX_SEATS}. You can change this later.
                      </span>
                    </div>
                    <PriceBreakdown seats={premiumSeats} compact />
                  </div>
                ) : null}
              </fieldset>
            ) : null}

            <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
              <FormErrorSummary
                show={mode === "signup" && hasErrors(fieldErrors)}
                message="We couldn't create your account. Review the highlighted details."
              />
              {mode === "signup" ? (
                <>
                  <div className="grid gap-2.5 sm:grid-cols-2">
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
                          "mt-1 h-10 w-full rounded border border-input bg-background px-3 text-sm",
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
                          "mt-1 h-10 w-full rounded border border-input bg-background px-3 text-sm",
                          invalidClass(fieldErrors.lastName),
                        )}
                        placeholder="Sharma"
                      />
                      <FieldError message={fieldErrors.lastName} />
                    </label>
                  </div>
                  <label className="block text-sm">
                    <span className="text-eyebrow">Chamber / firm</span>
                    <input
                      value={firmName}
                      onChange={(event) => setFirmName(event.target.value)}
                      maxLength={LIMITS.shortText}
                      className="mt-1 h-10 w-full rounded border border-input bg-background px-3 text-sm"
                      placeholder="Your chamber or firm name (optional)"
                    />
                    <FieldError message={fieldErrors.firmName} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-eyebrow">
                      Mobile number
                      <Req />
                    </span>
                    <MobileInput
                      value={phone}
                      onChange={setPhone}
                      error={fieldErrors.phone}
                      className="mt-1"
                    />
                    <FieldHint
                      hint="10-digit Indian mobile, used for hearing reminders."
                      error={fieldErrors.phone}
                    />
                  </label>
                </>
              ) : null}
              <label className="block text-sm">
                <span className="text-eyebrow">
                  Email
                  <Req />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={LIMITS.email}
                  autoComplete="email"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  className={cn(
                    "mt-1 h-10 w-full rounded border border-input bg-background px-3 text-sm",
                    invalidClass(fieldErrors.email),
                  )}
                />
                <FieldError message={fieldErrors.email} />
              </label>
              {mode !== "forgot" ? (
                <label className="block text-sm">
                  <span className="text-eyebrow">
                    Password
                    <Req />
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                    maxLength={72}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    aria-invalid={fieldErrors.password ? true : undefined}
                    className={cn(
                      "mt-1 h-10 w-full rounded border border-input bg-background px-3 text-sm",
                      invalidClass(fieldErrors.password),
                    )}
                  />
                  {mode === "signup" ? (
                    <FieldHint
                      hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                      error={fieldErrors.password}
                    />
                  ) : (
                    <FieldError message={fieldErrors.password} />
                  )}
                </label>
              ) : null}

              {mode === "signin" ? (
                <p className="-mt-2 text-right text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setMode("forgot");
                    }}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </button>
                </p>
              ) : null}

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
                    <FieldError message={fieldErrors.privacy} />
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
              {mode === "signup" && existingAccount ? (
                <div
                  role="status"
                  className="rounded border border-docket-amber/50 bg-docket-amber/10 px-3 py-2.5 text-sm"
                >
                  <p>
                    <span className="font-semibold">{email}</span> already has a LexDiary account.
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setExistingAccount(false);
                        setMode("signin");
                      }}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      Sign in instead
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExistingAccount(false);
                        setMode("forgot");
                      }}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      Reset password
                    </button>
                  </p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="flex h-10 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
              </button>
            </form>

            <p className="mt-2 text-center text-sm text-muted-foreground">
              {mode === "forgot" ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setMode("signin");
                  }}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Back to sign in
                </button>
              ) : (
                <>
                  {mode === "signin" ? "New to LexDiary?" : "Already have an account?"}{" "}
                  <button
                    type="button"
                    onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {mode === "signin" ? "Create an account" : "Sign in"}
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
