-- Free-forever plan verification (20260915090000_free_forever_plan.sql).
-- Run against the LOCAL supabase instance only — it creates a fixture user in
-- auth.users. Everything happens inside one transaction that is rolled back.
\set ON_ERROR_STOP on
BEGIN;

-- ===========================================================================
-- F-1: effective_plan() resolves an ended trial to Free
-- ===========================================================================
DO $$
BEGIN
  IF public.effective_plan('trial', now() + interval '1 day') <> 'trial' THEN
    RAISE EXCEPTION 'FAIL F-1a: a running trial should stay trial';
  END IF;
  IF public.effective_plan('trial', now() - interval '1 day') <> 'free' THEN
    RAISE EXCEPTION 'FAIL F-1b: an ended trial should resolve to free';
  END IF;
  IF public.effective_plan('trial', NULL) <> 'trial' THEN
    RAISE EXCEPTION 'FAIL F-1c: a trial with no end date should stay trial';
  END IF;
  IF public.effective_plan(NULL, NULL) <> 'free' THEN
    RAISE EXCEPTION 'FAIL F-1d: a missing plan should resolve to free';
  END IF;
  IF public.effective_plan('solo_pro', now() - interval '1 day') <> 'solo_pro' THEN
    RAISE EXCEPTION 'FAIL F-1e: trial_ends_at must not affect a paid plan';
  END IF;
  RAISE NOTICE 'PASS F-1  effective_plan: running trial=trial, ended trial=free, NULL plan=free, paid unaffected';
END $$;

-- ===========================================================================
-- F-2: plan limits for Free
-- ===========================================================================
DO $$
BEGIN
  IF public.plan_limit('free', 'matters') <> 25 OR public.plan_limit('free', 'clients') <> 25 THEN
    RAISE EXCEPTION 'FAIL F-2a: Free should allow 25 matters and 25 clients';
  END IF;
  IF public.plan_limit('free', 'ai_calls_per_day') <> 5 THEN
    RAISE EXCEPTION 'FAIL F-2b: Free should allow 5 AI calls a day';
  END IF;
  IF public.plan_limit('free', 'seats_included') <> 1 THEN
    RAISE EXCEPTION 'FAIL F-2c: Free should include exactly 1 seat';
  END IF;
  IF public.plan_limit('free', 'whatsapp_messages_per_day') <> 0 THEN
    RAISE EXCEPTION 'FAIL F-2d: Free should include no WhatsApp messages';
  END IF;
  IF public.plan_feature('free', 'ocr') OR public.plan_feature('free', 'whatsapp')
     OR public.plan_feature('free', 'team') THEN
    RAISE EXCEPTION 'FAIL F-2e: OCR, WhatsApp and team must not be Free features';
  END IF;
  IF public.plan_price_inr('free', 'base') <> 0 THEN
    RAISE EXCEPTION 'FAIL F-2f: Free base price should be 0';
  END IF;
  RAISE NOTICE 'PASS F-2  Free limits: 25 matters, 25 clients, 5 AI/day, 1 seat, no WhatsApp/OCR/team, price 0';
END $$;

