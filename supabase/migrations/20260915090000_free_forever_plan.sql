-- Free-forever plan replaces the 15-day trial as the signup default.
--
-- Before: every signup got plan 'trial' (every module unlocked for 15 days),
-- and an expired trial made the whole chamber read-only until it paid —
-- enforce_tenant_writable() raised on every write, and
-- purge_expired_chambers() deleted it 90 days later.
--
-- After:
--   * New signups land on plan 'free' and never expire.
--   * Free includes, forever, for a single advocate: matters, clients, the
--     court diary (cause-list matching + e-Courts lookups) and AI case
--     analysis (matter_intelligence + ai_assistant), under the caps in
--     plan_limit() below. Documents/OCR, billing, AI drafting, WhatsApp and
--     team seats stay paid; any of them can still be switched on per chamber
--     through licenses.integrations."{module}_enabled", exactly as before.
--   * Existing trials keep every module until their trial_ends_at, then
--     behave as Free instead of going read-only. That is resolved at read
--     time by effective_plan(), so no cron job has to flip rows on the day;
--     trials already past their end date are converted outright below.
--   * 'trial' stays a valid plan value (a platform admin can still grant a
--     time-boxed evaluation); nothing creates one automatically any more.
--
-- Every function replaced here was taken from the live definition on the
-- hosted project (pg_get_functiondef) rather than from older migration
-- files, several of which had since been superseded (e.g. plan prices).
--
-- Keep the Free module set in sync with FREE_PLAN_MODULES in
-- src/lib/require-module.ts, supabase/functions/_shared/modules.ts and
-- services/*/src/require-module.ts.

------------------------------------------------------------------ plan set
ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_plan_check;
ALTER TABLE public.licenses ADD CONSTRAINT licenses_plan_check
  CHECK (plan IN ('free', 'trial', 'solo_basic', 'solo_pro', 'chamber'));

ALTER TABLE public.licenses ALTER COLUMN plan SET DEFAULT 'free';

------------------------------------------------------------ helpers
-- The plan a licence is actually entitled to right now: an ended trial is
-- Free, and a chamber with no licence row is treated as Free.
CREATE OR REPLACE FUNCTION public.effective_plan(p_plan TEXT, p_trial_ends_at TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_plan IS NULL THEN 'free'
    WHEN p_plan = 'trial' AND p_trial_ends_at IS NOT NULL AND p_trial_ends_at <= now() THEN 'free'
    ELSE p_plan
  END;
$$;
COMMENT ON FUNCTION public.effective_plan(TEXT, TIMESTAMPTZ) IS
  'Plan a licence is entitled to now: an ended trial resolves to free; a missing plan resolves to free.';

CREATE OR REPLACE FUNCTION public.free_plan_module(p_module TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_module IN ('matters', 'clients', 'diary', 'matter_intelligence', 'ai_assistant');
$$;
COMMENT ON FUNCTION public.free_plan_module(TEXT) IS
  'Modules included on the Free plan at no charge. Keep in sync with FREE_PLAN_MODULES in the TypeScript requireModule() copies.';

------------------------------------------------------------ plan limits
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
    WHEN 'ecourts_lookups_per_day' THEN
      CASE p_plan WHEN 'free' THEN 5 WHEN 'trial' THEN 5 WHEN 'solo_basic' THEN 10 WHEN 'solo_pro' THEN 30 WHEN 'chamber' THEN 100 ELSE 5 END
    ELSE NULL
  END;
$function$;
COMMENT ON FUNCTION public.plan_limit IS 'NULL return means unlimited for that plan/resource.';

-- plan_feature() needs no change: 'free' is in none of its lists, so OCR,
-- WhatsApp and team are all false on Free. plan_price_inr() already returns
-- 0 for any plan it does not name.

------------------------------------------------------------ module gate
CREATE OR REPLACE FUNCTION public.module_enabled(p_tenant_id uuid, p_module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- The inner COALESCE is load-bearing (key missing = not purchased); the
  -- outer one is the deliberate fail-open for a missing licence row. See
  -- 20260908090500_enforce_module_entitlement.sql.
  SELECT COALESCE(
    (SELECT public.effective_plan(l.plan, l.trial_ends_at) = 'trial'
         OR (public.effective_plan(l.plan, l.trial_ends_at) = 'free' AND public.free_plan_module(p_module))
         OR COALESCE((l.integrations ->> (p_module || '_enabled')) = 'true', false)
       FROM public.licenses l
      WHERE l.tenant_id = p_tenant_id),
    true);
$function$;
COMMENT ON FUNCTION public.module_enabled(UUID, TEXT) IS
  'Is a sellable module available to this chamber? An active trial unlocks everything; Free unlocks free_plan_module(); otherwise licenses.integrations."{module}_enabled" must be true. Returns true when no licence row exists (fail-open, so account teardown is never blocked). Keep in sync with requireModule() in src/lib/require-module.ts, supabase/functions/_shared/modules.ts and services/*/src/require-module.ts.';

