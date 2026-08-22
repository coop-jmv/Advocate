# LexDiary Security Test Plan

**Status as of 2026-08-22: NOT STARTED.** This is the plan only — no security-specific testing
has been executed against it yet. Gate 1 (`docs/gate-1-qa-validation-plan.md`) already
live-verified a meaningful slice of this scope as a side effect of functional testing (see the
"Prior coverage" column below); this document exists to make the *remaining* gap explicit,
prioritize it, and track it to closure the same way Gate 1 was tracked — real live tests against
a running instance, dated findings, fixes verified before being checked off, never a code-review
guess standing in for a test.

Same rules as Gate 1: a row isn't ✅ until it's actually been run against a live instance (local
or deployed) with a recorded result, and every test tenant/user created for testing is deleted
afterward with zero leftover rows confirmed.

## Why this exists as its own document, not another Gate 1 section

Gate 1 validated that LexDiary's *features work as specified*. This validates that they *can't
be made to do something else* — a materially different failure mode, and one where "looks fine
in the UI" is actively misleading (see the note under Pass 1 below). LexDiary is a multi-tenant
SaaS holding privileged legal case data, client PII, billing records, and an AI layer with
document/matter context across four tenant-isolated features (K1 assistant, K2 cause-list, K3
matter intelligence, K4 Ask My Case) — the blast radius of a tenant-isolation or authorization
defect here is a real client's privileged case file, not a cosmetic bug.

---

## Security Gate — S0 (release-blocking criteria)

Do not begin public marketing / general availability while any of the following is non-zero:

