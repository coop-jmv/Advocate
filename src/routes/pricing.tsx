import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site/SiteChrome";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Advocate Companion" },
      {
        name: "description",
        content:
          "Subscription plans for solo advocates, chambers and small law firms, billed per user per month in Indian rupees with GST invoices.",
      },
      { property: "og:title", content: "Pricing — Advocate Companion" },
      {
        property: "og:description",
        content:
          "Plans for solo advocates, chambers and small firms — per user, per month, in rupees.",
      },
    ],
  }),
  component: Pricing,
});

const plans = [
  {
    name: "Diary",
    price: "₹399",
    cadence: "per advocate / month",
    summary: "For solo practitioners who mainly need the court diary in hand.",
    features: [
      "Up to 50 active matters",
      "CNR case-status lookup",
      "Court diary with hearing reminders",
      "2 GB document storage",
      "English and Hindi interface",
    ],
  },
  {
    name: "Chamber",
    price: "₹899",
    cadence: "per user / month",
    summary: "For a chamber with juniors and a clerk — the full matter file, OCR and billing.",
    features: [
      "Unlimited matters and clients",
      "Indic OCR and in-document search",
      "Roles for juniors and clerks",
      "Time tracking and GST invoicing",
      "WhatsApp and SMS reminders",
      "50 GB document storage",
    ],
    featured: true,
  },
  {
    name: "Firm",
    price: "₹1,699",
    cadence: "per user / month",
    summary: "For small-to-medium firms that need the client portal and audit controls.",
    features: [
      "Everything in Chamber",
      "Client portal and secure messaging",
      "Conflict-of-interest checks",
      "Audit log export and DPDP tooling",
      "Firm-level isolated data storage",
      "Priority support with 4-hour RTO",
    ],
  },
];

function Pricing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-eyebrow text-accent">Subscriptions</p>
        <h1 className="mt-4 text-4xl font-bold">Priced per seat, billed in rupees</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Every plan includes GST-compliant invoicing, Indian data residency and daily backups.
          Annual billing carries two months free.
        </p>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={
                plan.featured
                  ? "rounded border-2 border-primary bg-card p-8 shadow-lift"
                  : "surface-panel rounded p-8"
              }
            >
              <h2 className="font-display text-xl font-bold">{plan.name}</h2>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold">{plan.price}</span>
                <span className="text-xs text-muted-foreground">{plan.cadence}</span>
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{plan.summary}</p>
              <ul className="mt-7 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/contact"
                className={
                  plan.featured
                    ? "mt-8 block rounded bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
                    : "mt-8 block rounded border border-input px-4 py-2.5 text-center text-sm font-semibold transition-colors hover:bg-secondary"
                }
              >
                Request access
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Client portal users are never charged a seat. Storage beyond the plan limit is billed at
          ₹40 per 10 GB per month.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