------------------------------------------------------------ expiry
-- A trial no longer "expires" into read-only; it becomes Free. Kept (always
-- false) because my_entitlements() and the app still read it.
CREATE OR REPLACE FUNCTION public.trial_expired(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT false;
$function$;

CREATE OR REPLACE FUNCTION public.subscription_expired(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT public.effective_plan(l.plan, l.trial_ends_at) NOT IN ('trial', 'free')
       AND l.status <> 'cancelled'
       AND l.current_period_end IS NOT NULL
       AND l.current_period_end + (public.subscription_grace_days() || ' days')::interval <= now()
       FROM public.licenses l WHERE l.tenant_id = p_tenant_id),
    false);
$function$;

CREATE OR REPLACE FUNCTION public.enforce_tenant_writable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_tenant UUID := COALESCE(NEW.tenant_id, OLD.tenant_id);
  lic_status TEXT;
BEGIN
  SELECT status INTO lic_status FROM public.licenses WHERE tenant_id = target_tenant;

  IF lic_status = 'cancelled' THEN
    RAISE EXCEPTION 'This chamber''s subscription is cancelled — the account is read-only. Reactivate the subscription to make changes.'
      USING ERRCODE = '42501';
  END IF;

  IF public.subscription_expired(target_tenant) THEN
    RAISE EXCEPTION 'Your subscription has lapsed. Your data is safe and still readable — renew your plan to start adding to it again.'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $function$;

-- Free chambers are never purged for being "expired trials"; only long-
-- cancelled subscriptions remain eligible.
CREATE OR REPLACE FUNCTION public.purge_expired_chambers(p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_cancel  TIMESTAMPTZ := now() - interval '180 days';
  doomed UUID[];
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a platform administrator can run retention purges.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(l.tenant_id), '{}')
    INTO doomed
    FROM public.licenses l
   WHERE l.status = 'cancelled' AND l.updated_at < cutoff_cancel;

  IF p_dry_run THEN
    RETURN jsonb_build_object('dry_run', true, 'would_delete', array_length(doomed, 1),
                              'cancelled_cutoff', cutoff_cancel);
  END IF;

  DELETE FROM public.tenants WHERE id = ANY(doomed);

  INSERT INTO public.audit_log (actor_user_id, actor_email, action, resource_type, metadata)
  VALUES (auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'retention_purge', 'tenants', jsonb_build_object('deleted', array_length(doomed, 1)));

  RETURN jsonb_build_object('dry_run', false, 'deleted', array_length(doomed, 1));
END; $function$;

------------------------------------------------------------ plan-aware checks
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
    ELSE
      RAISE EXCEPTION 'Your plan does not include %.', p_feature USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_feature = 'whatsapp' AND NOT wa_flag THEN
    RAISE EXCEPTION 'WhatsApp is not switched on for this chamber yet.' USING ERRCODE = '42501';
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_resource_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  resource TEXT := TG_ARGV[0];
  lic_plan TEXT;
  max_allowed INTEGER;
  current_count INTEGER;
BEGIN
  SELECT public.effective_plan(plan, trial_ends_at) INTO lic_plan
    FROM public.licenses WHERE tenant_id = NEW.tenant_id;
  lic_plan := COALESCE(lic_plan, 'free');
  max_allowed := public.plan_limit(lic_plan, resource);
  IF max_allowed IS NOT NULL THEN
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1', resource)
      INTO current_count USING NEW.tenant_id;
    IF current_count >= max_allowed THEN
      RAISE EXCEPTION 'Your % plan allows up to % % — upgrade to add more.',
        lic_plan, max_allowed, resource
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lic_plan TEXT;
  seat_cap INTEGER;
  used INTEGER;
