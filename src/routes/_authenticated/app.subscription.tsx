import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { SettingsTabs } from "@/components/app/SettingsTabs";
import { getEntitlements } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/app/subscription")({
  head: () => ({ meta: [{ title: "Subscription — LexDiary" }] }),
  component: Subscription,
});

const BILLING_EMAIL = "lexdiary.online@gmail.com";
const SUPPORT_PHONE = "+91 70100 61822";

// Fixed-tier pricing (Solo Basic/Pro, Chamber) is being replaced by
// per-module pricing — a chamber pays for what it actually uses (e.g. just
// Documents + Clients), not a bundle. No public numbers to show here until
// that's finalized, so this page is a contact point rather than a price
// list for now. The underlying plan/module machinery (my_entitlements(),
// activateSubscription, /admin/settings/integrations) is unaffected — only
// this display is hidden.
const planLabel: Record<string, string> = {
  free: "Free",
  trial: "Trial",
  solo_basic: "Solo Basic",
  solo_pro: "Solo Pro",
  chamber: "Chamber",
};

type Entitlements = {
  plan: string;
  status: string;
  trial_days_left: number | null;
  monthly_total_inr: number;
  billing_cadence: string | null;
  current_period_end: string | null;
  subscription_expired: boolean;
  subscription_grace_days_left: number | null;
};

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

  const inGrace =
    entitlements &&
    !entitlements.subscription_expired &&
    entitlements.plan !== "trial" &&
    entitlements.plan !== "free" &&
    entitlements.subscription_grace_days_left !== null &&
    entitlements.current_period_end !== null &&
    new Date(entitlements.current_period_end) <= new Date();

  return (
    <AppShell title="Subscription" subtitle="Choose a plan to keep adding to your chamber">
      <SettingsTabs />
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your plan…
        </p>
      ) : entitlements?.subscription_expired ? (
        <div className="surface-panel rounded border-l-4 border-destructive p-5">
          <h2 className="font-display text-base font-bold">Your subscription has lapsed</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your data is safe and still readable — you just can't add anything new until you renew
            below. Already paid? Email us the reference and we'll reactivate your chamber.
          </p>
        </div>
      ) : inGrace ? (
        <div className="surface-panel rounded border-l-4 border-warning p-5">
          <h2 className="font-display text-base font-bold">
            Renewal due — {entitlements!.subscription_grace_days_left} day
            {entitlements!.subscription_grace_days_left === 1 ? "" : "s"} left before your chamber
            goes read-only
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your subscription period ended on{" "}
            {new Date(entitlements!.current_period_end!).toLocaleDateString("en-IN")}. Renew below
            to avoid any interruption.
          </p>
        </div>
      ) : entitlements && entitlements.plan === "trial" ? (
        <div className="surface-panel rounded border-l-4 border-accent p-5">
          <h2 className="font-display text-base font-bold">
            {entitlements.trial_days_left ?? 0} day
            {entitlements.trial_days_left === 1 ? "" : "s"} left on your free trial
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Everything is unlocked during the trial. When it ends you move to the Free plan
            automatically — nothing is locked or lost — and can add paid modules any time.
          </p>
        </div>
      ) : entitlements && entitlements.plan === "free" ? (
        <div className="surface-panel rounded border-l-4 border-accent p-5">
          <h2 className="font-display text-base font-bold">
            You're on the Free plan — free forever
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            One advocate login, up to 25 matters and 25 clients, the court diary with cause-list
            matching, and AI case analysis (5 AI requests a day). e-Courts lookups, documents and
            OCR, billing, AI drafting, WhatsApp and team seats are paid add-ons — contact us below
            to add them.
          </p>
        </div>
      ) : entitlements ? (
        <div className="surface-panel rounded border-l-4 border-primary p-5">
          <h2 className="font-display text-base font-bold">
            You're on the {planLabel[entitlements.plan] ?? entitlements.plan} plan
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Billed {entitlements.billing_cadence ?? "monthly"}
            {entitlements.current_period_end
              ? `, active through ${new Date(entitlements.current_period_end).toLocaleDateString("en-IN")}`
              : ""}
            . Want to change what's included? Contact us below.
          </p>
        </div>
      ) : null}

      <div className="surface-panel mt-6 rounded p-7">
        <h3 className="font-display text-lg font-bold">Pricing, tailored to what you use</h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          We're moving to per-module pricing — you pay for the parts of LexDiary your chamber
          actually uses (say, just Documents and Clients) rather than a fixed bundle. Tell us what
          you need and we'll quote it directly.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={`mailto:${BILLING_EMAIL}`}
            className="inline-flex items-center gap-2 rounded bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
          >
            Email {BILLING_EMAIL}
          </a>
          <a
            href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
            className="inline-flex items-center gap-2 rounded border border-input px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
          >
            Call or WhatsApp {SUPPORT_PHONE}
          </a>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Already agreed a plan with us? Pay via the Razorpay link we send you, mention your chamber
          name and whether it's monthly or annual, and we'll activate it — usually within a business
          day.
        </p>
      </div>
    </AppShell>
  );
}
