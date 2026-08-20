-- Repricing onto a Solo / Chamber plan model, plus the firm-management
-- pieces that the Chamber tier is actually sold on.
--
-- Published pricing this encodes:
--   Solo Basic   Rs  499 / month   1 seat,  no OCR, no WhatsApp
--   Solo Pro     Rs  799 / month   1 seat,  OCR + WhatsApp
--   Chamber      Rs  999 / month   2 seats included, extra seat Rs 499/month
--
-- Plan names change from the old trial/starter/pro/enterprise set. Old rows
-- are remapped rather than left to fail the new CHECK constraint:
--   starter -> solo_basic, pro -> solo_pro, enterprise -> chamber.
-- 'trial' is kept as the free evaluation plan and deliberately unlocks the
-- paid features so a trialling advocate can actually evaluate OCR/WhatsApp.

------------------------------------------------------------------ plan set
-- Drop the old CHECK before remapping: the new names would otherwise fail
-- the constraint that is still in force at that point.
ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_plan_check;

UPDATE public.licenses SET plan = CASE plan
  WHEN 'starter'    THEN 'solo_basic'
  WHEN 'pro'        THEN 'solo_pro'
  WHEN 'enterprise' THEN 'chamber'
  ELSE plan
END
WHERE plan IN ('starter', 'pro', 'enterprise');

-- A licence carrying more than one seat was, under the old model, a team.
-- Solo plans are single-seat by definition, so those tenants belong on
-- Chamber rather than having seats silently taken away from them.
UPDATE public.licenses SET plan = 'chamber'
WHERE plan IN ('solo_basic', 'solo_pro') AND seats > 1;

ALTER TABLE public.licenses ADD CONSTRAINT licenses_plan_check
  CHECK (plan IN ('trial', 'solo_basic', 'solo_pro', 'chamber'));

