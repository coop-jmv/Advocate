# SEO launch kit

What is already done in code: sitemap (`public/sitemap.xml`), canonical URLs, share image,
structured data, `noindex` on the workers.dev duplicate, keyword titles and the `/guides`
articles. What remains needs **your** accounts, so it is written out here to copy and paste.

Do these after the site is deployed.

---

## 1. Google Search Console (most important)

1. Go to <https://search.google.com/search-console> and sign in with the Google account that
   should own the site.
2. **Add property → Domain** → enter `lexdiary.online`.
3. Google shows a TXT record like `google-site-verification=…`. In the **Cloudflare dashboard →
   lexdiary.online → DNS → Add record**: type `TXT`, name `@`, content = that value. Save, then
   click **Verify** in Search Console. (A Domain property covers every URL on the domain, with no
   code change needed.)
4. **Sitemaps** → submit `https://lexdiary.online/sitemap.xml`.
5. **URL inspection** → paste each URL below → **Request indexing**:
   - `https://lexdiary.online/`
   - `https://lexdiary.online/guides`
   - each `https://lexdiary.online/guides/…` page

Check back after a week: **Pages** shows what got indexed, **Performance** shows the searches you
appear for.

## 2. Bing (also powers DuckDuckGo, Yahoo, ChatGPT search)

- Easiest: <https://www.bing.com/webmasters> → **Import from Google Search Console**.
- Then, and after every deploy that adds pages, run from the repo:

  ```sh
  bun run seo:indexnow
  ```

  This notifies Bing, Yandex and other IndexNow engines of every sitemap URL. It checks that the
  key file `public/a8f5fa853297489ec521761dbe82b775.txt` is live first.

---

## 3. Directory listings (backlinks)

A new site with no links pointing at it ranks for almost nothing. List LexDiary on these, using
the copy below. Prioritise the first four.

| Site                                                                                                      | Why                                               |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [Capterra](https://www.capterra.com/vendors/sign-up) / [GetApp](https://www.getapp.com) / Software Advice | One Gartner vendor sign-up lists you on all three |
| [G2](https://sell.g2.com)                                                                                 | High-authority; buyers compare here               |
| [Techjockey](https://www.techjockey.com)                                                                  | India-focused software marketplace                |
| [SaaSworthy](https://www.saasworthy.com)                                                                  | Free listing, good legal-software category        |
| [AlternativeTo](https://alternativeto.net)                                                                | Lists you as an alternative to known tools        |
| [Product Hunt](https://www.producthunt.com)                                                               | One-time launch spike + a lasting link            |
| LinkedIn company page                                                                                     | Branded search result; post each new guide        |
| Bar associations, law-school legal-tech pages                                                             | Relevant, trusted links — ask directly            |

### Listing copy

**Name:** LexDiary

**Website:** https://lexdiary.online

**Category:** Legal practice management software / Law firm software

**Tagline (≤ 60 chars):**
Practice management software for Indian advocates

**Short description (≤ 160 chars):**
Case management, a court diary with cause-list matching, AI case assistant and GST billing — built
for Indian advocates and law firms.

**Long description:**
LexDiary is legal practice management software built for how litigation is practised in Indian
courts. Advocates and chambers keep every matter, client and hearing date in one workspace, with a
court diary that matches imported cause lists against their matters and flags changes — a new court
hall, a changed item number, a matter dropped from the list. An AI case assistant answers questions
about a matter from its own record, and a drafting studio produces first drafts. Documents can be
scanned with Indic-language OCR, and billing records time entries and GST invoices against each
matter. Data is hosted in India, isolated per chamber, and handled in line with the DPDP Act, 2023.
It works on the phone as well as the desk, and a single advocate can start on a free plan.

**Key features:**

- Case and matter management with CNR support
- Court diary with cause-list import, matching and change alerts
- AI case assistant and AI drafting studio
- Indic OCR with AI document review
- Client records and GST billing
- Team roles, audit log, India data residency

**Pricing:** Free plan for one advocate; paid modules and team plans on request.

**Contact:** lexdiary.online@gmail.com · +91 70100 61822

**Screenshots to prepare:** matter list, a matter's timeline, the court diary, the AI assistant,
an invoice. Use the demo account (`demo@lexdiary.online`) with sample data, never a real chamber.

---

## 4. Google Business Profile

<https://business.google.com> → **Add business**.

- **Business name:** LexDiary
- **Business type:** Online business (no customer-facing location) — choose _"I deliver goods and
  services to customers"_ and set the service area to **India**. Do not enter a home address.
- **Category:** Software company
- **Website:** https://lexdiary.online
- **Phone:** +91 70100 61822
- **Description (≤ 750 chars):**
  LexDiary is practice management software for Indian advocates and law firms. It brings matters,
  clients, a court diary with cause-list matching, an AI case assistant, drafting, document OCR and
  GST billing into one secure workspace, usable from a phone in court or a desk in chambers. Data
  is hosted in India and isolated per chamber. A single advocate can start free.

Google verifies by phone, email or video. Once verified, post a short update whenever a new guide
is published.

---

## Keeping it going

- Publish a new guide every 2–4 weeks: add it to `src/lib/guides.ts`, add its URL to
  `public/sitemap.xml`, deploy, then run `bun run seo:indexnow` and request indexing in Search
  Console.
- Good next topics: cause lists for specific High Courts, drafting a vakalatnama, limitation-period
  basics, managing a junior's matters, e-filing checklists.
- Keep every claim accurate — especially plan inclusions and legal or tax facts. Wrong content on a
  lawyers' site costs more trust than it gains traffic.
