# Plan verification: Free plan and e-Courts

Reproducible checks for the two plan changes that shipped in #81:

- [`20260915090000_free_forever_plan.sql`](../../migrations/20260915090000_free_forever_plan.sql)
- [`20260916090000_ecourts_paid_feature_and_cache.sql`](../../migrations/20260916090000_ecourts_paid_feature_and_cache.sql)

Same conventions as [`../pass5`](../pass5/README.md): each script runs inside one transaction
that is rolled back, so it leaves no rows behind and is safe to re-run.

**Local instance only.** Both scripts create a fixture user in `auth.users`; never point them at
the linked production project.

```sh
supabase db reset          # applies all migrations from scratch
docker exec -i supabase_db_<project-ref> psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < supabase/tests/plans/free-plan.sql
docker exec -i supabase_db_<project-ref> psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < supabase/tests/plans/ecourts.sql
```

Each script prints `PASS …` notices and exits 0; any failure raises and exits 3.

## `free-plan.sql`

- **F-1** `effective_plan()`: a running trial stays `trial`, an ended trial resolves to `free`, a
  missing plan resolves to `free`, and a paid plan ignores `trial_ends_at`.
- **F-2** Free's limits: 25 matters, 25 clients, 5 AI calls a day, 1 seat, no WhatsApp, OCR or
  team, price 0.
- **F-3** signup creates `plan=free`, `status=active`, 1 seat, no trial end date, WhatsApp off.
- **F-4** Free includes matters, clients, diary, matter intelligence and the AI assistant;
  excludes documents, billing and AI drafting; a purchased add-on still works on top of Free.
- **F-5** the database triggers enforce that: direct `INSERT`s into matters, clients and hearings
  succeed; into invoices and time entries they are refused with `42501`.
- **F-6** the 25-matter cap: the 26th matter is refused.
- **F-7** an ended trial behaves as Free, **stays writable** (it used to go read-only), and is no
  longer a target of `purge_expired_chambers()` (it used to be deleted after 90 days).
- **F-8** a Free chamber never counts as a lapsed subscription.
- **F-9** `my_entitlements()` reports all of the above to the app.

## `ecourts.sql`

Every e-Courts lookup is a billed vendor call, so the checks that matter most prove a Free chamber
cannot spend one.

- **E-1** `plan_feature('ecourts')` is false only for Free; daily caps are free 0, trial 5,
  solo_basic 10, solo_pro 30, chamber 100, and an unknown plan gets 0.
- **E-2** a Free chamber **with the old `ecourts_enabled` switch on** is still refused by
  `increment_ecourts_usage()` (`42501`, with an upgrade message, and no usage row written) and by
  `assert_feature('ecourts')`.
- **E-3** solo_basic gets exactly 10 lookups; the 11th is refused (`22023`) and not counted.
- **E-4** a running trial can look up; the same trial, once ended, cannot.
- **E-5** `my_entitlements().ecourts_enabled` requires **both** the plan and the switch.
- **E-6** the snapshot-cache index exists on `(tenant_id, cnr, created_at DESC)` for successful
  lookups only.

The 24-hour cache itself lives in the `ecourts-lookup` edge function, not in SQL, so it is outside
what these scripts can exercise; E-6 checks the index it depends on.
