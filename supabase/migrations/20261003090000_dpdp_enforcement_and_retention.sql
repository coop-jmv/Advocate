-- DPDP Act, 2023 follow-up: make the controls the privacy notice describes
-- actually bind.
--
--   1. Withdrawing 'ai_processing' consent now blocks every AI/OCR/dictation
--      call (S.6(4)). Previously the withdrawal was recorded but nothing read it.
--   2. Retention (S.8(7)) runs unattended. purge_expired_chambers() needs an
--      authenticated platform admin, which a cron job never is, so the purge
--      was manual-only in practice. run_retention_purge() is the cron entry
--      point; the admin-callable function stays for dry runs and one-offs.
--   3. contact_requests (prospects who are not users yet) gets a retention
--      limit and an erasure path.
--   4. Notice version bumped: the notice now names processors, the cross-border
--      transfer, all consent purposes, and retention periods.

--------------------------------------------------------------- consent check
CREATE OR REPLACE FUNCTION public.has_active_consent(p_user UUID, p_purpose TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consents
     WHERE user_id = p_user AND purpose = p_purpose AND withdrawn_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.has_active_consent(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_consent(UUID, TEXT) TO service_role;

-- Every AI edge function calls increment_ai_usage() before the provider call,
-- so the consent gate lives there: one place, cannot be skipped by a function
-- that forgets it. Body is the live definition from 20260928120000 plus the gate.
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
  month_allowed INTEGER;
  month_count INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.consents
                  WHERE user_id = uid AND purpose = 'ai_processing' AND withdrawn_at IS NULL) THEN
    RAISE EXCEPTION 'AI features are off because you withdrew consent to AI processing. Turn it back on in Profile & privacy to use them.'
      USING ERRCODE = '42501';
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

  month_allowed := public.plan_limit(lic_plan, 'ai_calls_per_month');
  IF month_allowed IS NOT NULL THEN
    SELECT COALESCE(sum(call_count), 0) INTO month_count
      FROM public.ai_usage_daily
     WHERE user_id = uid AND usage_date >= date_trunc('month', current_date)::date;
    IF month_count > month_allowed THEN
      RAISE EXCEPTION 'Monthly AI usage limit reached (% calls this month). It resets on the 1st — write to lexdiary.online@gmail.com if you need more.',
        month_allowed
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN new_count;
END; $function$;

---------------------------------------------------------------- notice version
CREATE OR REPLACE FUNCTION public.current_notice_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT '2026-10-03'::text; $$;

------------------------------------------------------------------- retention
-- Unattended retention. Not callable by any API role: pg_cron runs as the
-- table owner. Deletes only what the notice promises:
--   * chambers whose subscription was cancelled > 180 days ago
--   * WhatsApp delivery-log rows > 12 months old
--   * access requests (contact_requests) > 12 months old
-- Inactive Free chambers are deliberately NOT auto-deleted here: that needs a
-- warning email to the owner first. purge_expired_chambers() reports them.
CREATE OR REPLACE FUNCTION public.run_retention_purge()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  doomed UUID[];
  n_chambers INTEGER;
  n_wa INTEGER;
  n_contact INTEGER;
BEGIN
  SELECT COALESCE(array_agg(l.tenant_id), '{}') INTO doomed
    FROM public.licenses l
   WHERE l.status = 'cancelled' AND l.updated_at < now() - interval '180 days';
  n_chambers := COALESCE(array_length(doomed, 1), 0);
  DELETE FROM public.tenants WHERE id = ANY(doomed);

  DELETE FROM public.whatsapp_messages WHERE created_at < now() - interval '12 months';
  GET DIAGNOSTICS n_wa = ROW_COUNT;

  DELETE FROM public.contact_requests WHERE created_at < now() - interval '12 months';
  GET DIAGNOSTICS n_contact = ROW_COUNT;

  INSERT INTO public.audit_log (action, resource_type, metadata)
  VALUES ('retention_purge', 'system',
          jsonb_build_object('chambers', n_chambers, 'whatsapp_messages', n_wa,
                             'contact_requests', n_contact, 'scheduled', true));

  RETURN jsonb_build_object('chambers', n_chambers, 'whatsapp_messages', n_wa,
                            'contact_requests', n_contact);
END; $$;
REVOKE ALL ON FUNCTION public.run_retention_purge() FROM PUBLIC, anon, authenticated;

-- Weekly, Sunday 02:00 UTC. Kill switch: SELECT cron.unschedule('retention-purge');
SELECT cron.schedule('retention-purge', '0 2 * * 0', $cron$ SELECT public.run_retention_purge(); $cron$);

-- Dry-run report now also lists Free chambers with no sign-in for 24 months,
-- so an admin can warn their owners before anything is removed.
CREATE OR REPLACE FUNCTION public.purge_expired_chambers(p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_cancel  TIMESTAMPTZ := now() - interval '180 days';
  cutoff_inactive TIMESTAMPTZ := now() - interval '24 months';
  doomed UUID[];
  inactive_free INTEGER;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a platform administrator can run retention purges.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(l.tenant_id), '{}') INTO doomed
    FROM public.licenses l
   WHERE l.status = 'cancelled' AND l.updated_at < cutoff_cancel;

  SELECT count(*) INTO inactive_free
    FROM public.licenses l
   WHERE l.plan = 'free' AND l.status <> 'cancelled'
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id = p.id
        WHERE p.tenant_id = l.tenant_id
          AND COALESCE(u.last_sign_in_at, u.created_at) >= cutoff_inactive);

  IF p_dry_run THEN
    RETURN jsonb_build_object('dry_run', true, 'would_delete', array_length(doomed, 1),
                              'cancelled_cutoff', cutoff_cancel,
                              'inactive_free_needing_warning', inactive_free);
  END IF;

  DELETE FROM public.tenants WHERE id = ANY(doomed);

  INSERT INTO public.audit_log (actor_user_id, actor_email, action, resource_type, metadata)
  VALUES (auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'retention_purge', 'tenants', jsonb_build_object('deleted', array_length(doomed, 1)));

  RETURN jsonb_build_object('dry_run', false, 'deleted', array_length(doomed, 1));
END; $function$;

---------------------------------------------- erasure of access-request data
-- Prospects have no account to delete. A grievance-officer request to erase
-- their data is honoured by e-mail address through this platform-admin call.
CREATE OR REPLACE FUNCTION public.erase_contact_requests_by_email(p_email TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a platform administrator can erase access requests.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.contact_requests WHERE lower(email) = lower(trim(p_email));
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.audit_log (actor_user_id, actor_email, action, resource_type, metadata)
  VALUES (auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'contact_request_erased', 'contact_requests', jsonb_build_object('rows', n));
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.erase_contact_requests_by_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erase_contact_requests_by_email(TEXT) TO authenticated;
