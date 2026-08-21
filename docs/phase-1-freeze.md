# 🔒 LexDiary Phase-1 Product Freeze

**Status:** Draft — captures the architecture as built through K1–K3 (shipped, deployed,
live-verified) and K4 (implemented, **PARTIAL**: live verification pending the
`ai_messages.sources` migration deploy). This document should be revisited and its
K4 caveats cleared once K4 reaches PASS.

## What "freeze" means here

This freezes the **functional architecture** of the ten foundations below, not development.
K5 and onward are expected to **extend** these systems — add a new consumer, a new edge
function, a new governance flag — not redesign them. If a future feature genuinely cannot
be built without changing one of these foundations, that's a decision to surface and discuss
explicitly, not something to route around silently.

Everything below reflects what actually exists in the codebase today, not the aspirational
shape of any individual feature spec. Two corrections against assumptions made in the K3/K4
specs are called out explicitly (RBAC roles, and the `matter_ref` limitation) because future
work should build against the real system, not the assumed one.

---

## 1. Matter model

`matters` is the central object every other domain table hangs off of, directly or via a
text-matched title.

- Columns: `id, tenant_id, title, client_name, case_number, court, status, opposing_party, filed_date, notes, created_by, created_at, updated_at`.
- `status` is a hard 3-value enum: `active | closed | archived`. There is no richer workflow.
- There is no `parties` relation — `client_name` and `opposing_party` are the entire party
  model (plain text columns, not a joined table). A future feature needing multi-party
  support (co-plaintiffs, multiple respondents) requires new schema, not a query change.
- Server functions: `listMatters`, `getMatter`, `createMatter` (`src/lib/matters.functions.ts`).
  No update or delete function exists yet — matters can only be created and listed/fetched.

**Frozen:** the column set, the 3-value status enum, and the fact that matters are the
tenant-scoped root every feature keys off of by `id` (preferred) or `title` (fallback, see §9).

## 2. Hearing model

`hearings` is the second foundation K1 and K2 both depend on directly.

