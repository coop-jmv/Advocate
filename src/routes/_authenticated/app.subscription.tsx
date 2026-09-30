import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { SettingsTabs } from "@/components/app/SettingsTabs";
import { supabase } from "@/integrations/supabase/client";
import { getEntitlements, getMyMembership } from "@/lib/team.functions";
import { DocketStripe, PriceBreakdown, SeatStepper } from "@/components/app/premium-ui";
import {
  PREMIUM_MAX_SEATS,
  PREMIUM_SEAT_PRICE_INR,
  cancelPremium,
  changePremiumSeats,
  inr,
  premiumQuote,
  startPremiumCheckout,
} from "@/lib/premium";

export const Route = createFileRoute("/_authenticated/app/subscription")({
  head: () => ({ meta: [{ title: "Subscription — LexDiary" }] }),
  // ?seats=N preselects the seat count, e.g. from the seats chosen at signup.
  validateSearch: (search: Record<string, unknown>): { seats?: number } => {
    const seats = Number(search["seats"]);
    return Number.isInteger(seats) && seats >= 1 && seats <= PREMIUM_MAX_SEATS ? { seats } : {};
  },
  component: Subscription,
});

const BILLING_EMAIL = "lexdiary.online@gmail.com";
const SUPPORT_PHONE = "+91 70100 61822";

const planLabel: Record<string, string> = {
  free: "Free",
  trial: "Trial",
  solo_basic: "Solo Basic",
  solo_pro: "Solo Pro",
  chamber: "Chamber",
  premium: "Premium",
};

const PREMIUM_INCLUDES = [
  "Unlimited matters and clients",
  "Team seats — add colleagues, each with their own login",
  "AI case analysis: 100 requests a day and 1,500 a month per user",
  "Court diary with daily cause-list matching",
];

