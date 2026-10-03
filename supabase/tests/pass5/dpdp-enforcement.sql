-- DPDP enforcement checks. Run against a local instance after `supabase db reset`:
--   psql ... -v ON_ERROR_STOP=1 < supabase/tests/pass5/dpdp-enforcement.sql
BEGIN;

DO $$
DECLARE
  u UUID := gen_random_uuid();
  blocked BOOLEAN := false;
  r JSONB;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role)
  VALUES (u, 'dpdp-test-' || u || '@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  -- handle_new_user() has created the chamber, profile and both consents.

  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u)::text, true);

  PERFORM public.increment_ai_usage();  -- consent active: must pass

  PERFORM public.withdraw_consent('ai_processing');
  BEGIN
    PERFORM public.increment_ai_usage();
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL: AI call allowed after consent withdrawal'; END IF;

  PERFORM public.grant_consent('ai_processing');
  PERFORM public.increment_ai_usage();  -- re-granted: must pass again

  -- scheduled purge removes old contact requests and keeps recent ones
  INSERT INTO public.contact_requests (full_name, email, phone, created_at)
  VALUES ('old', 'old@example.com', '+910000000001', now() - interval '13 months'),
         ('new', 'new@example.com', '+910000000002', now());
  r := public.run_retention_purge();
  IF (r->>'contact_requests')::int < 1 THEN RAISE EXCEPTION 'FAIL: old contact request not purged'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contact_requests WHERE email = 'new@example.com') THEN
    RAISE EXCEPTION 'FAIL: recent contact request was purged';
  END IF;

  RAISE NOTICE 'PASS: dpdp enforcement';
END $$;

ROLLBACK;
