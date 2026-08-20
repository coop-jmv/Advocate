import { createFileRoute, Link } from "@tanstack/react-router";
import {
  UserPlus,
  Scale,
  FileSearch,
  CalendarClock,
  Users,
  ReceiptIndianRupee,
  ShieldCheck,
  Lock,
  ArrowRight,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site/SiteChrome";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — LexDiary" },
      {
        name: "description",
        content:
          "What each part of LexDiary replaces: the paper register, the WhatsApp status update, the month-end billing scramble. See the manual work it removes, module by module.",
      },
      { property: "og:title", content: "Features — LexDiary" },
      {
        property: "og:description",
        content:
          "Case & matter management, hearing diary, Indic OCR, client portal, GST billing and audit logs — and the manual work each one removes.",
      },
    ],
  }),
  component: Features,
});

const modules = [
  {
    icon: UserPlus,
    name: "Getting your chamber set up",
    manual:
      "Everyone shares one login, or you're tracking who has access in a WhatsApp message you'll never find again.",
    automatic:
      "Each teammate gets their own login and a role — Advocate, Junior, Clerk or Client — with a Bar Council enrolment number on the profile. Step-up verification kicks in for sensitive actions.",
  },
  {
    icon: Scale,
    name: "Tracking a matter",
    manual: "A paper case diary or a spreadsheet, updated whenever someone remembers to.",
    automatic:
      "Case number, court, stage, party details, opposing counsel and case notes stay in one file, current the moment anything changes. e-Courts (CNR) linking and automated conflict checks are on the roadmap.",
  },
  {
    icon: FileSearch,
    name: "Filing and finding documents",
    manual:
      'Scanning to a folder named "final_v2", then re-reading the whole thing later to find one clause.',
    automatic:
      "Camera scanning with auto-crop, OCR in English and Hindi, and full-text search across everything stored — so a clause is a search, not a re-read. Redact privileged content before you share.",
  },
  {
    icon: CalendarClock,
    name: "Keeping the diary",
    manual: "Cross-checking a cause list by hand to make sure you haven't double-booked a hearing.",
    automatic:
      "Day, week and month views flag a listing conflict before it happens. WhatsApp is licensed on Solo Pro and Chamber; automated sending, and cause-list sync, are on the roadmap.",
  },
  {
    icon: Users,
    name: 'Answering "what\'s the status of my case?"',
    manual:
      "A phone call or a WhatsApp message, every time — often more than once a week, per client.",
    automatic:
      "Clients check status and approved documents themselves in a permission-controlled portal, and message you securely when they actually need to.",
  },
  {
    icon: ReceiptIndianRupee,
    name: "Billing a client",
    manual:
      "Reconstructing hours from memory at month-end, then working out the CGST/SGST split by hand.",
    automatic:
      "Time logs by timer or manual entry against a matter, expenses attached automatically, and a GST-compliant invoice generated with UPI and Razorpay collection built in.",
  },
  {
    icon: ShieldCheck,
    name: "Knowing who touched what",
    manual:
      "No real record — if a document goes missing or a hearing outcome changes, it's someone's word.",
    automatic:
      "Every access, download and change is logged and searchable, with annual independent penetration testing and a 99.5% uptime target.",
  },
  {
    icon: Lock,
    name: "Handling a data-rights request",
    manual:
      "Manually pulling someone's data together across systems whenever they ask — and hoping you got all of it.",
    automatic:
      "Self-service access, correction and erasure for the person asking, consent capture and withdrawal logged automatically, and a documented breach-notification commitment under the DPDP Act.",
  },
];

function Features() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-eyebrow text-accent">What it replaces</p>
        <h1 className="mt-4 text-4xl font-bold">The manual work LexDiary takes off your plate</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Every module below follows the same shape: what you're doing by hand today, and what
          happens instead once it's in LexDiary. Full e-filing submission, large-firm litigation
          analytics and full accounting sit outside this scope.
        </p>

        <div className="mt-14 space-y-5">
          {modules.map((mod) => (
            <section
              key={mod.name}
              className="overflow-hidden rounded border border-border bg-card"
            >
              <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-6 py-4 sm:px-8">
                <mod.icon className="size-5 shrink-0 text-accent" />
                <h2 className="font-display text-lg font-bold">{mod.name}</h2>
              </div>
              <div className="grid sm:grid-cols-2">
                <div className="border-b border-border p-6 sm:border-r sm:border-b-0 sm:p-8">
                  <p className="text-eyebrow text-muted-foreground">Today, by hand</p>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                    {mod.manual}
                  </p>
                </div>
                <div className="bg-accent/10 p-6 sm:p-8">
                  <p className="text-eyebrow text-accent">With LexDiary</p>
                  <p className="mt-2.5 text-sm leading-relaxed text-foreground">{mod.automatic}</p>
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="surface-panel mt-14 flex flex-col gap-6 rounded p-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">See it against your own week</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Every feature above is unlocked for 15 days, no card required — the fastest way to
              know is to run one real matter through it.
            </p>
          </div>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex shrink-0 items-center gap-2 rounded bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
          >
            Start free trial
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
