-- e-Courts becomes a paid-plan feature, and repeat lookups stop costing money.
--
-- Why: every lookup through supabase/functions/ecourts-lookup is a billed
-- call to a third-party vendor (there is no free government API — see
-- supabase/functions/_shared/ecourts.ts). Two gaps made that risky once the
-- Free plan existed (20260915090000_free_forever_plan.sql):
--
--   1. The only gate was licenses.integrations."ecourts_enabled", a manual
--      per-chamber switch. It defaults to false, so nothing has been spent —
--      but nothing except that default stopped a Free chamber being given
--      lookups by accident, at 5 billed calls a day, forever.
--   2. Nothing de-duplicated lookups: the same CNR fetched twice in a minute
--      was two paid calls. ecourts_sync_log already stores the full snapshot,
--      so the second call was paying for data the database already had.
--
-- After this migration:
--   * plan_feature(plan, 'ecourts') is true only for an active trial and the
--     paid plans. Free is false, so ecourts_lookups_per_day is 0 for Free and
--     increment_ecourts_usage() refuses with an upgrade message. The
--     integrations switch still applies on top — both must allow it.
--   * The edge function serves a snapshot from ecourts_sync_log when one for
--     the same tenant and CNR is under 24 hours old, and only then spends a
--     vendor call. The index below is what makes that lookup cheap.

