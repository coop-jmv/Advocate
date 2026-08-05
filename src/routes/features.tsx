import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site/SiteChrome";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — Advocate Companion" },
      {
        name: "description",
        content:
          "Module-by-module detail: CNR case linking, cause-list diary, Indic OCR document vault, client portal, GST billing, offline court mode and audit logs.",
      },
      { property: "og:title", content: "Features — Advocate Companion" },
      {
        property: "og:description",
        content:
          "CNR case linking, cause-list diary, Indic OCR, client portal, GST billing, offline court mode and audit logs.",
      },
    ],
  }),
  component: Features,
});

const modules = [
  {
    id: "FR-1",
    name: "Authentication & onboarding",
    points: [
      "Register with mobile number or email, verified by OTP",
      "Optional Bar Council enrolment number for advocate verification",
      "Roles for Advocate, Junior, Clerk, Client and Firm Admin",
      "Step-up multi-factor authentication on sensitive actions",
    ],
  },
  {
    id: "FR-2",
    name: "Case & matter management",
    points: [
      "Create matters manually or link by 16-character CNR",
      "Case status, orders and hearing history from e-Courts data providers",
      "Stage tracking, party details and opposing counsel records",
      "Conflict-of-interest check before a matter is opened",
    ],
  },
  {
    id: "FR-3",
    name: "Document management",
    points: [
      "Camera scanning with auto-crop, plus bulk upload",
      "OCR in English and Hindi, expanding to more Indic scripts",
      "Full-text search across stored documents",
      "Redaction of personal identifiers and privileged clauses before sharing",
    ],
  },
  {
    id: "FR-4",
    name: "Court diary & calendar",
    points: [
      "Diary synchronised with cause lists where available",
      "Reminders on push, SMS and WhatsApp for hearings and limitation periods",
      "Mark appearances, adjournments and outcomes in one tap",
      "Day, week and month views with conflict detection",
    ],
  },
  {
    id: "FR-5",
    name: "Clients & portal",
    points: [
      "Client profiles with contact details and related matters",
      "Permission-controlled portal for case status and documents",
      "Intake forms and lead capture",
      "Secure advocate–client messaging",
    ],
  },
  {
    id: "FR-6",
    name: "Time tracking & billing",
    points: [
      "Billable time by timer or manual entry against a matter",
      "Expense logging linked to matters",
      "GST-compliant invoices with CGST/SGST/IGST handling",
      "Collection through UPI and Razorpay",
    ],
  },
  {
    id: "FR-9",
    name: "Security & audit",
    points: [
      "Encryption in transit and at rest, Indian cloud regions",
      "Audit log of access, downloads and record changes",
      "Annual independent penetration testing with remediation SLAs",
      "99.5% monthly uptime target, RPO 24h, RTO 4h",
    ],
  },
  {
    id: "FR-10",
    name: "Data protection (DPDP)",
    points: [
      "Self-service access, correction and erasure for data principals",
      "Consent capture and withdrawal logging",
      "Breach-notification workflow to data principals and the Data Protection Board",
      "Per-firm data export and deletion",
    ],
  },
];

function Features() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-eyebrow text-accent">Functional scope</p>
        <h1 className="mt-4 text-4xl font-bold">What Advocate Companion does</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          The modules below follow the requirement set for the first two release phases. Full
          e-filing submission, large-firm litigation analytics and full accounting sit outside this
          scope.
        </p>

        <div className="mt-14 space-y-px overflow-hidden rounded border border-border bg-border">
          {modules.map((mod) => (
            <section key={mod.id} className="bg-card p-7 sm:p-8">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="rounded bg-secondary px-2 py-1 font-mono text-xs font-semibold text-accent">
                  {mod.id}
                </span>
                <h2 className="font-display text-xl font-bold">{mod.name}</h2>
              </div>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {mod.points.map((point) => (
                  <li
                    key={point}
                    className="border-l border-border pl-4 text-sm leading-relaxed text-muted-foreground"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
