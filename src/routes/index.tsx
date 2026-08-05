import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Scale,
  CalendarClock,
  FileSearch,
  Users,
  ReceiptIndianRupee,
  WifiOff,
  ArrowRight,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site/SiteChrome";
import heroImage from "@/assets/hero-advocate.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Advocate Companion — Court Diary, Cases & Billing for Advocates" },
      {
        name: "description",
        content:
          "A mobile-first practice management workspace for Indian advocates: CNR-linked cases, cause-list diary, OCR document vault, client portal and GST invoicing.",
      },
      {
        property: "og:title",
        content: "Advocate Companion — Court Diary, Cases & Billing for Advocates",
      },
      {
        property: "og:description",
        content:
          "CNR-linked cases, cause-list diary, OCR document vault, client portal and GST invoicing — built for Indian legal practice.",
      },
    ],
  }),
  component: Landing,
});

const capabilities = [
  {
    icon: Scale,
    title: "Case & matter management",
    body: "Link a matter by CNR and pull case status, party details, orders and hearing history from e-Courts data. Conflict checks run before a new matter is opened.",
  },
  {
    icon: CalendarClock,
    title: "Court diary with cause lists",
    body: "Day, week and month views with conflict detection. Reminders for hearings and limitation periods reach you on push, SMS or WhatsApp.",
  },
  {
    icon: FileSearch,
    title: "Documents with Indic OCR",
    body: "Scan with your phone camera, run OCR in English and Hindi, search inside PDFs, and redact privileged content before you share or export.",
  },
  {
    icon: Users,
    title: "Clients and secure portal",
    body: "Client profiles, intake forms and a permission-controlled portal where clients see status and approved documents — and message you securely.",
  },
  {
    icon: ReceiptIndianRupee,
    title: "Time tracking and GST billing",
    body: "Timer or manual entries against matters, expense logging, and GST-compliant invoices with UPI and Razorpay collection.",
  },
  {
    icon: WifiOff,
    title: "Built for court corridors",
    body: "Offline-first diary and case notes on Android, syncing when you get signal. Every action is quick enough to finish before your item is called.",
  },
];

const stats = [
  { value: "3,700+", label: "District & subordinate court complexes" },
  { value: "25", label: "High Courts and benches covered" },
  { value: "9", label: "Interface languages on the roadmap" },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="border-b border-border bg-brief text-primary-foreground">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
            <div>
              <p className="text-eyebrow text-primary-foreground/70">Practice management · India</p>
              <h1 className="mt-5 text-4xl leading-[1.1] font-bold sm:text-5xl">
                Your entire practice, ready before your item is called.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-primary-foreground/80">
                Advocate Companion keeps matters, cause lists, documents, clients and billing in one
                workspace built for how litigation actually runs in Indian courts — on the phone in
                your pocket.
              </p>
              <div className="mt-9">
                <Link
                  to="/app"
                  className="inline-flex items-center gap-2 rounded border border-primary-foreground/25 bg-background px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  Explore the workspace
                  <ArrowRight className="size-4" />
                </Link>
              </div>

              <dl className="mt-14 grid gap-6 border-t border-primary-foreground/15 pt-8 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="font-display text-2xl font-bold">{stat.value}</dt>
                    <dd className="mt-1 text-xs leading-snug text-primary-foreground/70">
                      {stat.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <img
              src={heroImage}
              alt="Advocate in court robes checking case details on a phone in a high court corridor"
              width={1408}
              height={1008}
              className="w-full rounded shadow-lift"
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <p className="text-eyebrow text-accent">What it covers</p>
            <h2 className="mt-4 text-3xl font-bold">Every part of a matter, in one file</h2>
            <p className="mt-4 text-muted-foreground">
              Six modules that map to the working day of a solo advocate or a small firm — not a
              generic CRM with a court field bolted on.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((item) => (
              <article key={item.title} className="bg-card p-7">
                <item.icon className="size-5 text-accent" />
                <h3 className="mt-5 font-display text-lg font-bold">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-secondary/60">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <p className="text-eyebrow text-accent">Compliance by design</p>
                <h2 className="mt-4 text-3xl font-bold">Privileged data, treated as privileged</h2>
              </div>
              <ul className="space-y-6">
                {[
                  {
                    head: "DPDP Act, 2023 aligned",
                    body: "Consent records, self-service access and erasure requests, and a breach-notification workflow with statutory timelines.",
                  },
                  {
                    head: "Firm-level isolation",
                    body: "Each firm's data is isolated at the schema level, so per-firm export and deletion is clean and auditable.",
                  },
                  {
                    head: "Audit trail on every record",
                    body: "Who opened a matter, who downloaded a document, who changed a hearing outcome — retained and searchable.",
                  },
                  {
                    head: "Bar Council ethics respected",
                    body: "No client solicitation features, no public advertising of results, and confidentiality controls on client-facing sharing.",
                  },
                ].map((item) => (
                  <li key={item.head} className="border-l-2 border-accent pl-5">
                    <h3 className="font-display text-base font-bold">{item.head}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="surface-panel flex flex-col gap-6 rounded p-10 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">See the workspace with sample matters</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A working prototype of the dashboard, diary, case file, documents and billing
                screens.
              </p>
            </div>
            <Link
              to="/app"
              className="inline-flex shrink-0 items-center gap-2 rounded bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
            >
              Open the workspace
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
