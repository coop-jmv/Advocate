import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { getEntitlements } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/app/subscription")({
  head: () => ({ meta: [{ title: "Subscription — LexDiary" }] }),
  component: Subscription,
});

const RAZORPAY_LINK = "https://razorpay.me/@lexdiary";
const BILLING_EMAIL = "chambers@lexdiary.online";
const GST_RATE = 0.18;

type Entitlements = {
  plan: string;
  status: string;
  trial_days_left: number | null;
  trial_expired: boolean;
  monthly_total_inr: number;
};

const plans = [
  {
    id: "solo_basic",
    name: "Solo Basic",
    basePrice: 499,
    summary: "One advocate, the full matter and diary workflow.",
    features: [
      "Up to 50 matters and 50 clients",
      "Court diary with hearing reminders",
      "Time tracking and GST invoicing",
      "AI drafting assistant — 40 requests a day",
    ],
  },
  {
    id: "solo_pro",
    name: "Solo Pro",
    basePrice: 799,
    summary: "Adds document intake and client messaging automation.",
    features: [
      "Everything in Solo Basic",
      "Indic OCR document intake",
      "Up to 200 matters and 200 clients",
      "AI drafting assistant — 150 requests a day",
    ],
    featured: true,
  },
  {
    id: "chamber",
    name: "Chamber",
    basePrice: 999,
    summary: "For a chamber with juniors and a clerk — 2 seats included.",
    features: [
      "Everything in Solo Pro",
      "Two users included, ₹499 per extra seat",
      "Roles for owners, admins, juniors and clerks",
      "Unlimited matters and clients",
    ],
  },
];

function rupees(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function withGst(basePrice: number): { gst: number; total: number } {
  const gst = Math.round(basePrice * GST_RATE);
  return { gst, total: basePrice + gst };
}

function Subscription() {
  const loadEntitlements = useServerFn(getEntitlements);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadEntitlements().then((data) => {
      if (!cancelled) {
        setEntitlements(data as Entitlements | null);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // loadEntitlements is re-created every render; listing it would re-fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Subscription" subtitle="Choose a plan to keep adding to your chamber">
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your plan…
        </p>
      ) : entitlements?.trial_expired ? (
        <div className="surface-panel rounded border-l-4 border-destructive p-5">
          <h2 className="font-display text-base font-bold">Your free trial has ended</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your matters, diary, documents and clients are all still here and fully readable — you
            just can't add anything new until you pick a plan below.
          </p>
        </div>
      ) : entitlements && entitlements.plan === "trial" ? (
        <div className="surface-panel rounded border-l-4 border-accent p-5">
          <h2 className="font-display text-base font-bold">
            {entitlements.trial_days_left ?? 0} day
            {entitlements.trial_days_left === 1 ? "" : "s"} left on your free trial
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Everything is unlocked during the trial. Pick a plan any time to keep it that way once
            the trial ends.
          </p>
        </div>
      ) : entitlements ? (
        <div className="surface-panel rounded border-l-4 border-primary p-5">
          <h2 className="font-display text-base font-bold">
            You're on the {plans.find((p) => p.id === entitlements.plan)?.name ?? entitlements.plan}{" "}
            plan
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {rupees(entitlements.monthly_total_inr)} +{" "}
            {rupees(withGst(entitlements.monthly_total_inr).gst)} GST ={" "}
            {rupees(withGst(entitlements.monthly_total_inr).total)} / month. Need a different plan
            or more seats? Pay via Razorpay below, then email us the reference so we can update your
            chamber.
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const { gst, total } = withGst(plan.basePrice);
          return (
            <article
              key={plan.id}
              className={
                plan.featured
                  ? "rounded border-2 border-primary bg-card p-7 shadow-lift"
                  : "surface-panel rounded p-7"
              }
            >
              <h3 className="font-display text-lg font-bold">{plan.name}</h3>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold">{rupees(plan.basePrice)}</span>
                <span className="text-xs text-muted-foreground">per month</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                + {rupees(gst)} GST (18%) = <span className="font-medium">{rupees(total)}</span> to
                pay
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.summary}</p>
              <ul className="mt-5 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <a
                href={RAZORPAY_LINK}
                target="_blank"
                rel="noreferrer"
                className={
                  plan.featured
                    ? "mt-6 flex items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
                    : "mt-6 flex items-center justify-center gap-2 rounded border border-input px-4 py-2.5 text-center text-sm font-semibold transition-colors hover:bg-secondary"
                }
              >
                Pay via Razorpay
                <ExternalLink className="size-3.5" />
              </a>
            </article>
          );
        })}
      </div>

      <div className="surface-panel mt-8 rounded p-6 text-sm text-muted-foreground">
        <h3 className="font-display text-base font-bold text-foreground">After you pay</h3>
        <p className="mt-2 leading-relaxed">
          Payment isn't linked to your account automatically yet — after paying on Razorpay, email{" "}
          <a
            href={`mailto:${BILLING_EMAIL}`}
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {BILLING_EMAIL}
          </a>{" "}
          with your chamber name and the payment reference, and we'll activate your plan, usually
          within a business day.
        </p>
      </div>
    </AppShell>
  );
}
