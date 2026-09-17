-- e-Courts paid-feature and cache verification
-- (20260916090000_ecourts_paid_feature_and_cache.sql).
-- Run against the LOCAL supabase instance only — it creates a fixture user in
-- auth.users. Everything happens inside one transaction that is rolled back.
--
-- Every e-Courts lookup is a billed vendor call, so the assertions that matter
-- most here are the ones proving a Free chamber cannot spend one.
\set ON_ERROR_STOP on
BEGIN;

-- ===========================================================================
-- E-1: plan feature and daily cap, per plan
-- ===========================================================================
DO $$
BEGIN
  IF public.plan_feature('free', 'ecourts') THEN
    RAISE EXCEPTION 'FAIL E-1a: e-Courts must not be a Free feature';
  END IF;
  IF NOT (public.plan_feature('trial', 'ecourts') AND public.plan_feature('solo_basic', 'ecourts')
          AND public.plan_feature('solo_pro', 'ecourts') AND public.plan_feature('chamber', 'ecourts')) THEN
    RAISE EXCEPTION 'FAIL E-1b: e-Courts should be a feature of trial and every paid plan';
  END IF;
  RAISE NOTICE 'PASS E-1a plan_feature(ecourts): free=false; trial, solo_basic, solo_pro, chamber=true';

  IF public.plan_limit('free', 'ecourts_lookups_per_day') <> 0
     OR public.plan_limit('trial', 'ecourts_lookups_per_day') <> 5
     OR public.plan_limit('solo_basic', 'ecourts_lookups_per_day') <> 10
     OR public.plan_limit('solo_pro', 'ecourts_lookups_per_day') <> 30
     OR public.plan_limit('chamber', 'ecourts_lookups_per_day') <> 100 THEN
    RAISE EXCEPTION 'FAIL E-1c: e-Courts daily caps should be free=0 trial=5 solo_basic=10 solo_pro=30 chamber=100';
  END IF;
  -- An unknown plan must fall to 0, never to a spending cap.
  IF public.plan_limit('no_such_plan', 'ecourts_lookups_per_day') <> 0 THEN
    RAISE EXCEPTION 'FAIL E-1d: an unknown plan should get an e-Courts cap of 0';
  END IF;
  RAISE NOTICE 'PASS E-1b e-Courts caps: free=0 trial=5 solo_basic=10 solo_pro=30 chamber=100, unknown=0';
END $$;

-- Fixture chamber, acting as its user for the rest of the file.
DO $$
DECLARE
  uid UUID := '00000000-0000-4000-8000-0000000000c4';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  VALUES (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'plans-ecourts@example.com', 'x', now(), '{}'::jsonb,
          '{"full_name":"eCourts Verify","firm_name":"eCourts Verify Chambers"}'::jsonb, now(), now());
  -- Transaction-scoped (true), like pass5: it lasts for every later block in
  -- this transaction and cannot outlive the ROLLBACK.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid::text)::text, true);
  IF public.current_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'FAIL E-fixture: could not act as the fixture user';
  END IF;
END $$;

-- ===========================================================================
-- E-2: a Free chamber cannot spend a lookup — even with the switch on
-- ===========================================================================
DO $$
DECLARE
  t_id    UUID := public.current_tenant_id();
  blocked BOOLEAN := false;
  msg     TEXT;
BEGIN
  -- The dangerous case: an admin flips the old per-chamber switch on a Free chamber.
  UPDATE public.licenses
     SET plan = 'free', status = 'active', integrations = '{"ecourts_enabled": true}'::jsonb
   WHERE tenant_id = t_id;

  BEGIN
    PERFORM public.increment_ecourts_usage();
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL E-2a: a Free chamber with ecourts_enabled could count a billed lookup';
  END IF;
  IF msg NOT ILIKE '%paid plan%' THEN
    RAISE EXCEPTION 'FAIL E-2b: refusal should tell the user it needs a paid plan, got: %', msg;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ecourts_usage_daily WHERE tenant_id = t_id) THEN
    RAISE EXCEPTION 'FAIL E-2c: a refused Free lookup must not write a usage row';
  END IF;
  RAISE NOTICE 'PASS E-2a Free + ecourts_enabled: increment_ecourts_usage refused (42501), upgrade message, no usage row';

  blocked := false;
  BEGIN
    PERFORM public.assert_feature('ecourts');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL E-2d: assert_feature(ecourts) should refuse a Free chamber';
  END IF;
  RAISE NOTICE 'PASS E-2b assert_feature(ecourts) refuses Free (the edge function''s plan gate)';
END $$;

-- ===========================================================================
-- E-3: a paid plan gets exactly its daily cap
-- ===========================================================================
DO $$
DECLARE
  t_id    UUID := public.current_tenant_id();
  n       INTEGER;
  blocked BOOLEAN := false;