-- ===========================================================================
-- F-3: signup creates a Free chamber, not a trial
-- ===========================================================================
DO $$
DECLARE
  uid  UUID := '00000000-0000-4000-8000-0000000000c3';
  t_id UUID;
  l    RECORD;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  VALUES (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'plans-free@example.com', 'x', now(), '{}'::jsonb,
          '{"full_name":"Free Verify","firm_name":"Free Verify Chambers"}'::jsonb, now(), now());

  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = uid;
  IF t_id IS NULL THEN RAISE EXCEPTION 'FAIL F-3: fixture tenant was not created'; END IF;

  SELECT * INTO l FROM public.licenses WHERE tenant_id = t_id;
  IF l.plan <> 'free' OR l.status <> 'active' THEN
    RAISE EXCEPTION 'FAIL F-3a: signup should create plan free/active, got %/%', l.plan, l.status;
  END IF;
  IF l.trial_ends_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F-3b: a Free licence must have no trial end date';
  END IF;
  IF l.seats <> 1 THEN
    RAISE EXCEPTION 'FAIL F-3c: a Free licence should have 1 seat, got %', l.seats;
  END IF;
  IF COALESCE((l.integrations ->> 'whatsapp_enabled')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL F-3d: signup must not switch WhatsApp on for a Free chamber';
  END IF;
  RAISE NOTICE 'PASS F-3  signup -> plan=free, status=active, seats=1, no trial end, WhatsApp off';
END $$;

-- ===========================================================================
-- F-4: which modules Free includes
-- ===========================================================================
DO $$
DECLARE
  uid  UUID := '00000000-0000-4000-8000-0000000000c3';
  t_id UUID;
  m    TEXT;
BEGIN
  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = uid;

  FOREACH m IN ARRAY ARRAY['matters', 'clients', 'diary', 'matter_intelligence', 'ai_assistant'] LOOP
    IF NOT public.module_enabled(t_id, m) THEN
      RAISE EXCEPTION 'FAIL F-4a: Free should include module %', m;
    END IF;
  END LOOP;
  FOREACH m IN ARRAY ARRAY['documents', 'billing', 'ai_drafting'] LOOP
    IF public.module_enabled(t_id, m) THEN
      RAISE EXCEPTION 'FAIL F-4b: Free must NOT include module %', m;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS F-4a Free includes matters, clients, diary, matter_intelligence, ai_assistant';
  RAISE NOTICE 'PASS F-4b Free excludes documents, billing, ai_drafting';

  -- A paid add-on switched on for a Free chamber must still work.
  UPDATE public.licenses SET integrations = '{"billing_enabled": true}'::jsonb WHERE tenant_id = t_id;
  IF NOT public.module_enabled(t_id, 'billing') THEN
    RAISE EXCEPTION 'FAIL F-4c: a purchased add-on should be enabled on a Free chamber';
  END IF;
  UPDATE public.licenses SET integrations = '{}'::jsonb WHERE tenant_id = t_id;
  RAISE NOTICE 'PASS F-4c a purchased add-on (billing) is enabled on top of Free';
END $$;

-- ===========================================================================
-- F-5: the database triggers enforce the Free module set on direct INSERTs
-- ===========================================================================
DO $$
DECLARE
  uid     UUID := '00000000-0000-4000-8000-0000000000c3';
  t_id    UUID;
  m_id    UUID;
  blocked BOOLEAN;
BEGIN
  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = uid;

  INSERT INTO public.matters (tenant_id, title, created_by)
  VALUES (t_id, 'Free matter', uid) RETURNING id INTO m_id;
  INSERT INTO public.clients (tenant_id, name, created_by)
  VALUES (t_id, 'Free client', uid);
  INSERT INTO public.hearings (tenant_id, matter_id, matter_title, hearing_date, created_by)
  VALUES (t_id, m_id, 'Free matter', current_date, uid);
  RAISE NOTICE 'PASS F-5a Free can insert matters, clients and hearings';

  blocked := false;
  BEGIN
    INSERT INTO public.invoices (tenant_id, client_name, invoice_number, amount, created_by)
    VALUES (t_id, 'Free client', 'INV-FREE-1', 1000, uid);
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL F-5b: a Free chamber could INSERT an invoice (billing is paid)';
  END IF;

  blocked := false;
  BEGIN
    INSERT INTO public.time_entries (tenant_id, matter_title, task, hours, created_by)
    VALUES (t_id, 'Free matter', 'Drafting', 0.5, uid);
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL F-5c: a Free chamber could INSERT a time entry (billing is paid)';
  END IF;
  RAISE NOTICE 'PASS F-5b Free INSERT into invoices and time_entries refused (42501)';
END $$;

-- ===========================================================================
-- F-6: the 25-matter cap is enforced
-- ===========================================================================
DO $$
DECLARE
  uid     UUID := '00000000-0000-4000-8000-0000000000c3';
  t_id    UUID;
  have    INTEGER;
  blocked BOOLEAN := false;
BEGIN
  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = uid;
  SELECT count(*) INTO have FROM public.matters WHERE tenant_id = t_id;

  FOR i IN (have + 1)..25 LOOP
    INSERT INTO public.matters (tenant_id, title, created_by)
    VALUES (t_id, 'Cap matter ' || i, uid);
  END LOOP;

  BEGIN
    INSERT INTO public.matters (tenant_id, title, created_by)
    VALUES (t_id, 'Matter 26', uid);
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL F-6: a Free chamber could create a 26th matter';
  END IF;
  RAISE NOTICE 'PASS F-6  Free: 25 matters allowed, the 26th refused (42501)';
END $$;

-- ===========================================================================
-- F-7: an ended trial becomes Free — not read-only, and not purged
-- ===========================================================================
DO $$
DECLARE
  uid  UUID := '00000000-0000-4000-8000-0000000000c3';
  t_id UUID;
BEGIN
  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = uid;
  DELETE FROM public.matters WHERE tenant_id = t_id;

  -- A trial that is still running unlocks the paid modules.
  UPDATE public.licenses
     SET plan = 'trial', status = 'trialing', trial_ends_at = now() + interval '5 days'
   WHERE tenant_id = t_id;
  IF NOT public.module_enabled(t_id, 'billing') THEN
    RAISE EXCEPTION 'FAIL F-7a: a running trial should unlock billing';
  END IF;
  RAISE NOTICE 'PASS F-7a running trial unlocks paid modules (billing)';

  -- The same trial, ended: behaves as Free.
  UPDATE public.licenses SET trial_ends_at = now() - interval '1 day' WHERE tenant_id = t_id;
  IF public.module_enabled(t_id, 'billing') THEN
    RAISE EXCEPTION 'FAIL F-7b: an ended trial should lose billing';
  END IF;
  IF NOT public.module_enabled(t_id, 'matters') THEN
    RAISE EXCEPTION 'FAIL F-7c: an ended trial should keep the Free modules';
  END IF;
  IF public.trial_expired(t_id) THEN
    RAISE EXCEPTION 'FAIL F-7d: trial_expired() must now always be false';
  END IF;
  RAISE NOTICE 'PASS F-7b ended trial behaves as Free: billing off, matters on, trial_expired=false';

  -- The regression this plan exists to fix: an ended trial used to make every
  -- write fail in enforce_tenant_writable(). It must now succeed.
  INSERT INTO public.matters (tenant_id, title, created_by)
  VALUES (t_id, 'Written after the trial ended', uid);
  RAISE NOTICE 'PASS F-7e an ended trial is still writable (no read-only lock)';

  -- And it must never be picked up by the retention purge.
  IF pg_get_functiondef('public.purge_expired_chambers'::regproc) ILIKE '%trial%' THEN
    RAISE EXCEPTION 'FAIL F-7f: purge_expired_chambers() still references trials';
  END IF;
  RAISE NOTICE 'PASS F-7f purge_expired_chambers() no longer targets ended trials';
END $$;

-- ===========================================================================
-- F-8: a Free chamber never lapses
-- ===========================================================================
DO $$
DECLARE
  uid  UUID := '00000000-0000-4000-8000-0000000000c3';
  t_id UUID;
BEGIN
  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = uid;
  UPDATE public.licenses
     SET plan = 'free', status = 'active', trial_ends_at = NULL,
         current_period_end = now() - interval '60 days'
   WHERE tenant_id = t_id;

  IF public.subscription_expired(t_id) THEN
    RAISE EXCEPTION 'FAIL F-8a: a Free chamber must never count as a lapsed subscription';
  END IF;
  INSERT INTO public.matters (tenant_id, title, created_by)
  VALUES (t_id, 'Free, long past any period end', uid);
  RAISE NOTICE 'PASS F-8  Free with a stale current_period_end: not lapsed, still writable';
END $$;

-- ===========================================================================
-- F-9: my_entitlements() reports Free correctly to the app
-- ===========================================================================
DO $$
DECLARE
  uid  UUID := '00000000-0000-4000-8000-0000000000c3';
  e    RECORD;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid::text)::text, true);
  SELECT * INTO e FROM public.my_entitlements();

  IF e.plan <> 'free' THEN
    RAISE EXCEPTION 'FAIL F-9a: my_entitlements plan should be free, got %', e.plan;
  END IF;
  IF e.matters_limit <> 25 OR e.clients_limit <> 25 THEN
    RAISE EXCEPTION 'FAIL F-9b: my_entitlements limits should be 25/25, got %/%', e.matters_limit, e.clients_limit;
  END IF;
  IF NOT (e.matters_enabled AND e.clients_enabled AND e.diary_enabled
          AND e.matter_intelligence_enabled AND e.ai_assistant_enabled) THEN
    RAISE EXCEPTION 'FAIL F-9c: my_entitlements should report the Free modules as enabled';
  END IF;
  IF e.documents_enabled OR e.billing_enabled OR e.ai_drafting_enabled THEN
    RAISE EXCEPTION 'FAIL F-9d: my_entitlements should report paid modules as disabled';
  END IF;
  IF e.trial_expired OR e.trial_days_left IS NOT NULL OR e.subscription_grace_days_left IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F-9e: Free should show no trial countdown and no renewal grace period';
  END IF;
  IF e.team_enabled OR e.ocr_enabled OR e.whatsapp_enabled THEN
    RAISE EXCEPTION 'FAIL F-9f: Free should report team, OCR and WhatsApp as off';
  END IF;
  RAISE NOTICE 'PASS F-9  my_entitlements: plan=free, 25/25, Free modules on, paid off, no trial or grace countdown';
END $$;

ROLLBACK;
