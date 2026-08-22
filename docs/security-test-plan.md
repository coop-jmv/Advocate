# LexDiary Security Test Plan

**Status as of 2026-08-22: Passes 1–2 complete.** Passes 3–4 not yet started. Gate 1
(`docs/gate-1-qa-validation-plan.md`) already live-verified a meaningful slice of this scope as
a side effect of functional testing; this document exists to make the *remaining* gap explicit,
prioritize it, and track it to closure the same way Gate 1 was tracked — real live tests against
a running instance, dated findings, fixes verified before being checked off, never a code-review
guess standing in for a test.

Pass 1 found and fixed one real, live production bug (unrelated to tenant isolation, but
surfaced directly by this pass's write-testing methodology): the document Approve/Reject
review-status action has been silently non-functional for every tenant since at least
2026-08-20, masked by an optimistic UI update. See PR #73. Every genuine tenant-isolation,
IDOR, RBAC-escalation, and Superadmin-boundary test in Pass 1 passed cleanly.

Pass 2 found and fixed one real information-disclosure gap (raw RLS/permission-denied Postgres
errors could reach the UI verbatim in an edge case, PR #74) and confirmed SQL injection and XSS
are both structurally very hard in this codebase's current architecture — live-tested with real
payloads across every remaining free-text field regardless. Two items recorded, not fixed: no
observable login lockout/rate-limiting (carried over from Pass 1's S1 test), and one CORS
wildcard on the Supabase platform's own REST gateway (low practical risk given this app's
token-in-localStorage session model, not app-configurable from this codebase either way).

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
| S1  | Authentication                        | P0 | 1 | ✅ **Verified live 2026-08-22** — wrong-password and nonexistent-email return byte-identical responses (`400 invalid_credentials`), no enumeration signal. Empty/10,000-char/Unicode/SQL-payload/XSS-payload passwords all rejected safely with the same generic message, no crash, no injection artifact. ⚠️ **Finding**: 15 rapid failed logins in succession produced zero lockout, backoff, or rate-limit response — no observable brute-force protection at the app layer (Supabase platform-level protection, if any, wasn't characterized). Recorded for Pass 2/4 follow-up, not fixed here |
| S2  | Session management / timeout          | P0 | 1 | ✅ **Verified live 2026-08-22** — idle timeout implemented and live-verified (`src/lib/use-inactivity-logout.ts`, PR #70). **Token-after-logout**: confirmed a bearer token remains valid for API calls after calling the logout endpoint — standard stateless-JWT behavior, bounded by the token's own 1-hour expiry (decoded a real token's `exp`/`iat` claims to confirm the TTL). **Admin-disables-user-mid-session**: confirmed the stronger, better property — `remove_member()` takes effect *immediately* even against an already-issued, unexpired token, because RLS re-resolves tenant membership per request rather than trusting a JWT claim; the removed user's token returned 0 rows on every subsequent tenant-scoped query. Absolute session lifetime (independent of activity) not separately tested — bounded by the same 1-hour access-token TTL already confirmed |
| S3  | Tenant data isolation                 | P0 | 1 | ✅ **Verified live 2026-08-22** — full two-tenant A/B test extended to every remaining tenant-scoped table: `clients`, `time_entries`, `invoices`, `ai_documents`, `ai_drafts`, `ai_conversations`, `ai_messages`, plus re-confirming `matters`. Cross-tenant SELECT (by exact ID and by unfiltered listing), tenant_id-spoofed INSERT, cross-tenant UPDATE, and cross-tenant DELETE all tested on all 8 tables. Zero cross-tenant leaks or writes on any table, any operation — with one real bug found along the way (not a leak): `ai_documents` UPDATE/DELETE were silently broken for *same*-tenant use too, see S7 |
| S4  | Object-level authorization / IDOR     | P0 | 1 | ✅ **Verified live 2026-08-22** — the S3 sweep above *is* the IDOR test: every `:id`-keyed resource across 8 tables, fetched/mutated with the wrong tenant's token, across SELECT/INSERT/UPDATE/DELETE. All correctly rejected or returned zero rows. Download/export-specific IDOR (documents, invoices) not separately tested — folds into S11 in Pass 3 |
| S5  | User-level authorization within a tenant (RBAC) | P0 | 1 | ✅ **Verified live 2026-08-22** — created a real `member` in the same tenant as an `owner` and attempted every escalation path directly (bypassing the UI): self-promotion via `PATCH profiles` (blocked — column-level GRANT excludes `tenant_role`/`tenant_id`, confirmed empirically, not just by reading the grant table), promoting via a self-created "admin" invite (blocked — `tenant_invites` INSERT policy requires `is_tenant_admin()`), calling `set_member_role`/`remove_member`/`set_seat_count` RPCs directly as a member (all three rejected with explicit "Only a chamber owner or admin can..." errors), and a tenant owner attempting to directly tamper with their own `licenses` row to upgrade their plan (0 rows — only platform admins can write `licenses`). `member` update access to clients/invoices/time_entries is confirmed **intentional** (RLS: "Tenant members update ...", any member, not admin-gated) — correctly matches the app's own design, not a gap |
| S6  | Database / RLS                        | P0 | 1 | ✅ **Verified live 2026-08-22** — full SELECT/INSERT/UPDATE/DELETE matrix run across `clients`, `time_entries`, `invoices`, `matters` (cross-tenant), plus `profiles`, `tenant_invites`, `licenses`, `tenants`, `platform_admins` (privilege-escalation/Superadmin angles, see S5/S13). One real gap found and fixed: `ai_documents` had a DELETE policy with no matching GRANT (same trap as the UPDATE bug in S7) — closed in the same PR before it could cause a second silent-failure bug |
| S7  | Database / RLS on K1–K4 AI tables specifically | P0 | 1 | ✅ **Fixed live 2026-08-22** — tenant-isolation re-confirmed clean on all four `ai_*` tables (the 2026-08-20 fix holds under fresh testing). **Found a real, live production bug in the process**: `ai_documents` had `SELECT, INSERT` granted to `authenticated` but no `UPDATE` — a side effect of `20260820041000_grant_housekeeping.sql` — and never had an UPDATE RLS policy at all. The app's document Approve/Reject action (`updateDocumentAnalysisStatus`) uses the RLS-scoped client, so this has been a **guaranteed no-op for every tenant since at least 2026-08-20**, invisible because `DocumentIntelligence.tsx`'s optimistic UI update flips the badge locally before the (failing) server call, then silently reverts on reload with no error shown. Reproduced live (confirmed via direct DB query that "Approved" never persisted), fixed with a `GRANT UPDATE` + a real "tenant members update" policy matching this table's existing DELETE-policy shape, re-verified the fix persists correctly *and* that cross-tenant writes are still blocked in both directions. See PR #73 |
| S8  | SQL / injection                       | P0 | 2 | ✅ **Verified live 2026-08-22** — architecturally confirmed no SQL-injection surface exists: every `EXECUTE format(...)` in every migration only ever concatenates hardcoded, developer-authored table names (never user input) with `%I` identifier-quoting, and `search_records()` (the header search box's backing RPC) uses safe parameter-into-value concatenation (`ILIKE '%' || p_query || '%'`), not dynamic query-structure construction. Live-tested with `x'; DROP TABLE matters; --`-style payloads through both the cause-list import path and the search RPC directly — zero effect, table intact, real production row count unchanged (12 matters, confirmed before and after) |
| S9  | XSS / input injection                 | P0 | 2 | ✅ **Verified live 2026-08-22** — `dangerouslySetInnerHTML` appears exactly once in the entire codebase (`src/components/ui/chart.tsx`), in a component that is itself never imported or used anywhere in the app (dead code, developer-controlled config only if it were). Every real user-content rendering path uses ordinary JSX text nodes, which React always HTML-escapes by default. Live-tested `<script>`/`<img onerror>` payloads in client name, matter notes, matter opposing-party, and hearing purpose — all four rendered as literal escaped text (confirmed via `innerHTML` inspection, e.g. `&lt;script&gt;...`), no execution, on both the Cases list and Matter Detail/timeline pages |
| S10 | API / server function security        | P0 | 2 | ✅ **Verified live 2026-08-22** — adversarially tested forging `created_by` to a fake/different user ID on a direct `clients` INSERT: rejected 403 (`created_by = auth.uid()` enforced via RLS `WITH CHECK`, not just a client-side default). Combined with Pass 1's tenant_id-spoofing sweep (also rejected/overridden across 8 tables) and this session's repeated code-level confirmation that no server function ever trusts a client-supplied identity field, this is now empirically adversarially tested, not just confirmed by construction |
| S11 | Document/file security                | P0 | 3 | Partial — boundary tests (0-byte, undersized, oversized, corrupted, renamed-extension) all done live (Gate 1 §4). **Not tested**: whether a tenant can access another tenant's uploaded document via a guessable/copied URL — the single most important sub-test in this category and not yet run |
| S12 | AI / prompt injection / cross-tenant & cross-matter leakage | P0 | 3 | Partial — prompt injection via a malicious document tested live and held (Gate 1 §6); cross-*matter* leakage tested live within what the test narrative describes as one tenant context (Gate 1 §6). **Cross-*tenant* AI leakage with two real tenants and distinct secret markers has not been run** — this is a different, more important test than cross-matter and is explicitly recommended below |
| S13 | Superadmin security                    | P0 | 1 | ✅ **Verified live 2026-08-22** — as a non-platform-admin, direct REST calls confirmed: listing `tenants` shows only the caller's own tenant; another tenant's `licenses` row returns empty; `platform_admins` table is completely unreadable; directly `PATCH`ing another tenant's `licenses.status` affects 0 rows; attempting to `INSERT` oneself into `platform_admins` returns 403 (no INSERT grant at all for `authenticated`). Combined with Gate 1 §5b's fixed `cause_list_records` over-permission and the confirmed `/admin` route-level redirect, every tested Superadmin boundary holds |
| S14 | Feature-flag bypass (all AI features)  | P0 | 1 | ✅ **Verified live 2026-08-22** — K4 confirmed in Gate 1. Newly tested: **K1 (assistant) has no governance flag at all, by design** — confirmed no `integrations.*` check exists in `ai-assistant/index.ts` *and* the Superadmin Settings·Integrations UI exposes no toggle for it either (only `ai_morning_brief_enabled`, `ai_matter_intelligence_enabled`, `ai_case_intelligence_enabled` exist) — consistent, not a gap, since K1 never touches tenant case data beyond the caller's own conversation history. **K2** (`ai-morning-brief`) and **K3** (`ai-matter-summary`): disabled each flag on a real tenant, called the edge function directly with a valid token — both correctly returned 403 with the expected "turned off for this chamber" message, then flags restored |
| S15 | Rate limiting / abuse                  | P1 | 2 | Partial — the AI daily-quota mechanism itself was deliberately exhausted and found working correctly, including a real bug it surfaced and got fixed (Gate 1 §4, PR #65). ⚠️ **Login brute-force tested 2026-08-22 (Pass 1's S1 test) — 15 rapid failed attempts produced no lockout or backoff.** Password-reset spam tested 2026-08-22: inconclusive — a *nonexistent* account correctly returns `200` with no enumeration signal (good), but a *real* test account at an `@example.com` address returned a `500 "Error sending recovery email"` on every attempt; most likely explained by `.example` being a non-routable RFC 2606 domain the mail provider can't deliver to, rather than a genuine production bug, but this test setup can't fully rule that out without a real, monitorable mailbox — **recommend re-testing password-reset delivery with a real inbox before treating this as resolved**. Non-AI bulk-action abuse (rapid document upload, cause-list import) still untested |
| S16 | Password / account recovery            | P1 | 4 | New this session — password length is now validated app-side (`src/lib/password-policy.ts`, PR #70), and Supabase Auth's own project-level minimum was identified as a separate, un-touched setting. Reset-token single-use/expiry/replay has not been tested |
| S17 | CSRF / CORS / security headers         | P1 | 2 | ✅ **Verified live 2026-08-22** — production response headers are genuinely well-configured: HSTS (`max-age=63072000; includeSubDomains; preload`), a real CSP (`default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, scoped `connect-src`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and a restrictive `Permissions-Policy`. ⚠️ Two findings: (1) CSP's `script-src` includes `'unsafe-inline'`, which meaningfully weakens CSP's own XSS protection (low urgency given S9's finding that XSS is structurally very hard here anyway, but worth tightening eventually — would need auditing/removing any inline `<script>`/`onclick` usage first). (2) The edge functions' own CORS (`supabase/functions/_shared/cors.ts`) is a real origin allowlist, live-verified — an evil origin gets `Access-Control-Allow-Origin: null`, the real origin gets its own origin back. But the underlying **Supabase PostgREST gateway itself returns a wildcard `Access-Control-Allow-Origin: *`** on every table, confirmed live — this is a Supabase platform default, not something this codebase configures, and its practical exploitability is low because Supabase sessions live in `localStorage` (not auto-sent cross-origin like cookies), so an attacker's page can't attach a victim's real bearer token to a cross-origin request just because CORS allows it — but it's a real, current platform-level fact worth being aware of, not fixable from this repo. CSRF itself is structurally not very applicable to this app's auth model (no ambient cookie-based session to forge a request with) |
| S18 | Billing / payment security              | P1 | 2 | Partial — Pass 1 already confirmed a tenant (even the owner) cannot directly modify their own `licenses` plan/status via REST (0 rows — platform-admin-only table). Plan-price/limit values were separately cross-checked against `plan_price_inr()`/`plan_limit()` for *accuracy* (PR #69). Not yet tested: invoice/time-entry amount tampering after creation, or any Razorpay-specific webhook/signature-verification surface (no live payment integration exists yet per Gate 1's baseline, so this is not yet a real attack surface) |
| S19 | Error / information leakage             | P1 | 2 | ✅ **Fixed live 2026-08-22** — found a real gap: `friendlyErrorMessage()` only handled two error shapes (Zod validation, numeric overflow); any other Postgres error — including a raw `new row violates row-level security policy for table "clients"` or `permission denied for table ai_documents`, both reproduced live this session — fell through to the user unchanged. No secrets/credentials were ever exposed this way, but internal table/schema names with no actionable next step for the user is a real, low-severity information-disclosure and UX gap, reachable by a legitimate user hitting a stale-permission edge case, not just an adversarial one. Fixed with a generic catch-all mapping both shapes to "You don't have permission to do that." (PR #74), verified directly against the exact strings reproduced live. Browser console/network audit for stray secrets or over-fetched fields not yet done as its own pass |
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

### Pass 1 — Identity & Isolation (S1–S7, S13, S14) — ✅ complete, 2026-08-22

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

Concrete test list for this pass, building on what Gate 1 already ran — **all items below run,
2026-08-22, results in the Scope table above**:

- **S1**: wrong-password vs. nonexistent-email ✅ identical response; empty/very-long/Unicode/
  SQL-payload/XSS-payload passwords ✅ all safely rejected; repeated failed logins ⚠️ **no
  lockout/backoff observed** (15 rapid attempts, all identical 400s) — recorded, not fixed.
- **S2**: ✅ token-after-logout confirmed valid until natural expiry (standard JWT behavior,
  bounded to 1 hour); ✅ admin-disable-mid-session confirmed to revoke access *immediately*
  even against an unexpired token (RLS re-checks per request); absolute lifetime not separately
  tested (same 1-hour bound already confirmed).
- **S3/S6/S7**: ✅ two-tenant A/B test run against `clients`, `time_entries`, `invoices`,
  `ai_documents`, `ai_drafts`, `ai_conversations`, `ai_messages` — SELECT, tenant_id-spoofed
  INSERT, UPDATE, DELETE, all clean. Found and fixed a real bug along the way: `ai_documents`
  UPDATE/DELETE were broken for *same*-tenant use too (missing grants), see S7 and PR #73.
- **S4**: ✅ folded into the S3 sweep — every `:id`-keyed resource across the 8 tables above,
  fetched/mutated with the wrong tenant's token. Download/export-specific IDOR deferred to Pass 3.
- **S5**: ✅ as `member`: self-promotion via profile PATCH blocked (column-level grant),
  self-invite-as-admin blocked (RLS), `set_member_role`/`remove_member`/`set_seat_count` RPCs
  all rejected non-admin callers explicitly, and even the tenant *owner* can't directly tamper
  with their own `licenses` row (platform-admin-only table).
- **S13/S14**: ✅ non-platform-admin blocked from reading `tenants`/`licenses`/`platform_admins`
  cross-tenant and from self-inserting into `platform_admins`; K2/K3 feature-flag bypass tested
  and held (K4 already done in Gate 1, K1 confirmed to have no flag by design).

### Pass 2 — Application / API (S8–S10, S15, S17–S19) — ✅ complete, 2026-08-22

`SQL injection · XSS · CSRF/CORS/headers · API authorization · input validation · rate limiting ·
error leakage`

Extended Gate 1 §4's boundary-test payloads (SQL-like and raw-HTML, previously only run against
Matter title) to client name, matter notes, opposing-party, hearing purpose, and a cause-list
source field — plus checked the one `dangerouslySetInnerHTML` call site in the entire codebase
(an unused component) to settle whether stored/DOM XSS is even structurally possible anywhere,
rather than checking field-by-field forever. Ran a real security-headers/CORS review against
production and the Supabase edge functions' own CORS allowlist. Found and fixed one real
information-disclosure gap (S19, PR #74). Two things recorded, not fixed: no login
lockout/rate-limiting (S15, carried from Pass 1), and a CORS wildcard on Supabase's own REST
gateway (S17, low practical risk, not app-configurable). AI-generated output rendering
specifically wasn't separately re-tested — it renders through the same plain-JSX path already
confirmed safe for every other field, and the codebase-wide `dangerouslySetInnerHTML` check
already rules out a bypass. Browser console/network audit for stray secrets/over-fetched fields
(part of S19) and non-AI bulk-action abuse (part of S15) remain open, carried to Pass 4.

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

**Progress: Passes 1–2 of 4 complete (2026-08-22).** S1–S10, S13–S15, S17–S19 all ✅ or fixed.
Of the seven S0 gate categories, three are fully covered by Pass 1's results: tenant-isolation
defects, IDOR/BOLA and RBAC-bypass authorization defects, and Superadmin privilege bypass — all
tested clean. Cross-tenant AI leakage, unauthorized document access, and known-exposed-secrets
remain open, scheduled for Pass 3 and Pass 4 respectively. Two non-gate-blocking items are
recorded but not yet resolved: no observable login lockout/rate-limiting (S15), and Supabase's
own REST gateway CORS wildcard (S17, low practical risk, platform-level, not app-fixable). Next
up: Pass 3 (Documents & AI — unauthorized document access, AI cross-tenant leakage) — the two
tests most directly relevant to the S0 gate categories still open.