- Critical vulnerabilities (any severity-Critical finding, unresolved)
- High tenant-isolation defects
- High authorization defects (IDOR/BOLA, RBAC bypass)
- Cross-tenant AI leakage (any AI feature returning another tenant's content)
- Unauthorized document access (any tenant reading/downloading another tenant's file)
- Superadmin privilege bypass (a non-platform-admin reaching platform-admin-only data or actions)
- Known exposed secrets (committed to git history, present in a client bundle, or logged) — S23

Medium/Low findings may be risk-assessed and scheduled post-launch. The seven categories above
do not get that option — each is an explicit launch blocker until resolved and re-verified live.

---

## Scope and prioritization

| #   | Security area                        | Priority | Pass | Prior coverage from Gate 1 |
| --- | ------------------------------------- | -------: | ---: | -------------------------- |
| S1  | Authentication                        | P0 | 1 | Partial — login/signup/reset flows exist and were exercised functionally; negative/enumeration tests (wrong password vs. nonexistent email, brute-force, malformed input) not yet run |
| S2  | Session management / timeout          | P0 | 1 | Partial — idle timeout now implemented and live-verified (`src/lib/use-inactivity-logout.ts`); absolute session lifetime, logout-token-revocation, and admin-disables-user-mid-session not tested |
| S3  | Tenant data isolation                 | P0 | 1 | **Substantial** — Gate 1 §5 ran a real two-tenant A/B setup: 0 cross-tenant reads on `matters`/`hearings`/`cause_list_sources`/`cause_list_records` by ID or listing, write-spoofing (`tenant_id` in POST body) rejected 403 on both an old table and a new K2 table. Not yet run against `clients`, `time_entries`, `invoices`, `ai_documents`, `ai_drafts`, `ai_conversations`, `ai_messages` with a live attacker token (a prior 2026-08-20 audit covered these — see Gate 1 §5a — but predates several later schema/policy changes and should be re-run, not just cited) |
| S4  | Object-level authorization / IDOR     | P0 | 1 | Partial — the two-tenant test above **is** an IDOR test for the tables it covered (fetch-by-exact-ID across tenants). Not yet run per-object across every route/operation (PATCH/DELETE on hearings, clients, documents, invoices, cause-list matches; download/export operations specifically) |
| S5  | User-level authorization within a tenant (RBAC) | P0 | 1 | Partial — `member` cannot delete a matter, confirmed live including a direct RLS-bypass attempt (Mobile/Error-handling pass, Gate 1 §2). LexDiary's real role set is `owner`/`admin`/`member` only (no Junior/Clerk/Client roles exist — confirmed via the `profiles_tenant_role_check` constraint during the pricing-page fix) — the authorization matrix to test is 3 roles × N resources, not the larger matrix a generic template assumes. Update/read boundaries for `member` vs `admin` across clients/billing/documents not yet tested |
| S6  | Database / RLS                        | P0 | 1 | Partial — SELECT tested cross-tenant on 4+ tables (above); INSERT/UPDATE/DELETE tested on `matters` and `cause_list_sources` only. Full SELECT/INSERT/UPDATE/DELETE matrix across every tenant-scoped table, per role, is the gap |
| S7  | Database / RLS on K1–K4 AI tables specifically | P0 | 1 | Partial — a pre-existing 2026-08-20 audit found and fixed a critical bug where `ai_documents`/`ai_drafts`/`ai_conversations`/`ai_messages` accepted a client-supplied `tenant_id` on INSERT; retested clean at the time. Needs a fresh live retest now that K2/K3/K4 have shipped more code on top of that fix |
| S8  | SQL / injection                       | P0 | 2 | Partial — SQL-like input (`Sharma' OR 1=1 --`) tested against Matter title, stored as inert literal (Gate 1 §4). Not tested against search/filter/sort/pagination inputs, cause-list import parsing, or as second-order injection (a saved value later reaching a report/search query) |
| S9  | XSS / input injection                 | P0 | 2 | Partial — raw HTML (`<script>alert(1)</script>`) tested against Matter title, rendered inert (Gate 1 §4). Not tested against client name, hearing/matter notes, cause-list free-text fields, document names, or — importantly — **AI-generated output rendering**, since K1–K4 responses are model-generated text the frontend must still render safely |
| S10 | API / server function security        | P0 | 2 | Partial by construction — every `*.functions.ts` server function reviewed this session derives `tenant_id`/`user_id` server-side from the authenticated session, never trusting a client-supplied value (confirmed repeatedly while reading this code across Gate 1 and later fixes). Not yet *adversarially* tested by calling functions directly with a crafted payload attempting to override that derivation |
| S11 | Document/file security                | P0 | 3 | Partial — boundary tests (0-byte, undersized, oversized, corrupted, renamed-extension) all done live (Gate 1 §4). **Not tested**: whether a tenant can access another tenant's uploaded document via a guessable/copied URL — the single most important sub-test in this category and not yet run |
| S12 | AI / prompt injection / cross-tenant & cross-matter leakage | P0 | 3 | Partial — prompt injection via a malicious document tested live and held (Gate 1 §6); cross-*matter* leakage tested live within what the test narrative describes as one tenant context (Gate 1 §6). **Cross-*tenant* AI leakage with two real tenants and distinct secret markers has not been run** — this is a different, more important test than cross-matter and is explicitly recommended below |
| S13 | Superadmin security                    | P0 | 1 | **Substantial** — Gate 1 §5b found and fixed a real Superadmin over-permission (`cause_list_records` blanket cross-tenant read, narrowed 2026-08-22); §2's Mobile/Error-handling pass confirmed a non-platform-admin is redirected away from `/admin` server-side. Feature-flag bypass (disabling AI governance, then calling the edge function directly) tested and held for K4 (Gate 1 §4/§6) — not yet re-verified for K1/K2/K3 |
| S14 | Feature-flag bypass (all AI features)  | P0 | 1 | Partial — see S13; only K4's direct-call-while-disabled path has been tested. K1 (assistant), K2 (cause-list AI-adjacent paths, if any), K3 (matter summary) not yet re-tested the same way |
| S15 | Rate limiting / abuse                  | P1 | 2 | Partial — the AI daily-quota mechanism itself was deliberately exhausted and found working correctly, including a real bug it surfaced and got fixed (Gate 1 §4, PR #65). Login brute-force, password-reset spam, and non-AI endpoint abuse (bulk cause-list import, document upload) have no rate limiting confirmed either way |
| S16 | Password / account recovery            | P1 | 1 | New this session — password length is now validated app-side (`src/lib/password-policy.ts`, PR #70), and Supabase Auth's own project-level minimum was identified as a separate, un-touched setting. Reset-token single-use/expiry/replay has not been tested |
| S17 | CSRF / CORS / security headers         | P1 | 2 | None — not examined this session beyond incidentally noticing the site's CSP blocks Cloudflare's own analytics beacon (Gate 1 §2, cosmetic finding, not a security review) |
| S18 | Billing / payment security              | P1 | 2 | None on the payment-specific angle. Plan-price/limit values were cross-checked against `plan_price_inr()`/`plan_limit()` for *accuracy* (PR #69), not for tamper resistance |
| S19 | Error / information leakage             | P1 | 2 | Partial, indirectly — raw Zod/Postgres errors reaching the UI were found and fixed as a *UX* issue (Gate 1 §4, PR #60/#61), which happens to also close some information-leakage surface (stack traces, internal field names). Not reviewed systematically as a security pass, and browser console/network tabs have not been audited for stray secrets or over-fetched fields |
| S20 | Dependency / supply chain               | P1 | 4 | None — no `npm audit`/equivalent run this session |
| S21 | Audit / security logging                | P1 | 4 | Partial — `audit_log` table exists and was spot-checked once for correct actor attribution (Gate 1 §2 click-through). Not reviewed for *what* it captures across security-sensitive events, or for accidental sensitive-data leakage into log rows |
| S22 | Backup / recovery / deletion            | P1 | 4 | Partial — `delete_my_account()`'s cascade behavior was tested and a real bug fixed (Gate 1 §5b, PR #48); matter-delete's downstream effect on hearings/documents/timeline was *not* re-verified after that fix. Actual DB backup/restore has never been tested — "daily backups" is a pricing-page claim (verified accurate as a Supabase platform feature) but restoration has not been drilled |
| S23 | Secrets / API key exposure               | **P0 (S0 gate)** | 4 | Partial — `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` are confirmed to be Cloudflare Worker secrets (`wrangler secret list`), not committed to the repo or present in any client-shipped code this session touched. **Not done**: a systematic grep of the full git history (not just the current tree) for accidentally committed keys/tokens, and a check that no secret is ever echoed into a browser-visible response, log, or error message — the friendly-error work in Gate 1 §4 happened to remove several raw Postgres/Zod error leaks but was not run as a dedicated secrets-leakage pass |

Every "Partial" and "None" above is real, current, and the actual gap to close — not a
placeholder. Nothing in this table should be read as "Gate 1 already covered security"; it's the
opposite: it's the honest accounting of exactly how much of a much larger scope Gate 1's
functional testing happened to touch.

---

## Execution order — four passes

Matches the priority argument already made: identity and isolation defects are the highest-value
target because they're the core trust boundary of a multi-tenant legal SaaS, and a defect there
compromises every other layer regardless of how well-secured those other layers are individually.

### Pass 1 — Identity & Isolation (S1–S7, S13, S14) — start here

`Authentication · Session management · Tenant isolation · IDOR/BOLA · RBAC · RLS (general +
K1–K4 tables) · Superadmin isolation · Feature-flag bypass`

**Methodology, extending Gate 1's pattern with one addition specific to this pass:**

Every isolation/authorization claim must be verified at **two layers**, not one:
1. UI layer — the button/link/page isn't shown or is blocked.
2. **API/database layer — the underlying request is rejected even when issued directly**,
   bypassing the UI entirely (raw REST call with a real bearer token, or a direct RLS-context SQL
   simulation, per the technique already used and proven this session — e.g. the `member`-role
   delete-bypass test in Gate 1 §2, and the platform-admin `cause_list_records` read test in
   Gate 1 §5b).

"The UI doesn't show it" is not evidence of anything for this pass — it means only that a
well-behaved client doesn't request it, not that the server refuses it. Every finding this
document should produce is level-2 (layer 2 fails), not level-1.

Concrete test list for this pass, building on what Gate 1 already ran:

- **S1**: wrong-password vs. nonexistent-email should return the *same* generic message (test
  for account-enumeration via response-message difference or timing); empty/very-long/Unicode/
  SQL-payload/XSS-payload passwords; repeated failed logins (is there any lockout or backoff?).
- **S2**: absolute session lifetime (does an unattended-but-technically-active session ever
  expire regardless of activity?); does a copied bearer token keep working after logout; does an
  account disabled mid-session (if that capability exists) lose access immediately or only on
  next login.
- **S3/S6/S7**: re-run the Gate 1 §5 two-tenant A/B test against every remaining tenant-scoped
  table not yet covered — `clients`, `time_entries`, `invoices`, `ai_documents`, `ai_drafts`,
  `ai_conversations`, `ai_messages` — for SELECT, INSERT (tenant_id-spoofed), UPDATE, and DELETE,
  not SELECT alone.
- **S4**: for every `:id`-keyed resource (matter, client, hearing, document, invoice, cause-list
  record/match), fetch/mutate Tenant B's real ID using Tenant A's token — across every operation
  the UI exposes for that resource, not just GET.
- **S5**: as `member`, attempt every `admin`/`owner`-gated action directly (not just delete,
  which is already confirmed) — update client, change another member's role, remove a team
  member, change seat count, view/export billing.
- **S13/S14**: as a non-platform-admin, call every `/admin/*`-adjacent server function/edge
  function directly; as a tenant admin (not platform admin), attempt to modify a *different*
  tenant's license/plan/status; with each K1–K3 AI feature toggled off via
  `/admin/settings/integrations`, call its edge function directly (only K4 has been done).

### Pass 2 — Application / API (S8–S10, S15, S17–S19)

`SQL injection · XSS · CSRF/CORS/headers · API authorization · input validation · rate limiting ·
error leakage`

Builds on Gate 1 §4's boundary-test catalogue (which already exercised SQL-like and raw-HTML
input against Matter title) by extending the same payloads to every remaining free-text field —
client name, hearing/matter notes, cause-list free-text, document names — plus AI-generated
output rendering specifically, since that's model-produced text with no upstream sanitization
guarantee. Adds a genuine security-headers/CORS review (CSP, HSTS, `X-Content-Type-Options`,
`Referrer-Policy`, `frame-ancestors`, and confirming no sensitive endpoint answers with a
wildcard `Access-Control-Allow-Origin`) and a console/network audit for stray secrets or
over-fetched fields — neither has been done at all yet.

### Pass 3 — Documents & AI (S11, S12)

`File upload boundaries (done) · unauthorized document access (not done) · AI prompt injection
(done) · AI cross-tenant leakage (not done) · AI cross-matter leakage (done) · AI quota/feature-
flag bypass (done for K4)`

The two genuinely new tests this pass needs to add, both using the two-tenant methodology
already proven in Gate 1 §5:

- **Unauthorized document access**: Tenant A obtains (or guesses) Tenant B's document
  storage path/URL and attempts to fetch it directly, bypassing the app UI entirely.
- **AI cross-tenant leakage**: create two real tenants, each with one matter/document
  containing a distinct, unique marker string invented for this test (e.g. a random
  `WORD-WORD-####` token) that appears nowhere else in the system. Ask Tenant A's AI (K4
  Ask My Case, and separately K1 the general assistant if it takes any tenant context) for
  Tenant B's marker string by name. It must never appear in the answer. This is a stronger,
  more direct test than the cross-*matter* test Gate 1 already ran, because it tests the
  tenant boundary itself rather than the matter-scoping logic within one tenant.

### Pass 4 — Production Hardening (S16, S20–S23)

`Password reset token lifecycle · dependency/supply-chain scan · audit-log content review ·
backup/restore drill · production configuration review · secrets/API key exposure`

The most mechanical pass — a dependency vulnerability scan, a password-reset single-use/replay
test, a read-through of what `audit_log` actually captures (and confirms it captures no
passwords/full tokens/unnecessary document content), a full-history secrets grep (S23 — with a
rotation, not just a deletion, if anything is ever found committed), and — the one item in this
entire plan that cannot be verified by reading code or calling an API — an actual restore-from-
backup drill, since an untested backup is not a recovery plan, only an assumption.

---

## What this plan deliberately does not re-litigate

Two items already surfaced during Gate 1 and explicitly deferred as **product decisions, not
security defects** — they don't belong in this document because they were resolved:

- Superadmin's `cause_list_records` cross-tenant read scope — decided and fixed (narrowed to
  match actual UI use), see Gate 1 §5, PR #67.
- Cause-list reconciliation creating a duplicate hearing instead of updating the existing one —
  a data-correctness decision, not an authorization defect, see Gate 1 §2/§7, PR #67.

---

## Sign-off

This plan is satisfied when every row in the Scope table above is ✅ with a dated, live-verified
result (not a code-review inference) and the Security Gate (S0) criteria all read zero. Until
then, per S0, public marketing/general-availability launch stays blocked on the seven categories
listed there regardless of how much of the rest of the scope is complete.