BEGIN
  SELECT public.effective_plan(plan, trial_ends_at), seats INTO lic_plan, seat_cap
    FROM public.licenses WHERE tenant_id = NEW.tenant_id;
  lic_plan := COALESCE(lic_plan, 'free');

  IF NOT public.plan_feature(lic_plan, 'team') THEN
    RAISE EXCEPTION 'Your % plan is for a single advocate. Move to the Chamber plan (from Rs 7999/month for 2 users) to invite teammates.', lic_plan
      USING ERRCODE = '42501';
  END IF;

  SELECT
    (SELECT count(*) FROM public.profiles WHERE tenant_id = NEW.tenant_id) +
    (SELECT count(*) FROM public.tenant_invites WHERE tenant_id = NEW.tenant_id AND status = 'pending')
  INTO used;

  IF seat_cap IS NOT NULL AND used >= seat_cap THEN
    RAISE EXCEPTION 'This chamber has used all % seats. Add a seat at Rs 1999/month, or revoke a pending invite.', seat_cap
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.increment_ai_usage()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  t_id UUID;
  lic_plan TEXT;
  lic_status TEXT;
  new_count INTEGER;
  max_allowed INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = uid;
  SELECT public.effective_plan(plan, trial_ends_at), status INTO lic_plan, lic_status
    FROM public.licenses WHERE tenant_id = t_id;
  lic_plan := COALESCE(lic_plan, 'free');

  IF lic_status = 'cancelled' THEN
    RAISE EXCEPTION 'This chamber''s subscription is cancelled — AI features are unavailable.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_usage_daily (user_id, usage_date, call_count)
  VALUES (uid, current_date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET call_count = public.ai_usage_daily.call_count + 1
  RETURNING call_count INTO new_count;

  max_allowed := public.plan_limit(lic_plan, 'ai_calls_per_day');
  IF max_allowed IS NOT NULL AND new_count > max_allowed THEN
    RAISE EXCEPTION 'Daily AI usage limit reached for the % plan (% calls/day) — please try again tomorrow or upgrade your plan.',
      lic_plan, max_allowed
      USING ERRCODE = '42501';
  END IF;

  RETURN new_count;
END; $function$;

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
  daily_cap := public.plan_limit(COALESCE(tenant_plan, 'free'), 'ecourts_lookups_per_day');

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

CREATE OR REPLACE FUNCTION public.increment_whatsapp_usage(p_tenant_id uuid, p_ist_date date, p_count integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_count INTEGER;
  tenant_plan TEXT;
  daily_cap INTEGER;
BEGIN
  SELECT public.effective_plan(plan, trial_ends_at) INTO tenant_plan
    FROM public.licenses WHERE tenant_id = p_tenant_id;
  daily_cap := public.plan_limit(COALESCE(tenant_plan, 'free'), 'whatsapp_messages_per_day');

  INSERT INTO public.whatsapp_usage_daily (tenant_id, usage_date, send_count)
  VALUES (p_tenant_id, p_ist_date, p_count)
  ON CONFLICT (tenant_id, usage_date)
  DO UPDATE SET send_count = public.whatsapp_usage_daily.send_count + p_count
  RETURNING send_count INTO new_count;

  IF daily_cap IS NOT NULL AND new_count > daily_cap THEN
    RAISE EXCEPTION 'WhatsApp daily send cap (%) exceeded for tenant %', daily_cap, p_tenant_id
      USING ERRCODE = '22023';
  END IF;

  RETURN new_count;
END; $function$;

CREATE OR REPLACE FUNCTION public.my_usage_summary()
 RETURNS TABLE(plan text, used_storage_mb numeric, storage_limit_mb integer, seats_used integer, seats_limit integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t_id UUID;
  lic_plan TEXT;
  lic_seats INTEGER;
BEGIN
  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = auth.uid();
  SELECT public.effective_plan(l.plan, l.trial_ends_at), l.seats INTO lic_plan, lic_seats
    FROM public.licenses l WHERE l.tenant_id = t_id;
  RETURN QUERY SELECT
    COALESCE(lic_plan, 'free'),
    public.tenant_storage_estimate_mb(t_id),
    public.plan_limit(COALESCE(lic_plan, 'free'), 'storage_mb'),
    (SELECT count(*)::INTEGER FROM public.profiles WHERE tenant_id = t_id) +
    (SELECT count(*)::INTEGER FROM public.tenant_invites WHERE tenant_id = t_id AND status = 'pending'),
    lic_seats;
END; $function$;

CREATE OR REPLACE FUNCTION public.my_entitlements()
 RETURNS TABLE(plan text, status text, seats integer, seats_included integer, seats_used integer, extra_seats integer, extra_seat_price_inr integer, base_price_inr integer, modules_total_inr integer, monthly_total_inr integer, ocr_enabled boolean, whatsapp_enabled boolean, team_enabled boolean, matters_limit integer, clients_limit integer, storage_limit_mb integer, trial_ends_at timestamp with time zone, trial_days_left integer, trial_expired boolean, trial_period_days integer, billing_cadence text, current_period_end timestamp with time zone, subscription_expired boolean, subscription_grace_days_left integer, ai_drafting_enabled boolean, ai_assistant_enabled boolean, matter_intelligence_enabled boolean, matters_enabled boolean, clients_enabled boolean, diary_enabled boolean, documents_enabled boolean, billing_enabled boolean)
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
    is_trial OR COALESCE((integrations ->> 'billing_enabled')::boolean, false);
END; $function$;

------------------------------------------------------------ signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_tenant_id UUID;
  tenant_name TEXT;
  tenant_slug TEXT;
  invite_id UUID;
  invite_tenant_id UUID;
  invite_role TEXT;
  invite_token TEXT := NEW.raw_user_meta_data ->> 'invite_token';
  assigned_tenant UUID;
  signup_phone TEXT := NULLIF(trim(NEW.raw_user_meta_data ->> 'phone'), '');
BEGIN
  IF invite_token IS NOT NULL THEN
    BEGIN
      SELECT id, tenant_id, role
        INTO invite_id, invite_tenant_id, invite_role
        FROM public.tenant_invites
        WHERE token = invite_token::uuid
          AND status = 'pending'
          AND expires_at > now()
          AND lower(email) = lower(NEW.email)
        LIMIT 1;
    EXCEPTION WHEN invalid_text_representation THEN
      invite_id := NULL; invite_tenant_id := NULL; invite_role := NULL;
    END;
  END IF;

  IF invite_id IS NOT NULL THEN
    UPDATE public.tenant_invites SET status = 'accepted', accepted_at = now() WHERE id = invite_id;
    INSERT INTO public.profiles (id, full_name, phone, tenant_id, tenant_role)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
            signup_phone, invite_tenant_id, invite_role)
    ON CONFLICT (id) DO NOTHING;
    assigned_tenant := invite_tenant_id;
  ELSE
    tenant_name := COALESCE(NEW.raw_user_meta_data ->> 'firm_name', NEW.raw_user_meta_data ->> 'full_name', 'New chamber');
    tenant_slug := lower(regexp_replace(tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8);

    INSERT INTO public.tenants (name, slug) VALUES (tenant_name, tenant_slug)
    RETURNING id INTO new_tenant_id;

    INSERT INTO public.licenses (tenant_id, plan, status, seats, integrations)
    VALUES (new_tenant_id, 'free', 'active',
            public.plan_limit('free', 'seats_included'),
            '{}'::jsonb);

    INSERT INTO public.profiles (id, full_name, firm_name, phone, tenant_id, tenant_role)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
            NEW.raw_user_meta_data ->> 'firm_name', signup_phone, new_tenant_id, 'owner')
    ON CONFLICT (id) DO NOTHING;
    assigned_tenant := new_tenant_id;
  END IF;

  INSERT INTO public.consents (user_id, tenant_id, purpose, notice_version)
  VALUES (NEW.id, assigned_tenant, 'service_provision', public.current_notice_version()),
         (NEW.id, assigned_tenant, 'ai_processing',     public.current_notice_version());

  RETURN NEW;
END; $function$;

------------------------------------------------------------ existing trials
-- Trials already past their end date become Free now: every write was being
-- refused for them, and WhatsApp is not part of Free. Trials still running
-- keep everything until trial_ends_at, after which effective_plan() treats
-- them as Free.
UPDATE public.licenses
   SET plan = 'free',
       status = 'active',
       seats = 1,
       integrations = COALESCE(integrations, '{}'::jsonb) || '{"whatsapp_enabled": false}'::jsonb
 WHERE plan = 'trial'
   AND trial_ends_at IS NOT NULL
   AND trial_ends_at <= now();