BEGIN
  UPDATE public.licenses
     SET plan = 'solo_basic', status = 'active', integrations = '{"ecourts_enabled": true}'::jsonb
   WHERE tenant_id = t_id;

  PERFORM public.assert_feature('ecourts');
  RAISE NOTICE 'PASS E-3a assert_feature(ecourts) passes for solo_basic';

  FOR i IN 1..10 LOOP
    n := public.increment_ecourts_usage();
    IF n <> i THEN
      RAISE EXCEPTION 'FAIL E-3b: lookup % returned count %', i, n;
    END IF;
  END LOOP;

  BEGIN
    PERFORM public.increment_ecourts_usage();
  EXCEPTION WHEN SQLSTATE '22023' THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL E-3c: solo_basic allowed an 11th lookup in one day';
  END IF;
  SELECT lookup_count INTO n FROM public.ecourts_usage_daily WHERE tenant_id = t_id;
  IF n <> 10 THEN
    RAISE EXCEPTION 'FAIL E-3d: the refused 11th lookup should not be counted, count is %', n;
  END IF;
  RAISE NOTICE 'PASS E-3b solo_basic: 10 lookups counted, the 11th refused (22023) and not counted';
END $$;

-- ===========================================================================
-- E-4: trials — a running trial has lookups, an ended one does not
-- ===========================================================================
DO $$
DECLARE
  t_id    UUID := public.current_tenant_id();
  blocked BOOLEAN := false;
BEGIN
  DELETE FROM public.ecourts_usage_daily WHERE tenant_id = t_id;

  UPDATE public.licenses
     SET plan = 'trial', status = 'trialing', trial_ends_at = now() + interval '5 days'
   WHERE tenant_id = t_id;
  PERFORM public.increment_ecourts_usage();
  RAISE NOTICE 'PASS E-4a running trial can make a lookup';

  UPDATE public.licenses SET trial_ends_at = now() - interval '1 day' WHERE tenant_id = t_id;
  BEGIN
    PERFORM public.increment_ecourts_usage();
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL E-4b: an ended trial (now Free) could still make a billed lookup';
  END IF;
  RAISE NOTICE 'PASS E-4b ended trial is treated as Free: lookup refused (42501)';
END $$;

-- ===========================================================================
-- E-5: my_entitlements() — both gates must allow e-Courts
-- ===========================================================================
DO $$
DECLARE
  t_id UUID := public.current_tenant_id();
  e    RECORD;
BEGIN
  UPDATE public.licenses
     SET plan = 'solo_basic', status = 'active', trial_ends_at = NULL, integrations = '{}'::jsonb
   WHERE tenant_id = t_id;
  SELECT * INTO e FROM public.my_entitlements();
  IF e.ecourts_enabled THEN
    RAISE EXCEPTION 'FAIL E-5a: paid plan without the switch should report ecourts_enabled=false';
  END IF;
  IF e.ecourts_lookups_per_day <> 10 THEN
    RAISE EXCEPTION 'FAIL E-5b: solo_basic should report 10 lookups a day, got %', e.ecourts_lookups_per_day;
  END IF;

  UPDATE public.licenses SET integrations = '{"ecourts_enabled": true}'::jsonb WHERE tenant_id = t_id;
  SELECT * INTO e FROM public.my_entitlements();
  IF NOT e.ecourts_enabled THEN
    RAISE EXCEPTION 'FAIL E-5c: paid plan with the switch on should report ecourts_enabled=true';
  END IF;

  UPDATE public.licenses SET plan = 'free' WHERE tenant_id = t_id;
  SELECT * INTO e FROM public.my_entitlements();
  IF e.ecourts_enabled OR e.ecourts_lookups_per_day <> 0 THEN
    RAISE EXCEPTION 'FAIL E-5d: Free with the switch on must still report ecourts off with 0 lookups';
  END IF;
  RAISE NOTICE 'PASS E-5  my_entitlements ecourts_enabled = plan AND switch (paid+off=false, paid+on=true, free+on=false)';
END $$;

-- ===========================================================================
-- E-6: the snapshot cache index exists in the shape the edge function queries
-- ===========================================================================
DO $$
DECLARE
  def TEXT;
BEGIN
  SELECT indexdef INTO def FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'ecourts_sync_log_tenant_cnr_idx';
  IF def IS NULL THEN
    RAISE EXCEPTION 'FAIL E-6a: cache index ecourts_sync_log_tenant_cnr_idx is missing';
  END IF;
  IF def NOT ILIKE '%(tenant_id, cnr, created_at DESC)%' THEN
    RAISE EXCEPTION 'FAIL E-6b: cache index has the wrong columns: %', def;
  END IF;
  IF def NOT ILIKE '%status = ''success''%' THEN
    RAISE EXCEPTION 'FAIL E-6c: cache index should cover successful lookups only: %', def;
  END IF;
  RAISE NOTICE 'PASS E-6  cache index on (tenant_id, cnr, created_at DESC) WHERE status = success';
END $$;

ROLLBACK;