- Columns: `id, tenant_id, matter_id (nullable FK), matter_title (NOT NULL), court, hearing_date, hearing_time, purpose, status, created_by, created_at, updated_at`, plus K2's additions `cnr, court_hall, bench, cause_list_record_id`.
- `status` is a hard 4-value enum: `confirmed | cause_list_awaited | adjourned | completed`.
- **Known structural quirk, load-bearing, not a bug to fix reflexively:** `createHearing` never
  populates `matter_id` — only `matter_title`. Every read path that joins hearings to matters
  (K1's Morning Brief, K3's timeline, K4's retrieval) therefore does an id-then-title fallback
  join, matching by `matter_id` first and `matter_title` second. K2's cause-list reconciliation
  is the *only* write path that populates `matter_id` reliably (when a listing is matched).
- There is no hearing-status *history* — only the current value. "What did the previous
  hearing say" answers come from separate hearing rows with earlier dates, not from a status
  audit trail on one row.

**Frozen:** the 4-value status enum, the dual-key (id-or-title) join convention, and the
absence of per-hearing status history — any feature wanting "when did status change" needs
new schema, not a new query.

## 3. Cause-list architecture

K2's four tables are the tenant's court-intelligence foundation:

- `cause_list_sources` — one row per tracked court/bench feed (`source_type` currently only
  `manual_import`).
- `cause_list_records` — one row per ingested listing *per ingestion*; re-ingestion never
  overwrites, it chains forward via `superseded_by`.
- `cause_list_matches` — the record→matter link (`UNIQUE(record_id)`, `confidence`, `status`
  in `matched | needs_review | unmatched | rejected`). A matter can accumulate several match
  rows over time as new versions get re-matched.
- `cause_list_changes` — the diff/history log (`change_type` in `new_listing | date_changed |
  serial_changed | hall_changed | bench_changed | stage_changed | unchanged | removed`).

Matching (`src/lib/cause-list-matching.ts`) and change detection
(`src/lib/cause-list-changes.ts`) are pure, deterministic, explainable functions — **no AI
anywhere in this pipeline**. K3's timeline and K4's retrieval both read this log directly;
neither re-implements matching or diffing.

**Frozen:** the four-table shape, the version-chain-via-`superseded_by` model, and the rule
that cause-list intelligence is deterministic — any feature touching cause-list data reads
`cause_list_matches`/`cause_list_changes`, it never re-derives a second notion of "changed."

## 4. Matter Timeline

K3's timeline is the historical source of truth for "what happened in this matter" — and it
is **computed on read, not stored**. `buildMatterTimeline()` (`src/lib/matter-timeline.ts`) is
a pure function over a `MatterContext`; there is no `matter_timeline_events` table. This was a
deliberate choice to avoid duplicating source records — every event traces back to a real row
(a hearing, a cause-list change, a document, or the matter itself) via `sourceType`/`sourceId`.

Event types implemented: Matter Created, Hearing (labeled by current status), Cause List
(every non-`unchanged` change type), Document Added. Explicitly **not** implemented, by
design: Matter Status Changed (no diff data exists, see §2), Task/Deadline events (no data
model exists — this is K5's problem to solve, not to fake here), Payment/Expense events
(`invoices`/`time_entries` do carry `matter_id` and could feed this later — scoped out, not
forgotten).

**Frozen:** timeline-as-computed-view (not a stored log), and the four implemented event
types. A future feature needing a *stored*, independently-queryable event log (e.g. for
analytics across many matters) is a new capability, not an extension of this one.

## 5. MatterContextService

`getMatterContext(matterId)` (`src/lib/matter-context.functions.ts`) is **the** authorized,
tenant-scoped aggregation point for "what does LexDiary know about this matter" — matter +
hearings + cause-list history + document metadata + the per-feature AI-enabled flags. K4
reuses it as-is and adds exactly one sibling function (`getMatterDocumentTexts`, for document
full text, kept separate so the base context stays lean) rather than re-querying the same
tables a second way.

**Frozen:** this is the AI context foundation. K5 (Deadline Intelligence), K10 (Hearing
Preparation), and any other matter-grounded AI feature must call this service, not
re-aggregate matters/hearings/cause-list/documents independently. Extend its return shape
when a new feature needs one more field; don't build a parallel aggregator.

## 6. AI governance

One consistent, per-tenant, per-feature model, introduced in K1 and reused unchanged through
K4:

```
Superadmin (/admin/settings/integrations)
  → tenant's licenses.integrations JSONB (one boolean key per AI feature)
    → checked client-side (server function reads it, decides whether to show the UI)
      → re-checked server-side, inside the edge function itself (real enforcement)
```

Keys today: `whatsapp_enabled`, `ai_morning_brief_enabled`, `cause_list_enabled`,
`ai_matter_intelligence_enabled`, `ai_case_intelligence_enabled`. There is **no centralized
feature-registry table** — it's one JSONB blob per tenant on `licenses`, merge-written (never
replaced wholesale, or one toggle would reset the others).

**Frozen:** every new AI capability gets one more boolean key in this same JSONB, double-
enforced the same way. Never a second governance table, never a UI-only toggle.

## 7. Tenant isolation

Treated as production-critical, enforced almost entirely by **Postgres RLS**, not application
code:

- `current_tenant_id()` — resolves the caller's tenant from `profiles`, used in nearly every
  table's SELECT/INSERT policy.
- `is_tenant_admin(tenant_id)` — gates privileged in-tenant actions.
- `is_platform_admin(uid)` — gates every Superadmin-only policy.
- `tenant_id` is **never** accepted as client input on any insert path — always DB-derived
  (column default or `BEFORE INSERT` trigger).
- Server functions (TanStack) and edge functions (Deno) both forward the caller's own JWT and
  rely on this RLS, rather than re-implementing authorization in application code.

**Frozen:** this is the single mechanism every feature — present and future — must rely on
for tenant isolation. A feature that needs service-role access to bypass RLS is a red flag,
not a normal implementation detail.

## 8. RBAC

**Correction against the K3/K4 specs, which assumed richer roles:** only three tenant roles
exist today — `owner | admin | member` (checked via `profiles.tenant_role`). There is **no**
`junior`, `clerk`, or `client` role anywhere in the schema. Platform-level access is a
separate concept (`platform_admins` table, `is_platform_admin()`), not a tenant role.

One consequence worth flagging: `ai_conversations`/`ai_messages` RLS is **tenant-wide read**,
not per-user — any member of a chamber can see any colleague's AI conversations. This is a
deliberate "shared chamber" model already in place before K4, not something K4 introduced.

**Frozen:** the 3-role model and the shared-conversation-visibility model. A feature that
needs `junior`/`clerk`/`client`-level distinctions (K8 Junior/Clerk Command Center is the
obvious future candidate) needs new schema and new RLS policies — that's real, net-new work,
not a gap in an existing role system.

## 9. Document architecture

**Correction / explicit limitation, carried forward rather than silently fixed across K1–K4:**
`ai_documents.matter_ref` is a **free-text column, not a foreign key**. Every feature that
associates a document with a matter — K1's Morning Brief, K3's timeline, K4's retrieval — does
it via **exact string equality** against `matters.title`, set by the document-upload UI
choosing a matter from a `<select>` populated with matter titles. `ai_conversations.matter_ref`
and `ai_drafts.matter_ref` follow the identical convention.

Practical implications: renaming a matter's title silently orphans its previously-uploaded
documents/conversations from that point of view (no cascade, no re-link). `raw_text` is
truncated to 60,000 characters at analysis time (`ai-analyze-document/index.ts`) — not a
guaranteed-complete document text for very long filings.

**Frozen (as a known limitation, not a design to celebrate):** every feature must reuse this
exact-match convention rather than inventing a fuzzier one (a fuzzy match risks attaching the
wrong matter's documents). If `ai_documents` ever gets a real `matter_id` FK, that's a
deliberate, cross-cutting migration project — explicitly out of scope for any single K-feature
to take on as a side effect (K3's spec said this outright; it still holds).

## 10. AI service architecture

One shape, reused by every AI feature (`ai-morning-brief`, `ai-matter-summary`, `ai-ask-case`,
and the older `ai-assistant`/`ai-analyze-document`/`ai-generate-draft`):

```
auth (JWT forwarded, RLS-scoped client)
  → governance check (licenses.integrations flag)
    → quota (enforceUsageQuota() → increment_ai_usage() RPC, per-user daily limit by plan)
      → prompt (LEGAL_SYSTEM_PROMPT + grounding rules + structured facts, never raw DB access
        for matter facts inside the edge function itself — the client pre-aggregates via
        MatterContextService and forwards only what it's already authorized to read)
        → chatComplete() (OpenAI-compatible gateway, model/provider centralized in
          _shared/ai.ts)
          → parse (extractJson, validated shape)
            → structured response (K3/K4 additionally: citations generated by the retrieval
              layer, never parsed out of the model's free text)
```

Provider/model config is centralized in `supabase/functions/_shared/ai.ts`
(`AI_GATEWAY_URL`/`AI_GATEWAY_MODEL` env vars) — there is no per-feature provider
configuration. Failure handling is uniform: every AI feature has a deterministic fallback or
an honest "unavailable" message, and the underlying data (timeline, hearings, documents) never
depends on the AI call succeeding.

**Frozen:** this pipeline shape. A new AI feature is a new edge function following this exact
sequence, not a new pattern.

---

## K4 status note

K4 (Ask My Case) is implemented against all ten foundations above exactly as described, with
one net-new, additive piece: `ai_messages.sources JSONB` (migration written, not yet applied).
Until that migration is deployed and K4 is live-verified (see the K4 final report), treat its
row in this document as provisional — the architecture it depends on is frozen and stable;
K4's own PASS status is not yet confirmed.

---

## Final recommendation: freeze at K4 🔒

Stop expanding the feature list here. The next development cycle should be:

> **"Make K1–K4 exceptionally reliable, secure, fast and delightful."**

That's a stronger Phase-1 MVP for demos, pilots, and early commercial validation than
continuing to add killer features on top of a foundation that hasn't yet been pressure-tested.
"We shipped 4 features and hardened them" is a better story — and a safer one to put in front
of a paying pilot customer — than "we shipped 12 features," if the first 4 haven't been proven
reliable under real use.

Because the Superadmin Portal already exists, this freeze point is also the right moment to
validate the **complete SaaS control plane end-to-end**, not just the advocate-facing features:

```
Superadmin → Tenant → Feature Governance → Diary → AI → Audit/Monitoring
```

That validation — proving the whole chain works, not just each link in isolation — is a more
meaningful milestone than any individual feature count.
