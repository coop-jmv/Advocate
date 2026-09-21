// Long-form guides for advocates, rendered at /guides and /guides/$slug.
//
// These pages exist to answer questions Indian advocates actually search for,
// so the content has to be accurate before it is anything else: stick to what is
// well established, say where a reader must check a primary source, and never
// describe a LexDiary capability more generously than the product delivers
// (e.g. e-Courts lookups are paid-plan only — see
// 20260916090000_ecourts_paid_feature_and_cache.sql).
//
// Adding a guide: append it here and add its URL to public/sitemap.xml.

export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "note"; text: string };

export type Guide = {
  slug: string;
  title: string;
  /** Meta description — keep under ~155 characters. */
  description: string;
  published: string;
  updated: string;
  readingMinutes: number;
  blocks: GuideBlock[];
};

export const GUIDES: Guide[] = [
  {
    slug: "cnr-number-explained",
    title: "What is a CNR number? How advocates find and use it",
    description:
      "The CNR is the 16-character number that identifies a case on e-Courts. What it is, where to find it, and how to use it to track a matter.",
    published: "2026-09-21",
    updated: "2026-09-21",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "Every case filed in a court covered by the e-Courts project is given a CNR — a Case Number Record. It is a 16-character alphanumeric code, unique across the country, that stays with the case for its whole life. Case numbers can repeat across courts and years; a CNR does not.",
      },
      { type: "h2", text: "What a CNR is made of" },
      {
        type: "p",
        text: "A CNR is built from codes for the state, district and court establishment, followed by a serial number and the year the case was filed. You never need to decode it by hand — its value is that the same 16 characters identify the same case in every e-Courts service.",
      },
      { type: "h2", text: "Why a CNR is more useful than the case number" },
      {
        type: "ul",
        items: [
          "It is unique. A case number such as a civil suit number is only unique within one court and year; the CNR is unique everywhere.",
          "It survives transfers. When a matter moves between courts within the e-Courts system, the CNR keeps pointing at the same case history.",
          "It is what e-Courts services search by fastest. Case status, orders and next dates can be pulled up with the CNR alone.",
        ],
      },
      { type: "h2", text: "Where to find the CNR for a case" },
      {
        type: "ol",
        items: [
          "On the e-Courts services website or the official eCourts Services mobile app, search for the case by case number, party name or advocate name. The CNR is shown with the case status.",
          "On orders and case-status printouts from courts on the e-Courts system, where it is printed alongside the case details.",
          "From the court's filing counter, for a case you have just filed.",
        ],
      },
      {
        type: "note",
        text: "Coverage varies. District and subordinate courts are broadly covered by e-Courts; some High Courts and tribunals run their own systems with their own numbering, and a CNR may not exist or behave the same way there.",
      },
      { type: "h2", text: "Using the CNR day to day" },
      {
        type: "p",
        text: 'Record the CNR against every matter the day it is available. It removes ambiguity when a clerk, junior or client asks about "the Sharma matter", and it makes checking status and next dates a single lookup rather than a search.',
      },
      {
        type: "p",
        text: "In LexDiary, each matter has a CNR field. On paid plans, entering the CNR and choosing Verify looks the case up on e-Courts and pre-fills the case number, court and opposing party for you to review before saving.",
      },
    ],
  },
  {
    slug: "track-daily-cause-list",
    title: "How to track your daily cause list without missing a hearing",
    description:
      "A practical routine for advocates to check the cause list, catch changes and keep the court diary accurate across courts and benches.",
    published: "2026-09-21",
    updated: "2026-09-21",
    readingMinutes: 6,
    blocks: [
      {
        type: "p",
        text: "A missed listing is one of the most avoidable problems in litigation practice. It rarely happens because an advocate did not care — it happens because the cause list changed after it was last checked, or because a matter was listed in a court or bench nobody was watching.",
      },
      { type: "h2", text: "Know which lists your courts publish" },
      {
        type: "p",
        text: "Most courts publish a daily cause list for the next working day, and many also publish supplementary lists, advance lists and special-bench lists. Check your court's website for when each is released and where — the regular list is not the only one that can carry your matter.",
      },
      { type: "h2", text: "What to check for each matter" },
      {
        type: "ul",
        items: [
          "Whether the matter is listed at all, in any list for the day.",
          "The court hall, bench and item number, so you can plan movement between courts.",
          "The stage — for admission, hearing, orders, or arguments — which decides what you prepare.",
          "Any change since you last looked: a new court, a different bench, or a matter moved to a supplementary list.",
        ],
      },
      { type: "h2", text: "A routine that holds up" },
      {
        type: "ol",
        items: [
          "Keep one diary that every hearing date goes into the moment it is known — not a notebook, a phone and a WhatsApp chat.",
          "When the next day's lists are published, check them against your diary, matter by matter.",
          "Check supplementary lists again before leaving for court; they are the usual source of surprises.",
          "Record the outcome and the next date the same day, before the details blur.",
          "In a chamber, make one person responsible for the check and have the list shared with everyone who appears.",
        ],
      },
      { type: "h2", text: "Matching lists to your matters" },
      {
        type: "p",
        text: "The slow part is matching: reading a long list and finding your cases by number, party name or advocate name. That is exactly the step worth automating, because it is repetitive and a single miss is costly.",
      },
      {
        type: "p",
        text: "LexDiary's court diary lets you import a cause list you already have, matches the listings against your matters, and flags what changed since the last import — a different court hall, a new item number, or a matter that dropped off the list — so you review exceptions rather than re-reading everything.",
      },
    ],
  },
  {
    slug: "gst-on-legal-services",
    title: "GST on legal services: what Indian advocates should know",
    description:
      "An overview of how GST applies to advocates' fees: reverse charge for business clients, common exemptions and invoicing basics.",
    published: "2026-09-21",
    updated: "2026-09-21",
    readingMinutes: 6,
    blocks: [
      {
        type: "note",
        text: "This is a general overview, not tax advice. GST rules for legal services are set by notifications that are amended from time to time. Confirm your position with a chartered accountant and the current notifications before relying on it.",
      },
      { type: "h2", text: "The short version" },
      {
        type: "p",
        text: "For legal services provided by an individual advocate or a firm of advocates, GST generally works on reverse charge when the client is a business entity: the client, not the advocate, pays the tax to the government. Legal services to individuals who are not acting in the course of business are generally exempt, and there is an exemption for small business clients as well.",
      },
      { type: "h2", text: "Reverse charge for business clients" },
      {
        type: "p",
        text: "Under reverse charge, the recipient of the service is liable to pay GST. For an advocate this means the invoice to a business client does not charge GST; the client accounts for it on their side. Senior advocates' services are also covered by reverse charge under the current rules.",
      },
      { type: "h2", text: "Common exemptions" },
      {
        type: "ul",
        items: [
          "Services to an individual client who is not a business entity.",
          "Services to a business entity whose aggregate turnover in the preceding financial year was within the threshold for GST registration.",
          "Services to other advocates or firms of advocates in certain cases.",
        ],
      },
      { type: "h2", text: "Do advocates need to register?" },
      {
        type: "p",
        text: "An advocate whose outward supplies are only those taxed under reverse charge or exempt is generally not required to register for GST. That can change if you also provide services outside that scope, so check your own mix of work each year.",
      },
      { type: "h2", text: "Invoicing well" },
      {
        type: "ul",
        items: [
          "Identify on each invoice whether the client is a business entity, so reverse-charge treatment is clear.",
          "Where reverse charge applies, say so on the invoice.",
          "Record the client's GSTIN where they have one.",
          "Keep time entries and expenses tied to the matter, so the invoice can be substantiated if questioned.",
        ],
      },
      {
        type: "p",
        text: "LexDiary's billing module keeps time entries and invoices, with their GST amounts, against the matter they belong to, so the work behind each invoice stays easy to find.",
      },
    ],
  },
  {
    slug: "choosing-practice-management-software",
    title: "Choosing practice management software for an Indian law practice",
    description:
      "A checklist for advocates and chambers comparing legal practice management software: court workflow, data protection, mobile use and cost.",
    published: "2026-09-21",
    updated: "2026-09-21",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "Most practice management software was designed around law firms elsewhere — billable hours, US or UK court systems, email-first client work. An Indian litigation practice runs differently: cause lists, frequent adjournments, many courts in a day, and clients who expect updates on WhatsApp. Judge any product against how you actually work.",
      },
      { type: "h2", text: "1. Does it follow Indian court workflow?" },
      {
        type: "ul",
        items: [
          "A court diary built around hearing dates and next dates, not generic calendar events.",
          "Cause-list support: can it help you find your matters in the day's list?",
          "Case identifiers you use — case number, CNR, court and bench.",
        ],
      },
      { type: "h2", text: "2. How does it protect privileged data?" },
      {
        type: "ul",
        items: [
          "Where is data stored? India-hosted data is simpler to reason about for many clients.",
          "Is each firm's data isolated from every other firm's at the database level, not only in the interface?",
          "What does it do under the Digital Personal Data Protection Act, 2023 — consent, export and deletion?",
          "Who inside your chamber can see what? Juniors and clerks rarely need everything.",
        ],
      },
      { type: "h2", text: "3. Will you use it from court?" },
      {
        type: "p",
        text: "If the diary is only usable at a desk, it will not be updated when the next date is given. A good test: can you record an outcome and a next date on your phone in under a minute, standing outside the courtroom?",
      },
      { type: "h2", text: "4. What does it replace?" },
      {
        type: "p",
        text: "Count the tools it would retire — the paper diary, spreadsheets, a separate billing tool — rather than the features it lists. Software that adds a step to your day without removing one will not stick.",
      },
      { type: "h2", text: "5. What will it cost as you grow?" },
      {
        type: "ul",
        items: [
          "Is there a way to start small, as a single advocate, before committing?",
          "How does pricing change when you add juniors or clerks?",
          "Can you export your data if you leave?",
        ],
      },
      {
        type: "p",
        text: "LexDiary was built for this workflow: matters, a court diary with cause-list matching, AI-assisted drafting and GST billing, with data hosted in India and isolated per chamber. A single advocate can start free.",
      },
    ],
  },
  {
    slug: "check-case-status-ecourts",
    title: "How to check case status on e-Courts",
    description:
      "Step-by-step: find a case's status, next date and orders on the e-Courts services portal and app, by CNR, case number, party or advocate name.",
    published: "2026-09-21",
    updated: "2026-09-21",
    readingMinutes: 4,
    blocks: [
      {
        type: "p",
        text: "The e-Courts services portal and the official eCourts Services app give free access to case status, next hearing dates, orders and cause lists for the district and subordinate courts on the e-Courts system. Knowing the fastest way to search saves time every day.",
      },
      { type: "h2", text: "On the website" },
      {
        type: "ol",
        items: [
          "Open the e-Courts services portal (services.ecourts.gov.in) and choose Case Status.",
          "If you have the CNR, search by CNR number — it is the fastest route and needs no court selection.",
          "Otherwise, select the state, district and court complex, then search by case number, filing number, party name, advocate name, FIR number or Act.",
          "Enter the captcha and open the case. The status page shows the stage, next hearing date, the court and judge, and the history of hearings, with orders where uploaded.",
        ],
      },
      { type: "h2", text: "On the phone" },
      {
        type: "p",
        text: "The eCourts Services app offers the same searches and lets you save cases so their status is a tap away. It is the quickest way to check a next date from the court corridor.",
      },
      { type: "h2", text: "Which search to use" },
      {
        type: "ul",
        items: [
          "CNR number — exact and unique; use it whenever you have it.",
          "Case number — needs the right court complex and case type, and the year.",
          "Advocate name — useful for seeing everything listed against your name, but results depend on how the name was entered at filing.",
          "Party name — for when you know the parties but not the number.",
        ],
      },
      {
        type: "note",
        text: "High Courts and many tribunals run their own websites with their own case-status search. If a matter does not appear on e-Courts, check the court's own site.",
      },
      { type: "h2", text: "Keeping it in one place" },
      {
        type: "p",
        text: "Checking status one case at a time does not scale across a busy docket. Record the CNR against every matter so you always have it, and keep next dates in one diary as soon as you see them. On paid plans, LexDiary can look a case up on e-Courts by its CNR and pre-fill the matter's details for you to review.",
      },
    ],
  },
  {
    slug: "what-goes-into-a-vakalatnama",
    title: "What goes into a vakalatnama: a checklist for advocates",
    description:
      "What a vakalatnama is, the details it must carry, and the common mistakes that get one returned by the registry — a practical checklist.",
    published: "2026-09-21",
    updated: "2026-09-21",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "A vakalatnama is the document by which a party authorises an advocate to appear, plead and act for them in a matter. Without one on record, an advocate generally cannot act for the party, so getting it right — and filed on time — is basic hygiene for every new brief.",
      },
      {
        type: "note",
        text: "Formats and filing requirements differ between courts and states — including which stamps must be affixed and how many copies are needed. Always check the rules and practice directions of the court you are filing in.",
      },
      { type: "h2", text: "Details it should carry" },
      {
        type: "ul",
        items: [
          "The name of the court and the case — number, title and year, or the proposed title for a fresh filing.",
          "The name and description of the party giving the authority, and their status in the case (petitioner, respondent, plaintiff, defendant).",
          "The name of each advocate being engaged, with their enrolment number and address for service.",
          "The powers being given — to appear, plead, act, file documents, receive papers and so on, as the court's format provides.",
          "The client's signature, and the date and place of signing.",
          "The advocate's signature accepting the engagement.",
        ],
      },
      { type: "h2", text: "Stamps and filing" },
      {
        type: "p",
        text: "Many states require a stamp to be affixed to the vakalatnama — commonly an advocates' welfare fund stamp, and in some courts a court-fee stamp. The value and type differ by state and court, so confirm the current requirement before filing rather than relying on the last matter you filed.",
      },
      { type: "h2", text: "Mistakes that get it returned" },
      {
        type: "ul",
        items: [
          "The party's name or status does not match the pleadings exactly.",
          "A missing signature, date or place — from the client or the advocate.",
          "Enrolment number omitted or incorrect.",
          "The required stamp missing, or of the wrong value.",
          "Signed on behalf of a company or other body without the authority to do so being on record.",
        ],
      },
      { type: "h2", text: "After filing" },
      {
        type: "p",
        text: "Keep a copy with the filing details and note the date it was filed against the matter. When a new advocate joins or one leaves, file a fresh vakalatnama or a no-objection as the court requires, so the record always shows who is appearing.",
      },
    ],
  },
];

export function findGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
