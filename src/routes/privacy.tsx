import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site/SiteChrome";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy notice — Wakilio" },
      {
        name: "description",
        content: "How Wakilio collects, uses and protects personal data under the DPDP Act, 2023.",
      },
    ],
  }),
  component: Privacy,
});

const NOTICE_VERSION = "2026-08-20";

function Privacy() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-eyebrow text-accent">Legal</p>
        <h1 className="mt-4 text-4xl font-bold">Privacy notice</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Notice version {NOTICE_VERSION}. This notice is given under Section 5 of the Digital
          Personal Data Protection Act, 2023 ("DPDP Act").
        </p>

        <div className="prose-body mt-10 space-y-8 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="font-display text-lg font-bold">Who this notice covers</h2>
            <p className="mt-2 text-muted-foreground">
              Two kinds of personal data pass through Wakilio, and they are treated differently:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Your account data</strong> — your name, email,
                firm name and enrolment number. Wakilio is the data fiduciary for this, and this
                notice describes what we do with it.
              </li>
              <li>
                <strong className="text-foreground">Client and matter data</strong> — anything you
                enter about your own clients, opposing parties or witnesses. Your chamber is the
                data fiduciary for that data; Wakilio processes it on your chamber's instructions,
                as a data processor. Your chamber's own privacy practices govern that data, and you
                should have your own notice for your clients.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">What we collect, and why</h2>
            <div className="mt-3 overflow-x-auto rounded border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-3 py-2">Name, email, firm name, enrolment number</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      Providing your account and the service
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Matter, client and document text you enter</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      Storing your practice records; sent to our AI provider only when you use OCR,
                      drafting or dictation
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Sign-in and audit events</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      Security, and showing your chamber who changed what
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Consent</h2>
            <p className="mt-2 text-muted-foreground">
              Creating an account records your consent to this notice. Consent to AI-assisted
              features (OCR, drafting, dictation) can be withdrawn at any time from{" "}
              <Link to="/app/profile" className="underline">
                Profile &amp; privacy
              </Link>{" "}
              without closing your account — those features simply become unavailable. Consent to
              providing the service itself cannot be withdrawn while your account is open, since
              there is no service to provide without it; delete your account instead.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Your rights</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Access</strong> — download everything held about
                you from Profile &amp; privacy.
              </li>
              <li>
                <strong className="text-foreground">Correction</strong> — edit your name, firm and
                enrolment number yourself at any time.
              </li>
              <li>
                <strong className="text-foreground">Erasure</strong> — delete your account from
                Profile &amp; privacy. This is a real, permanent deletion, not a deactivation.
              </li>
              <li>
                <strong className="text-foreground">Withdraw consent</strong> — for AI processing,
                as above.
              </li>
              <li>
                <strong className="text-foreground">Nominate</strong> — to nominate another
                individual to exercise these rights on your behalf (Section 14), contact the
                grievance officer below.
              </li>
              <li>
                <strong className="text-foreground">Grievance redressal</strong> — raise a complaint
                with the grievance officer below; if unresolved, you may approach the Data
                Protection Board of India.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Retention</h2>
            <p className="mt-2 text-muted-foreground">
              Account and matter data is retained while your account is open. A trial account left
              inactive for more than 90 days after the trial ends, and a cancelled subscription left
              inactive for more than 180 days, becomes eligible for deletion.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Security &amp; storage</h2>
            <p className="mt-2 text-muted-foreground">
              Data is stored in India (Mumbai region). Access is isolated per chamber at the
              database level, so one firm's records are never visible to another. All connections
              are encrypted in transit; passwords are never stored in plain text.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Data breach</h2>
            <p className="mt-2 text-muted-foreground">
              In the event of a personal data breach, affected data principals and the Data
              Protection Board of India will be notified as required under Section 8(6) of the DPDP
              Act.
            </p>
          </section>

          <section className="rounded border border-border bg-secondary/40 p-5">
            <h2 className="font-display text-lg font-bold">Grievance officer</h2>
            <p className="mt-2 text-muted-foreground">
              For any question about this notice, or to exercise a right above, contact:
            </p>
            <p className="mt-3 font-medium">grievance@wakilio.in</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We aim to respond within 7 days, per Section 13 of the DPDP Act.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