------------------------------------------------------------------ limits
-- NULL means unlimited for that plan/resource. seats_included is the number
-- of seats the base price covers; anything beyond it is billable per seat.
CREATE OR REPLACE FUNCTION public.plan_limit(p_plan TEXT, p_resource TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_resource
    WHEN 'matters' THEN
      CASE p_plan WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 50 WHEN 'solo_pro' THEN 200 ELSE NULL END
    WHEN 'clients' THEN
      CASE p_plan WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 50 WHEN 'solo_pro' THEN 200 ELSE NULL END
    WHEN 'ai_calls_per_day' THEN
      CASE p_plan WHEN 'trial' THEN 20 WHEN 'solo_basic' THEN 40 WHEN 'solo_pro' THEN 150 WHEN 'chamber' THEN 400 ELSE 20 END
    WHEN 'storage_mb' THEN
      CASE p_plan WHEN 'trial' THEN 100 WHEN 'solo_basic' THEN 1000 WHEN 'solo_pro' THEN 5000 WHEN 'chamber' THEN 25000 ELSE 100 END
    WHEN 'seats_included' THEN
      CASE p_plan WHEN 'chamber' THEN 2 ELSE 1 END
    ELSE NULL
  END;
$$;
COMMENT ON FUNCTION public.plan_limit IS 'NULL return means unlimited for that plan/resource.';

------------------------------------------------------------------ pricing
-- Rupee pricing lives here so the app, the admin console and any future
-- billing integration read one number rather than three hardcoded copies.
CREATE OR REPLACE FUNCTION public.plan_price_inr(p_plan TEXT, p_component TEXT DEFAULT 'base')
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_component
    WHEN 'base' THEN
      CASE p_plan WHEN 'trial' THEN 0 WHEN 'solo_basic' THEN 499 WHEN 'solo_pro' THEN 799 WHEN 'chamber' THEN 999 ELSE 0 END
    WHEN 'extra_seat' THEN
      CASE p_plan WHEN 'chamber' THEN 499 ELSE NULL END
    ELSE NULL
  END;
$$;
COMMENT ON FUNCTION public.plan_price_inr IS 'Monthly rupee price. component: base | extra_seat. NULL extra_seat means the plan cannot add seats.';
REVOKE ALL ON FUNCTION public.plan_price_inr(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_price_inr(TEXT, TEXT) TO authenticated;

------------------------------------------------------------------ features
-- Feature gating by plan. OCR and WhatsApp are the two paid-tier features
-- in the published pricing; 'team' is what separates Chamber from Solo.
CREATE OR REPLACE FUNCTION public.plan_feature(p_plan TEXT, p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_feature
    WHEN 'ocr'      THEN p_plan IN ('trial', 'solo_pro', 'chamber')
    WHEN 'whatsapp' THEN p_plan IN ('trial', 'solo_pro', 'chamber')
    WHEN 'team'     THEN p_plan = 'chamber'
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.plan_feature(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_feature(TEXT, TEXT) TO authenticated;

------------------------------------------------------- seat floor per plan
-- Chamber is sold as "from Rs 999 with 2 users", so a chamber licence may
-- never be written with fewer than 2 seats, and a solo licence may never be
-- given more than 1 (buying a second seat means moving to Chamber).
CREATE OR REPLACE FUNCTION public.enforce_plan_seat_floor() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  included INTEGER := public.plan_limit(NEW.plan, 'seats_included');
BEGIN
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

DROP TRIGGER IF EXISTS licenses_seat_floor ON public.licenses;
CREATE TRIGGER licenses_seat_floor BEFORE INSERT OR UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_seat_floor();

-- Bring existing chamber licences up to the 2-seat floor.
UPDATE public.licenses SET seats = 2 WHERE plan = 'chamber' AND seats < 2;

------------------------------------------------------- seat cap on invites
-- Replaces the plan-blind version: solo plans cannot invite at all (clearer
-- than letting them hit a seat cap of 1 and reading it as a bug), and the
-- chamber message now names the per-seat price so the upgrade path is
-- obvious from the error alone.
CREATE OR REPLACE FUNCTION public.enforce_seat_limit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lic_plan TEXT;
  seat_cap INTEGER;
  used INTEGER;
BEGIN
  SELECT plan, seats INTO lic_plan, seat_cap FROM public.licenses WHERE tenant_id = NEW.tenant_id;

  IF NOT public.plan_feature(COALESCE(lic_plan, 'trial'), 'team') THEN
    RAISE EXCEPTION 'Your % plan is for a single advocate. Move to the Chamber plan (from Rs 999/month for 2 users) to invite teammates.', COALESCE(lic_plan, 'trial')
      USING ERRCODE = '42501';
  END IF;

  SELECT
    (SELECT count(*) FROM public.profiles WHERE tenant_id = NEW.tenant_id) +
    (SELECT count(*) FROM public.tenant_invites WHERE tenant_id = NEW.tenant_id AND status = 'pending')
  INTO used;

  IF seat_cap IS NOT NULL AND used >= seat_cap THEN
    RAISE EXCEPTION 'This chamber has used all % seats. Add a seat at Rs 499/month, or revoke a pending invite.', seat_cap
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_seat_limit() FROM PUBLIC, anon, authenticated;

------------------------------------------------- effective entitlements RPC
-- Single source of truth for the UI. WhatsApp is the conjunction of the plan
-- allowing it and the platform-admin integration switch being on, so a Solo
-- Basic tenant cannot end up with WhatsApp through a stale admin toggle.
CREATE OR REPLACE FUNCTION public.my_entitlements()
RETURNS TABLE(
  plan TEXT, status TEXT, seats INTEGER, seats_included INTEGER,
  seats_used INTEGER, extra_seats INTEGER, extra_seat_price_inr INTEGER,
  base_price_inr INTEGER, monthly_total_inr INTEGER,
  ocr_enabled BOOLEAN, whatsapp_enabled BOOLEAN, team_enabled BOOLEAN,
  matters_limit INTEGER, clients_limit INTEGER, storage_limit_mb INTEGER
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
  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = auth.uid();
  IF t_id IS NULL THEN RETURN; END IF;

  SELECT * INTO l FROM public.licenses WHERE tenant_id = t_id;
  IF NOT FOUND THEN RETURN; END IF;

  p := COALESCE(l.plan, 'trial');
  included := public.plan_limit(p, 'seats_included');
  seat_price := public.plan_price_inr(p, 'extra_seat');
  SELECT count(*)::INTEGER INTO used FROM public.profiles WHERE tenant_id = t_id;
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
    public.plan_limit(p, 'storage_mb');
END; $$;
REVOKE ALL ON FUNCTION public.my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated;

-- Existing usage summary kept working against the new seat model.
CREATE OR REPLACE FUNCTION public.my_usage_summary()
RETURNS TABLE(plan TEXT, used_storage_mb NUMERIC, storage_limit_mb INTEGER, seats_used INTEGER, seats_limit INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_id UUID;
  lic_plan TEXT;
  lic_seats INTEGER;
BEGIN
  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = auth.uid();
  SELECT l.plan, l.seats INTO lic_plan, lic_seats FROM public.licenses l WHERE l.tenant_id = t_id;
  RETURN QUERY SELECT
    COALESCE(lic_plan, 'trial'),
    public.tenant_storage_estimate_mb(t_id),
    public.plan_limit(COALESCE(lic_plan, 'trial'), 'storage_mb'),
    (SELECT count(*)::INTEGER FROM public.profiles WHERE tenant_id = t_id) +
    (SELECT count(*)::INTEGER FROM public.tenant_invites WHERE tenant_id = t_id AND status = 'pending'),
    lic_seats;
END; $$;

------------------------------------------------------ firm member management
-- Chamber-tier administration: change a teammate's role, and remove a
-- teammate to free their seat. Both are SECURITY DEFINER because they touch
-- privilege-bearing columns that authenticated users are deliberately not
-- granted UPDATE on (see 20260819083613_lock_profile_privilege_columns).
CREATE OR REPLACE FUNCTION public.set_member_role(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_id UUID := public.current_tenant_id();
  target_role TEXT;
  owner_count INTEGER;
BEGIN
  IF NOT public.is_tenant_admin(t_id) THEN
    RAISE EXCEPTION 'Only a chamber owner or admin can change roles.' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'Unknown role: %', p_role USING ERRCODE = '22023';
  END IF;

  SELECT tenant_role INTO target_role FROM public.profiles WHERE id = p_user_id AND tenant_id = t_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'That person is not a member of this chamber.' USING ERRCODE = '42501';
  END IF;

  -- Never leave a chamber without an owner.
  IF target_role = 'owner' AND p_role <> 'owner' THEN
    SELECT count(*) INTO owner_count FROM public.profiles WHERE tenant_id = t_id AND tenant_role = 'owner';
    IF owner_count <= 1 THEN
      RAISE EXCEPTION 'This chamber must keep at least one owner. Promote someone else first.' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.profiles SET tenant_role = p_role WHERE id = p_user_id AND tenant_id = t_id;

  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id, metadata)
  VALUES (t_id, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'role_change', 'profiles', p_user_id, jsonb_build_object('from', target_role, 'to', p_role));
END; $$;
REVOKE ALL ON FUNCTION public.set_member_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_member(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_id UUID := public.current_tenant_id();
  target_role TEXT;
  target_email TEXT;
BEGIN
  IF NOT public.is_tenant_admin(t_id) THEN
    RAISE EXCEPTION 'Only a chamber owner or admin can remove a member.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself from the chamber.' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_role INTO target_role FROM public.profiles WHERE id = p_user_id AND tenant_id = t_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'That person is not a member of this chamber.' USING ERRCODE = '42501';
  END IF;
  IF target_role = 'owner' THEN
    RAISE EXCEPTION 'An owner cannot be removed. Change their role to admin or member first.' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO target_email FROM auth.users WHERE id = p_user_id;

  -- Log before the delete: audit_log.actor/resource FKs are ON DELETE SET
  -- NULL, so writing afterwards would lose the resource_id.
  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id, metadata)
  VALUES (t_id, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'member_removed', 'profiles', p_user_id, jsonb_build_object('email', target_email, 'role', target_role));

  -- The seat belongs to the chamber: removing a teammate revokes their
  -- login entirely rather than leaving an orphaned account behind.
  -- profiles.id -> auth.users is ON DELETE CASCADE.
  DELETE FROM auth.users WHERE id = p_user_id;
END; $$;
REVOKE ALL ON FUNCTION public.remove_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_member(UUID) TO authenticated;

------------------------------------------------------------ seat purchasing
-- Lets a chamber owner/admin set their own seat count (the billable action
-- behind "extra seat Rs 499"). Solo plans are rejected by the seat-floor
-- trigger above, so this needs no plan check of its own.
CREATE OR REPLACE FUNCTION public.set_seat_count(p_seats INTEGER)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_id UUID := public.current_tenant_id();
  in_use INTEGER;
BEGIN
  IF NOT public.is_tenant_admin(t_id) THEN
    RAISE EXCEPTION 'Only a chamber owner or admin can change the seat count.' USING ERRCODE = '42501';
  END IF;

  SELECT
    (SELECT count(*) FROM public.profiles WHERE tenant_id = t_id) +
    (SELECT count(*) FROM public.tenant_invites WHERE tenant_id = t_id AND status = 'pending')
  INTO in_use;

  IF p_seats < in_use THEN
    RAISE EXCEPTION 'You have % seats in use. Remove a member or revoke an invite before reducing to %.', in_use, p_seats
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.licenses SET seats = p_seats WHERE tenant_id = t_id;
END; $$;
REVOKE ALL ON FUNCTION public.set_seat_count(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_seat_count(INTEGER) TO authenticated;