type Entitlements = {
  plan: string;
  status: string;
  seats: number;
  seats_used: number;
  trial_days_left: number | null;
  billing_cadence: string | null;
  current_period_end: string | null;
  subscription_expired: boolean;
  subscription_grace_days_left: number | null;
  razorpay_subscription_status: string | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Subscription() {
  const { seats: requestedSeats } = Route.useSearch();
  const loadEntitlements = useServerFn(getEntitlements);
  const loadMe = useServerFn(getMyMembership);

  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ name?: string | undefined; email?: string | undefined }>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [seats, setSeats] = useState(requestedSeats ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  async function reload() {
    const [ent, me] = await Promise.all([loadEntitlements(), loadMe()]);
    const next = ent as Entitlements | null;
    setEntitlements(next);
    setRole((me as { tenant_role: string } | null)?.tenant_role ?? null);
    if (next) {
      setSeats((current) =>
        next.plan === "premium" ? next.seats : Math.max(current, next.seats_used, 1),
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      if (!cancelled) {
        setPrefill({
          name: typeof meta["full_name"] === "string" ? meta["full_name"] : undefined,
          email: data.user?.email ?? undefined,
        });
      }
      // A Premium choice made at signup is a one-time prompt: once it has
      // brought them here, don't send them back on every sign-in.
      if (meta["plan_intent"]) {
        void supabase.auth.updateUser({ data: { plan_intent: null, premium_seats: null } });
      }
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // loadEntitlements/loadMe are re-created every render; listing them would re-fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canManage = role === "owner" || role === "admin";
  const isPremium = entitlements?.plan === "premium";
  const cancelScheduled = entitlements?.razorpay_subscription_status === "cancel_scheduled";
  const pastDue = isPremium && entitlements?.status === "past_due";

  const inGrace =
    entitlements &&
    !isPremium &&
    !entitlements.subscription_expired &&
    entitlements.plan !== "trial" &&
    entitlements.plan !== "free" &&
    entitlements.subscription_grace_days_left !== null &&
    entitlements.current_period_end !== null &&
    new Date(entitlements.current_period_end) <= new Date();

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      await reload();
      if (message) setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const handleUpgrade = () =>
    run(async () => {
      const outcome = await startPremiumCheckout(seats, prefill);
      if (outcome === "paid") return "Payment received — your chamber is on Premium.";
      if (outcome === "processing")
        return "Payment received. Razorpay is confirming it — Premium switches on within a few minutes.";
      return null;
    });

  const handleSeatChange = () =>
    run(async () => {
      const { effective } = await changePremiumSeats(seats);
      return effective === "now"
        ? `Your chamber now has ${seats} seats.`
        : `Your chamber goes down to ${seats} seats at the next renewal.`;
    });

  const handleCancel = () =>
    run(async () => {
      await cancelPremium();
      setConfirmingCancel(false);
      return "Premium will end at the close of this billing period.";
    });

  return (
    <AppShell title="Subscription" subtitle="Your plan and billing">
      <SettingsTabs />

      {error ? (
        <p className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your plan…
        </p>
      ) : !entitlements ? null : isPremium ? (
        <section className="surface-panel max-w-2xl overflow-hidden rounded">
          <DocketStripe />
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-docket-emerald/15 px-3 py-1 text-xs font-semibold">
                {cancelScheduled ? "PREMIUM — ENDING" : "PREMIUM ACTIVE"}
              </span>
              <Check aria-hidden="true" className="size-5 text-docket-emerald" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold">
              You're on Premium — {entitlements.seats} {entitlements.seats === 1 ? "seat" : "seats"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {inr(premiumQuote(entitlements.seats).total)} a month including GST, billed through
              Razorpay.
              {entitlements.current_period_end
                ? cancelScheduled
                  ? ` Ends on ${formatDate(entitlements.current_period_end)}, after which your chamber moves to the Free plan.`
                  : ` Renews on ${formatDate(entitlements.current_period_end)}.`
                : ""}
            </p>
            {pastDue ? (
              <p className="mt-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                The last renewal payment didn't go through. Razorpay will retry it automatically —
                check the card or UPI mandate you paid with.
              </p>
            ) : null}

            {canManage &&
            !cancelScheduled &&
            entitlements.razorpay_subscription_status === "active" ? (
              <>
                <div className="mt-6 rounded border border-border bg-background p-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <span className="text-eyebrow block">Change seats</span>
                      <div className="mt-1.5">
                        <SeatStepper
                          value={seats}
                          onChange={setSeats}
                          min={Math.max(entitlements.seats_used, 1)}
                          disabled={busy}
                          label="seats"
                        />
                      </div>
                    </div>
                    <span className="text-right text-xs text-muted-foreground">
                      {seats > entitlements.seats
                        ? "Added straight away"
                        : seats < entitlements.seats
                          ? "From your next renewal"
                          : `${entitlements.seats_used} of ${entitlements.seats} in use`}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busy || seats === entitlements.seats}
                    onClick={() => void handleSeatChange()}
                    className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {seats === entitlements.seats
                      ? "Choose a different number of seats"
                      : `Update to ${seats} ${seats === 1 ? "seat" : "seats"} — ${inr(premiumQuote(seats).total)}/month`}
                  </button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Seats in use can't be removed — remove a member or revoke an invite first.
                  </p>
                </div>

                <div className="mt-6 border-t border-border pt-5">
                  {!confirmingCancel ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingCancel(true)}
                      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-destructive disabled:opacity-60"
                    >
                      Cancel Premium
                    </button>
                  ) : (
                    <div
                      role="alertdialog"
                      aria-labelledby="cancel-premium-title"
                      className="rounded border border-destructive/40 bg-destructive/5 p-4"
                    >
                      <p id="cancel-premium-title" className="text-sm font-semibold">
                        Cancel at the end of this billing period?
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Premium stays on until{" "}
                        {entitlements.current_period_end
                          ? formatDate(entitlements.current_period_end)
                          : "the end of this period"}
                        . After that your chamber moves to the Free plan — nothing is deleted.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleCancel()}
                          className="flex items-center gap-2 rounded bg-destructive px-3 py-1.5 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                          Confirm cancellation
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmingCancel(false)}
                          className="rounded border border-input px-3 py-1.5 text-sm font-medium hover:bg-secondary"
                        >
                          Keep Premium
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          {entitlements.subscription_expired ? (
            <div className="surface-panel mb-6 rounded border-l-4 border-destructive p-5">
              <h2 className="font-display text-base font-bold">Your subscription has lapsed</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Your data is safe and still readable — you just can't add anything new until you
                upgrade below.
              </p>
            </div>
          ) : inGrace ? (
            <div className="surface-panel mb-6 rounded border-l-4 border-warning p-5">
              <h2 className="font-display text-base font-bold">
                Renewal due — {entitlements.subscription_grace_days_left} day
                {entitlements.subscription_grace_days_left === 1 ? "" : "s"} left before your
                chamber goes read-only
              </h2>
            </div>
          ) : (
            <div className="surface-panel mb-6 rounded border-l-4 border-accent p-5">
              <h2 className="font-display text-base font-bold">
                You're on the {planLabel[entitlements.plan] ?? entitlements.plan} plan
                {entitlements.plan === "free" ? " — free forever" : ""}
              </h2>
              {entitlements.plan === "free" ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  One advocate login, up to 25 matters and 25 clients, the court diary with
                  cause-list matching, and AI case analysis (5 AI requests a day).
                </p>
              ) : entitlements.plan === "trial" ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {entitlements.trial_days_left ?? 0} day
                  {entitlements.trial_days_left === 1 ? "" : "s"} left on your trial. Everything is
                  unlocked until then; afterwards you move to the Free plan automatically.
                </p>
              ) : null}
            </div>
          )}

          <section className="surface-panel max-w-2xl overflow-hidden rounded">
            <DocketStripe />
            <div className="p-5 sm:p-6">
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                {(planLabel[entitlements.plan] ?? entitlements.plan).toUpperCase()} CHAMBER
              </span>
              <h3 className="mt-4 font-display text-2xl font-bold">Upgrade to Premium</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {inr(PREMIUM_SEAT_PRICE_INR)} per user per month, plus GST. Cancel any time.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {PREMIUM_INCLUDES.map((line) => (
                  <li key={line} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-docket-emerald" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              {canManage ? (
                <>
                  <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <span className="text-eyebrow block">Users</span>
                      <div className="mt-1.5">
                        <SeatStepper
                          value={seats}
                          onChange={setSeats}
                          min={Math.max(entitlements.seats_used, 1)}
                          disabled={busy}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-semibold">
                      {inr(PREMIUM_SEAT_PRICE_INR)} / user / month
                    </span>
                  </div>
                  <div className="mt-4">
                    <PriceBreakdown seats={seats} />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleUpgrade()}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CreditCard className="size-4" />
                    )}
                    Pay {inr(premiumQuote(seats).total)} with Razorpay
                  </button>
                  <p className="mt-2.5 text-center text-xs text-muted-foreground">
                    Renews monthly. Pay by card or UPI; Razorpay emails your invoice.
                  </p>
                </>
              ) : (
                <p className="mt-6 text-sm text-muted-foreground">
                  Ask your chamber owner or an admin to upgrade the chamber to Premium.
                </p>
              )}

              <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                Documents & OCR, time tracking & billing, AI drafting, WhatsApp reminders and
                e-Courts lookups are add-ons — write to {BILLING_EMAIL} to add them.
              </p>
            </div>
          </section>
        </>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Questions about billing? Email{" "}
        <a href={`mailto:${BILLING_EMAIL}`} className="underline">
          {BILLING_EMAIL}
        </a>{" "}
        or call/WhatsApp{" "}
        <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`} className="underline">
          {SUPPORT_PHONE}
        </a>
        .
      </p>
    </AppShell>
  );
}