--------------------------------------------------------------- plan feature
CREATE OR REPLACE FUNCTION public.plan_feature(p_plan text, p_feature text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_feature
    WHEN 'ocr'      THEN p_plan IN ('trial', 'solo_pro', 'chamber')
    WHEN 'whatsapp' THEN p_plan IN ('trial', 'solo_pro', 'chamber')
    -- 'trial' included so the Chamber tier can actually be evaluated.
    WHEN 'team'     THEN p_plan IN ('trial', 'chamber')
    -- Every e-Courts lookup is billed by the vendor, so it is never part of
    -- the Free plan. Keep in sync with plan_limit(..., 'ecourts_lookups_per_day').
    WHEN 'ecourts'  THEN p_plan IN ('trial', 'solo_basic', 'solo_pro', 'chamber')
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.plan_limit(p_plan text, p_resource text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_resource
    WHEN 'matters' THEN
      CASE p_plan WHEN 'free' THEN 25 WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 50 WHEN 'solo_pro' THEN 200 ELSE NULL END
    WHEN 'clients' THEN
      CASE p_plan WHEN 'free' THEN 25 WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 50 WHEN 'solo_pro' THEN 200 ELSE NULL END
    WHEN 'ai_calls_per_day' THEN
      CASE p_plan WHEN 'free' THEN 5 WHEN 'trial' THEN 20 WHEN 'solo_basic' THEN 40 WHEN 'solo_pro' THEN 150 WHEN 'chamber' THEN 400 ELSE 5 END
    WHEN 'storage_mb' THEN
      CASE p_plan WHEN 'free' THEN 100 WHEN 'trial' THEN 100 WHEN 'solo_basic' THEN 1000 WHEN 'solo_pro' THEN 5000 WHEN 'chamber' THEN 25000 ELSE 100 END
    WHEN 'seats_included' THEN
      CASE p_plan WHEN 'chamber' THEN 2 ELSE 1 END
    WHEN 'whatsapp_messages_per_day' THEN
      CASE p_plan WHEN 'free' THEN 0 WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 20 WHEN 'solo_pro' THEN 50 WHEN 'chamber' THEN 150 ELSE 0 END
    -- Free is 0: a vendor-billed call is not part of a free-forever plan.
    WHEN 'ecourts_lookups_per_day' THEN
      CASE p_plan WHEN 'free' THEN 0 WHEN 'trial' THEN 5 WHEN 'solo_basic' THEN 10 WHEN 'solo_pro' THEN 30 WHEN 'chamber' THEN 100 ELSE 0 END
    ELSE NULL
  END;
$function$;
COMMENT ON FUNCTION public.plan_limit IS 'NULL return means unlimited for that plan/resource; 0 means the plan does not include it at all.';

------------------------------------------------------------ feature message
CREATE OR REPLACE FUNCTION public.assert_feature(p_feature text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lic_plan TEXT;
  wa_flag BOOLEAN;
BEGIN
  SELECT public.effective_plan(l.plan, l.trial_ends_at),
         COALESCE((l.integrations ->> 'whatsapp_enabled')::boolean, false)
    INTO lic_plan, wa_flag
    FROM public.licenses l
    WHERE l.tenant_id = public.current_tenant_id();

  lic_plan := COALESCE(lic_plan, 'free');

  IF NOT public.plan_feature(lic_plan, p_feature) THEN
    IF p_feature = 'ocr' THEN
      RAISE EXCEPTION 'Document OCR is part of the Solo Pro and Chamber plans. Upgrade to scan documents.'
        USING ERRCODE = '42501';
    ELSIF p_feature = 'whatsapp' THEN
      RAISE EXCEPTION 'WhatsApp messaging is part of the Solo Pro and Chamber plans.'
        USING ERRCODE = '42501';
    ELSIF p_feature = 'team' THEN
      RAISE EXCEPTION 'Team management is part of the Chamber plan.'
        USING ERRCODE = '42501';
    ELSIF p_feature = 'ecourts' THEN
      RAISE EXCEPTION 'e-Courts case lookup comes with a paid plan — it is not part of the Free plan.'
        USING ERRCODE = '42501';
    ELSE
      RAISE EXCEPTION 'Your plan does not include %.', p_feature USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_feature = 'whatsapp' AND NOT wa_flag THEN
    RAISE EXCEPTION 'WhatsApp is not switched on for this chamber yet.' USING ERRCODE = '42501';
  END IF;
END; $function$;

------------------------------------------------------------- usage counter
-- Same shape as before, with one change: a plan whose cap is 0 is refused
-- with an upgrade message instead of the generic "cap exceeded", and the
-- counter row is not written for a call that was never allowed.
CREATE OR REPLACE FUNCTION public.increment_ecourts_usage()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_count INTEGER;
  v_tenant_id UUID := public.current_tenant_id();
  tenant_plan TEXT;
  daily_cap INTEGER;
  ist_date DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.effective_plan(plan, trial_ends_at) INTO tenant_plan
    FROM public.licenses WHERE tenant_id = v_tenant_id;
  tenant_plan := COALESCE(tenant_plan, 'free');
  daily_cap := public.plan_limit(tenant_plan, 'ecourts_lookups_per_day');

  IF daily_cap IS NOT NULL AND daily_cap <= 0 THEN
    RAISE EXCEPTION 'e-Courts case lookup comes with a paid plan — it is not part of the % plan.', tenant_plan
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ecourts_usage_daily (tenant_id, usage_date, lookup_count)
  VALUES (v_tenant_id, ist_date, 1)
  ON CONFLICT (tenant_id, usage_date)
  DO UPDATE SET lookup_count = public.ecourts_usage_daily.lookup_count + 1
  RETURNING lookup_count INTO new_count;

  IF daily_cap IS NOT NULL AND new_count > daily_cap THEN
    RAISE EXCEPTION 'e-Courts daily lookup cap (%) exceeded for this chamber', daily_cap
      USING ERRCODE = '22023';
  END IF;

  RETURN new_count;
END; $function$;

--------------------------------------------------------------- cache index
-- The cache read is "newest successful snapshot for this tenant and CNR",
-- which the existing (tenant_id, created_at DESC) index cannot serve without
-- scanning every lookup the chamber has ever made.
CREATE INDEX IF NOT EXISTS ecourts_sync_log_tenant_cnr_idx
  ON public.ecourts_sync_log (tenant_id, cnr, created_at DESC)
  WHERE status = 'success';

------------------------------------------------------------------ entitlements
-- Surface the two e-Courts facts the app needs: whether the plan includes
-- lookups at all, and how many a day. Added as new OUT columns at the end,
-- so existing callers that select by name keep working.
DROP FUNCTION IF EXISTS public.my_entitlements();
CREATE OR REPLACE FUNCTION public.my_entitlements()
 RETURNS TABLE(plan text, status text, seats integer, seats_included integer, seats_used integer, extra_seats integer, extra_seat_price_inr integer, base_price_inr integer, modules_total_inr integer, monthly_total_inr integer, ocr_enabled boolean, whatsapp_enabled boolean, team_enabled boolean, matters_limit integer, clients_limit integer, storage_limit_mb integer, trial_ends_at timestamp with time zone, trial_days_left integer, trial_expired boolean, trial_period_days integer, billing_cadence text, current_period_end timestamp with time zone, subscription_expired boolean, subscription_grace_days_left integer, ai_drafting_enabled boolean, ai_assistant_enabled boolean, matter_intelligence_enabled boolean, matters_enabled boolean, clients_enabled boolean, diary_enabled boolean, documents_enabled boolean, billing_enabled boolean, ecourts_enabled boolean, ecourts_lookups_per_day integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t_id UUID;
  l RECORD;
  p TEXT;
  included INTEGER;
  used INTEGER;
  extra INTEGER;
  seat_price INTEGER;
  base_price INTEGER;
  modules_total INTEGER;
  is_trial BOOLEAN;
  is_free BOOLEAN;
  integrations JSONB;
BEGIN
  SELECT pr.tenant_id INTO t_id FROM public.profiles pr WHERE pr.id = auth.uid();
  IF t_id IS NULL THEN RETURN; END IF;

  SELECT * INTO l FROM public.licenses li WHERE li.tenant_id = t_id;
  IF NOT FOUND THEN RETURN; END IF;

  p := public.effective_plan(l.plan, l.trial_ends_at);
  is_trial := (p = 'trial');
  is_free := (p = 'free');
  integrations := COALESCE(l.integrations, '{}'::jsonb);
  included := public.plan_limit(p, 'seats_included');
  seat_price := COALESCE(l.legacy_extra_seat_price_inr, public.plan_price_inr(p, 'extra_seat'));
  base_price := COALESCE(l.legacy_base_price_inr, public.plan_price_inr(p, 'base'));

  modules_total :=
    (CASE WHEN COALESCE((integrations ->> 'ai_drafting_enabled')::boolean, false)
          THEN public.module_price_inr('ai_drafting') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'ai_assistant_enabled')::boolean, false)
          THEN public.module_price_inr('ai_assistant') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'matter_intelligence_enabled')::boolean, false)
          THEN public.module_price_inr('matter_intelligence') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'matters_enabled')::boolean, false)
          THEN public.module_price_inr('matters') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'clients_enabled')::boolean, false)
          THEN public.module_price_inr('clients') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'diary_enabled')::boolean, false)
          THEN public.module_price_inr('diary') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'documents_enabled')::boolean, false)
          THEN public.module_price_inr('documents') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'billing_enabled')::boolean, false)
          THEN public.module_price_inr('billing') ELSE 0 END);

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
    base_price,
    modules_total,
    base_price + (extra * COALESCE(seat_price, 0)) + modules_total,
    public.plan_feature(p, 'ocr'),
    public.plan_feature(p, 'whatsapp') AND COALESCE((integrations ->> 'whatsapp_enabled')::boolean, false),
    public.plan_feature(p, 'team'),
    public.plan_limit(p, 'matters'),
    public.plan_limit(p, 'clients'),
    public.plan_limit(p, 'storage_mb'),
    CASE WHEN is_trial THEN l.trial_ends_at ELSE NULL END,
    CASE WHEN is_trial AND l.trial_ends_at IS NOT NULL
         THEN GREATEST(CEIL(EXTRACT(EPOCH FROM (l.trial_ends_at - now())) / 86400)::INTEGER, 0)
         ELSE NULL END,
    false,
    public.trial_period_days(),
    l.billing_cadence,
    l.current_period_end,
    public.subscription_expired(t_id),
    CASE WHEN p NOT IN ('trial', 'free') AND l.current_period_end IS NOT NULL
         THEN GREATEST(CEIL(EXTRACT(EPOCH FROM (
                (l.current_period_end + (public.subscription_grace_days() || ' days')::interval) - now()
              )) / 86400)::INTEGER, 0)
         ELSE NULL END,
    is_trial OR COALESCE((integrations ->> 'ai_drafting_enabled')::boolean, false),
    is_trial OR is_free OR COALESCE((integrations ->> 'ai_assistant_enabled')::boolean, false),
    is_trial OR is_free OR COALESCE((integrations ->> 'matter_intelligence_enabled')::boolean, false),
    is_trial OR is_free OR COALESCE((integrations ->> 'matters_enabled')::boolean, false),
    is_trial OR is_free OR COALESCE((integrations ->> 'clients_enabled')::boolean, false),
    is_trial OR is_free OR COALESCE((integrations ->> 'diary_enabled')::boolean, false),
    is_trial OR COALESCE((integrations ->> 'documents_enabled')::boolean, false),
    is_trial OR COALESCE((integrations ->> 'billing_enabled')::boolean, false),
    -- Both gates must allow it: the plan, and the per-chamber switch.
    public.plan_feature(p, 'ecourts') AND COALESCE((integrations ->> 'ecourts_enabled')::boolean, false),
    public.plan_limit(p, 'ecourts_lookups_per_day');
END; $function$;

REVOKE ALL ON FUNCTION public.my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated;
