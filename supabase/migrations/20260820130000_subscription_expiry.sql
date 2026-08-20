-- grant_housekeeping.sql (20260820041000) revoked ALL on every listed table
-- and re-granted only what its author believed each role's policies used —
-- but got tenants/licenses wrong: it re-granted SELECT only, when the
-- "Platform admins manage tenants/licenses" policies (FOR ALL, gated on
-- is_platform_admin()) need INSERT/UPDATE/DELETE too. That silently broke
-- the entire /admin console (create tenant, change status, change plan,
-- delete tenant all started failing with permission-denied) — RLS was never
-- the problem, the table-level grant never reached RLS at all. Restoring the
-- original grant from multi_tenant_foundation.sql; RLS still confines every
-- row-level write to an actual platform admin.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;

-- A paid plan currently has no expiry at all: trial_expired() only fires for
-- plan = 'trial', so once a chamber moves to solo_basic/solo_pro/chamber
-- nothing ever blocks it again even if the subscription lapses. Billing here
-- is manually reconciled (Razorpay link -> admin flips the plan), so there is
-- no webhook to catch a missed renewal — this gives paid plans the same
-- "goes read-only" protection trial already has, driven off
-- licenses.current_period_end (a column that already existed but was never
-- set or checked).

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS billing_cadence TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_cadence IN ('monthly', 'annual'));
COMMENT ON COLUMN public.licenses.billing_cadence IS
  'How the current paid period was billed. Drives the length of the next renewal and the invoiced amount (annual = 10x monthly, 2 months free).';

-- A few days' slack after current_period_end before writes are blocked —
-- manual reconciliation has real lag (advocate pays, emails a reference,
-- admin gets to it), and cutting off the instant the date passes would
-- punish a chamber for that lag rather than for not paying.
CREATE OR REPLACE FUNCTION public.subscription_grace_days()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 3; $$;
REVOKE ALL ON FUNCTION public.subscription_grace_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_grace_days() TO authenticated;

-- Has this tenant's paid subscription lapsed (past its renewal date, plus
-- grace)? Trial licences are excluded here — that's trial_expired()'s job —
-- and a licence with no current_period_end set (e.g. never activated) is
-- never treated as expired by this check.
CREATE OR REPLACE FUNCTION public.subscription_expired(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT l.plan <> 'trial'
       AND l.status <> 'cancelled'
       AND l.current_period_end IS NOT NULL
       AND l.current_period_end + (public.subscription_grace_days() || ' days')::interval <= now()
       FROM public.licenses l WHERE l.tenant_id = p_tenant_id),
    false);
$$;
REVOKE ALL ON FUNCTION public.subscription_expired(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_expired(UUID) TO authenticated;

-- Same read-only treatment as a cancelled licence or an expired trial, just
-- for a lapsed paid renewal.
CREATE OR REPLACE FUNCTION public.enforce_tenant_writable() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_tenant UUID := COALESCE(NEW.tenant_id, OLD.tenant_id);
  lic_status TEXT;
BEGIN
  SELECT status INTO lic_status FROM public.licenses WHERE tenant_id = target_tenant;

  IF lic_status = 'cancelled' THEN
    RAISE EXCEPTION 'This chamber''s subscription is cancelled — the account is read-only. Reactivate the subscription to make changes.'
      USING ERRCODE = '42501';
  END IF;

  IF public.trial_expired(target_tenant) THEN
    RAISE EXCEPTION 'Your % day free trial has ended. Your data is safe and still readable — choose a plan to start adding to it again.', public.trial_period_days()
      USING ERRCODE = '42501';
  END IF;

  IF public.subscription_expired(target_tenant) THEN
    RAISE EXCEPTION 'Your subscription has lapsed. Your data is safe and still readable — renew your plan to start adding to it again.'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.enforce_tenant_writable() FROM PUBLIC, anon, authenticated;

-- Surface the renewal date, cadence and lapsed state to the UI alongside the
-- rest of the entitlements.
DROP FUNCTION IF EXISTS public.my_entitlements();
CREATE FUNCTION public.my_entitlements()
RETURNS TABLE(
  plan TEXT, status TEXT, seats INTEGER, seats_included INTEGER,
  seats_used INTEGER, extra_seats INTEGER, extra_seat_price_inr INTEGER,
  base_price_inr INTEGER, monthly_total_inr INTEGER,
  ocr_enabled BOOLEAN, whatsapp_enabled BOOLEAN, team_enabled BOOLEAN,
  matters_limit INTEGER, clients_limit INTEGER, storage_limit_mb INTEGER,
  trial_ends_at TIMESTAMPTZ, trial_days_left INTEGER, trial_expired BOOLEAN,
  trial_period_days INTEGER,
  billing_cadence TEXT, current_period_end TIMESTAMPTZ,
  subscription_expired BOOLEAN, subscription_grace_days_left INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_id UUID;
  l RECORD;
  p TEXT;
  included INTEGER;
  used INTEGER;
  extra INTEGER;
  seat_price INTEGER;
BEGIN
  SELECT pr.tenant_id INTO t_id FROM public.profiles pr WHERE pr.id = auth.uid();
  IF t_id IS NULL THEN RETURN; END IF;

  SELECT * INTO l FROM public.licenses li WHERE li.tenant_id = t_id;
  IF NOT FOUND THEN RETURN; END IF;

  p := COALESCE(l.plan, 'trial');
  included := public.plan_limit(p, 'seats_included');
  seat_price := public.plan_price_inr(p, 'extra_seat');

  -- tenant_invites.status must be table-qualified: this function has an OUT
  -- parameter also named "status", and an unqualified reference is ambiguous.
  SELECT
    (SELECT count(*) FROM public.profiles pr WHERE pr.tenant_id = t_id) +
    (SELECT count(*) FROM public.tenant_invites ti WHERE ti.tenant_id = t_id AND ti.status = 'pending')
  INTO used;

  extra := GREATEST(COALESCE(l.seats, included) - included, 0);

  RETURN QUERY SELECT
    p,
    l.status,
    l.seats,
    included,
    used,
    extra,
    seat_price,
    public.plan_price_inr(p, 'base'),
    public.plan_price_inr(p, 'base') + (extra * COALESCE(seat_price, 0)),
    public.plan_feature(p, 'ocr'),
    public.plan_feature(p, 'whatsapp') AND COALESCE((l.integrations ->> 'whatsapp_enabled')::boolean, false),
    public.plan_feature(p, 'team'),
    public.plan_limit(p, 'matters'),
    public.plan_limit(p, 'clients'),
    public.plan_limit(p, 'storage_mb'),
    l.trial_ends_at,
    CASE WHEN l.plan = 'trial' AND l.trial_ends_at IS NOT NULL
         THEN GREATEST(CEIL(EXTRACT(EPOCH FROM (l.trial_ends_at - now())) / 86400)::INTEGER, 0)
         ELSE NULL END,
    public.trial_expired(t_id),
    public.trial_period_days(),
    l.billing_cadence,
    l.current_period_end,
    public.subscription_expired(t_id),
    CASE WHEN l.plan <> 'trial' AND l.current_period_end IS NOT NULL
         THEN GREATEST(CEIL(EXTRACT(EPOCH FROM (
                (l.current_period_end + (public.subscription_grace_days() || ' days')::interval) - now()
              )) / 86400)::INTEGER, 0)
         ELSE NULL END;
END; $$;
REVOKE ALL ON FUNCTION public.my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated;

