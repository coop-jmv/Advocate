import { createFileRoute, Link } from "@tanstack/react-router";
import { canonical } from "@/lib/seo";
import { SiteHeader, SiteFooter } from "@/components/site/SiteChrome";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy notice — LexDiary" },
      {
        name: "description",
        content: "How LexDiary collects, uses and protects personal data under the DPDP Act, 2023.",
      },
      canonical("/privacy").meta,
    ],
    links: [canonical("/privacy").link],
  }),
  component: Privacy,
});

const NOTICE_VERSION = "2026-10-03";

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
              Two kinds of personal data pass through LexDiary, and they are treated differently:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Your account data</strong> — your name, email,
                firm name and enrolment number. LexDiary is the data fiduciary for this, and this
                notice describes what we do with it.
              </li>
              <li>
                <strong className="text-foreground">Client and matter data</strong> — anything you
                enter about your own clients, opposing parties or witnesses. Your chamber is the
                data fiduciary for that data; LexDiary processes it on your chamber's instructions,
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
                    <td className="px-3 py-2">
                      Name, email, mobile number, firm name, enrolment number
                    </td>
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
                    <td className="px-3 py-2">
                      Name, email, mobile number, enrolment number and court, if you use the
                      "Request access" form without an account
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      Replying to your request and arranging onboarding
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">
                      Mobile number, if you opt in to WhatsApp reminders
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      Sending next-day hearing reminders to you
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
            <p className="mt-2 text-muted-foreground">
              Consent is recorded separately for four purposes: providing the service, AI
              processing, WhatsApp reminders and product updates. WhatsApp reminders and product
              updates are off until you switch them on, and every purpose can be withdrawn from the
              same screen. If this notice changes materially, its version changes and we will ask
              for your consent again.
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
            <h2 className="font-display text-lg font-bold">Who processes data for us</h2>
            <p className="mt-2 text-muted-foreground">
              We use the following processors. Each receives only what its purpose needs.
            </p>
            <div className="mt-3 overflow-x-auto rounded border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Processor</th>
                    <th className="px-3 py-2 font-semibold">Purpose</th>
                    <th className="px-3 py-2 font-semibold">Data received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-muted-foreground">
                  <tr>
                    <td className="px-3 py-2">Supabase (Mumbai)</td>
                    <td className="px-3 py-2">Database and sign-in</td>
                    <td className="px-3 py-2">All account and practice data</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Cloudflare</td>
                    <td className="px-3 py-2">Hosting and delivery</td>
                    <td className="px-3 py-2">Requests in transit</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">OpenAI</td>
                    <td className="px-3 py-2">OCR, drafting, dictation, case Q&amp;A</td>
                    <td className="px-3 py-2">
                      Text, images or audio you submit to an AI feature, only after you use it
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Gupshup (WhatsApp)</td>
                    <td className="px-3 py-2">Hearing reminders</td>
                    <td className="px-3 py-2">Your mobile number and hearing dates, if opted in</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Resend</td>
                    <td className="px-3 py-2">Transactional email</td>
                    <td className="px-3 py-2">Your email address and message content</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Razorpay</td>
                    <td className="px-3 py-2">Subscription payments</td>
                    <td className="px-3 py-2">Billing name, email and payment details</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-muted-foreground">
              <strong className="text-foreground">Transfer outside India.</strong> Your data is
              stored in India, but the AI provider processes what you send it outside India. This
              transfer is made under Section 16 of the DPDP Act and only when you use an AI feature.
              Withdrawing AI consent stops it immediately. Do not submit material to an AI feature
              if your professional duties forbid sharing it with a third-party processor.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Retention</h2>
            <p className="mt-2 text-muted-foreground">
              Account and matter data is retained while your account is open, including on the Free
              plan. A cancelled subscription left inactive for more than 180 days is deleted
              automatically. A chamber with no sign-in for 24 months is warned by email before it is
              deleted.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>WhatsApp delivery logs are deleted after 12 months.</li>
              <li>"Request access" submissions are deleted after 12 months.</li>
              <li>
                Deleting your account removes your data from live systems at once. Encrypted
                database backups age out on the provider's schedule and are not restored except to
                recover from a failure.
              </li>
            </ul>
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

          <section>
            <h2 className="font-display text-lg font-bold">Children</h2>
            <p className="mt-2 text-muted-foreground">
              LexDiary is for practising advocates and is not offered to anyone under 18. Matters
              may name minors as parties. That information is entered by your chamber, which is
              responsible for handling it lawfully, including obtaining a parent or guardian's
              consent where the Act requires it.
            </p>
          </section>

          <section className="rounded border border-border bg-secondary/40 p-5">
            <h2 className="font-display text-lg font-bold">Grievance officer</h2>
            <p className="mt-2 text-muted-foreground">
              For any question about this notice, or to exercise a right above, contact:
            </p>
            <p className="mt-3 font-medium">grievance@lexdiary.online</p>
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
