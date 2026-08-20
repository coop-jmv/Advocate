-- A real 15-day free trial, with no card required.
--
-- Until now a new chamber got plan='trial'/status='trialing' with no end date,
-- so a trial never actually ended. This gives the trial a concrete expiry,
-- defaults it to 15 days, and makes expiry mean something: an expired trial
-- goes read-only (the same treatment a cancelled licence already gets) rather
-- than silently continuing forever.
--
-- No payment details are collected anywhere in this flow — signing up creates
-- the tenant and starts the clock, and nothing asks for a card until the
-- chamber chooses a paid plan.

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- enforce_plan_seat_floor() rejected any UPDATE on a licence whose seat count
-- already broke the rule — including updates that never touched seats, like
-- the trial backfill below. That made legacy rows permanently un-editable.
-- Only judge the seat count when it is actually being set or changed.
CREATE OR REPLACE FUNCTION public.enforce_plan_seat_floor() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  included INTEGER := public.plan_limit(NEW.plan, 'seats_included');
  seats_changed BOOLEAN := TG_OP = 'INSERT'
    OR NEW.seats IS DISTINCT FROM OLD.seats
    OR NEW.plan IS DISTINCT FROM OLD.plan;
BEGIN
  IF NOT seats_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.seats < included THEN
    NEW.seats := included;
  END IF;

  IF NOT public.plan_feature(NEW.plan, 'team') AND NEW.seats > included THEN
    RAISE EXCEPTION 'The % plan is a single-advocate plan. Move to the Chamber plan to add teammates.', NEW.plan
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_plan_seat_floor() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.licenses.trial_ends_at IS
  'When the free trial expires. NULL on paid plans. No card is taken to start a trial.';

-- Length of the free trial in one place, so the signup trigger, the UI copy
-- and any future billing code agree.
CREATE OR REPLACE FUNCTION public.trial_period_days()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 15; $$;
REVOKE ALL ON FUNCTION public.trial_period_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trial_period_days() TO authenticated;

-- Backfill: existing trials get 15 days from when they were created, so an
-- old open-ended trial does not become permanent.
UPDATE public.licenses
   SET trial_ends_at = created_at + (public.trial_period_days() || ' days')::interval
 WHERE plan = 'trial' AND trial_ends_at IS NULL;

-- Paid plans carry no trial expiry.
UPDATE public.licenses SET trial_ends_at = NULL WHERE plan <> 'trial';

-- Keep trial_ends_at consistent with the plan automatically: starting a trial
-- sets the clock, moving to a paid plan clears it.
CREATE OR REPLACE FUNCTION public.sync_trial_window() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.plan = 'trial' THEN
    IF NEW.trial_ends_at IS NULL THEN
      NEW.trial_ends_at := now() + (public.trial_period_days() || ' days')::interval;
    END IF;
  ELSE
    NEW.trial_ends_at := NULL;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_trial_window() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS licenses_trial_window ON public.licenses;
CREATE TRIGGER licenses_trial_window BEFORE INSERT OR UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.sync_trial_window();

-- Has this tenant's trial run out? Paid plans are never "expired" here.
CREATE OR REPLACE FUNCTION public.trial_expired(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT l.plan = 'trial' AND l.trial_ends_at IS NOT NULL AND l.trial_ends_at <= now()
       FROM public.licenses l WHERE l.tenant_id = p_tenant_id),
    false);
$$;
REVOKE ALL ON FUNCTION public.trial_expired(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trial_expired(UUID) TO authenticated;

-- An expired trial becomes read-only, exactly like a cancelled licence: the
-- chamber keeps full access to read and export everything it entered during
-- the trial, but cannot add more until it picks a plan.
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

  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.enforce_tenant_writable() FROM PUBLIC, anon, authenticated;

-- Surface the trial state to the UI alongside the rest of the entitlements.
DROP FUNCTION IF EXISTS public.my_entitlements();
CREATE FUNCTION public.my_entitlements()
RETURNS TABLE(
  plan TEXT, status TEXT, seats INTEGER, seats_included INTEGER,
  seats_used INTEGER, extra_seats INTEGER, extra_seat_price_inr INTEGER,
  base_price_inr INTEGER, monthly_total_inr INTEGER,
  ocr_enabled BOOLEAN, whatsapp_enabled BOOLEAN, team_enabled BOOLEAN,
  matters_limit INTEGER, clients_limit INTEGER, storage_limit_mb INTEGER,
  trial_ends_at TIMESTAMPTZ, trial_days_left INTEGER, trial_expired BOOLEAN,
  trial_period_days INTEGER
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
    public.trial_period_days();
END; $$;
REVOKE ALL ON FUNCTION public.my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated;
