# LexDiary Phase-1 Product Baseline

**Purpose:** the reference inventory of what LexDiary actually is today — used as the
baseline for Gate 1 QA (see `docs/gate-1-qa-validation-plan.md`). Anything marked
**Aspirational** below is explicitly out of scope for Gate 1: writing test cases against a
feature that doesn't exist produces false confidence, not real coverage. This document
corrects several items in the original module/role list against what's actually implemented,
the same discipline `docs/phase-1-freeze.md` already applies.

---

## Core modules (implemented)

| Module                  | Route                                | Notes                                                                                                                 |
| ----------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Dashboard               | `/app`                               | Stat tiles, Court Morning Brief (K1), weekly billable-hours chart                                                     |
| Matters / Cases         | `/app/cases`, `/app/cases/$matterId` | List+create, detail page (header, AI summary, Ask My Case, timeline)                                                  |
| Court Diary             | `/app/diary`                         | Hearing CRUD, clash/conflict detection                                                                                |
| Cause List Intelligence | `/app/cause-list`                    | K2: manual import, deterministic matching, change history, reconciliation                                             |
| Matter Timeline         | embedded in matter detail            | K3: computed event stream (matter/hearing/cause-list/document events)                                                 |
| Ask My Case             | embedded in matter detail            | K4: grounded Q&A with citations, per matter                                                                           |
| Documents               | `/app/documents`                     | Document Intelligence — paste/upload/scan → AI analysis → approve/reject                                              |
| Clients                 | `/app/clients`                       | Advocate-side CRM (name/phone/email/notes) — **not** a client login/portal, see below                                 |
| Billing                 | `/app/billing`                       | Time entries, GST invoices, Razorpay payment link                                                                     |
| Drafting studio         | `/app/drafting`                      | AI-generated draft documents                                                                                          |
| Voice dictation         | `/app/dictation`                     | Transcription + formatting                                                                                            |
| AI assistant            | `/app/assistant`                     | General chat, optional free-text matter hint — **not** the same as Ask My Case (no real grounding, no citations)      |
| Diary insights          | `/app/insights`                      | —                                                                                                                     |
| Team                    | Settings → Team                      | Invite/remove members, set `tenant_role` (owner/admin/member only)                                                    |
| Audit log               | Settings → Audit log                 | Tenant-scoped, read-only                                                                                              |
| Subscription            | Settings → Subscription              | Plan/trial status, Razorpay activation                                                                                |
| Profile & privacy       | Settings → Profile & privacy         | Account, consent, DPDP export/erasure                                                                                 |
| Superadmin              | `/admin`                             | Tenants (create/status/plan/license), Integrations (AI governance), Cause-list sources monitoring, platform Audit log |

## AI features (implemented)

| Feature                | Grounded?                                 | Citations?                                 | Governed by                      |
| ---------------------- | ----------------------------------------- | ------------------------------------------ | -------------------------------- |
| AI Morning Brief (K1)  | Yes (deterministic facts + AI prep-notes) | No                                         | `ai_morning_brief_enabled`       |
| AI Matter Summary (K3) | Yes                                       | No (4-part narrative, no per-fact source)  | `ai_matter_intelligence_enabled` |
| Ask My Case (K4)       | Yes                                       | Yes, structured, retrieval-layer-generated | `ai_case_intelligence_enabled`   |
| AI assistant           | No (general chat)                         | No                                         | none — only quota-gated          |
| Document Intelligence  | N/A (extraction, not Q&A)                 | N/A                                        | none — only quota-gated          |
| Drafting studio        | N/A (generation)                          | N/A                                        | none — only quota-gated          |

## AI governance (implemented)

- One JSONB column (`licenses.integrations`) holding per-tenant, per-feature boolean flags:
  `whatsapp_enabled`, `ai_morning_brief_enabled`, `cause_list_enabled`,
  `ai_matter_intelligence_enabled`, `ai_case_intelligence_enabled`.
- Every gated AI feature double-enforces: a client-side check (hide the button) **and** a
  server-side re-check inside the edge function itself (reject a direct call).
- Usage quota: `enforceUsageQuota()` → `increment_ai_usage()` RPC, a **per-user** daily call
  limit by plan (trial/starter/pro/enterprise) — not per-tenant.

## User roles

### Implemented (real, RLS-enforced)

- **Superadmin** — membership in the `platform_admins` table, checked via
  `is_platform_admin(uid)`. Cross-tenant. **Manual grant only** — no self-service or
  automatic path exists; every grant so far has been a one-off SQL migration.
- **Owner / Admin / Member** — `profiles.tenant_role`, the only three tenant-level roles that
  exist. `owner`/`admin` differ from `member` only in a handful of privileged actions
  (delete matter-linked records, manage invites, view the tenant's own audit log).

### Aspirational — **not implemented**, do not write test cases against these

- **"Advocate" as a distinct role** — every tenant member (owner/admin/member) already has
  full read/write access to their tenant's matters, hearings, documents, etc. There's no
  separate "Advocate" designation layered on top of the 3 real roles.
- **Junior** — no such role or permission tier exists in the schema or RLS.
- **Clerk** — no such role or permission tier exists in the schema or RLS.
- **Client** — no client-facing login or self-service portal exists anywhere in the codebase.
  The "Clients" module is entirely advocate-side (a contact-record CRM); a client cannot sign
  in to LexDiary today, view their own case status, or receive an in-app notification.

### A caveat on "Notifications"

The bell icon in the app header (`AppShell.tsx`) is **decorative only** — it has no `onClick`
handler, no dropdown, and its "unread" dot is a static element, not driven by any data. There
is no notifications table and nothing to configure. **Do not write CRUD/RBAC/functional test
cases for "Notifications"** — there is nothing behind it yet to validate.

---

## Why this document exists

Section 2 of the Gate 1 plan (the master validation matrix) is only meaningful if every row
in it maps to something real. A matrix row for "Client (RBAC)" or "Junior (RBAC)" would
silently test nothing and produce a false sense of coverage. This baseline is what the QA
plan is validated against — if a future feature (a real notifications system, a client
portal, junior/clerk roles) gets built, update this document first, then extend the QA plan
to match.
