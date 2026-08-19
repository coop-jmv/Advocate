-- Entitlement enforcement tied to licenses.plan / licenses.status.
--
-- Enforced at the database layer (triggers), not just in application code —
-- per the audit's finding that licensing must be enforced server-side and
-- cannot be bypassed by any client (web, native, or a future direct API
-- caller). Every write path funnels through the same Postgres constraints
-- regardless of which edge function/server fn issued it.
--
-- Known simplification: AI usage quotas are tracked per-user
-- (ai_usage_daily is keyed on user_id), not per-tenant, so each user in a
-- multi-user firm gets their own daily allowance rather than the firm
-- sharing one pool. There is currently no user-invite/join-tenant flow, so
-- every tenant has exactly one user in practice — this will need to become
-- tenant-scoped once multi-user firms are actually onboardable.
--
-- Known gap: licenses.seats (max users per tenant) is not enforced here,
-- because there is no code path that lets a second user join an existing
-- tenant yet. Enforcing a seat cap with no way to add seats would be
-- meaningless — add that check when the invite/join flow is built.

CREATE OR REPLACE FUNCTION public.plan_limit(p_plan TEXT, p_resource TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_resource
    WHEN 'matters' THEN
      CASE p_plan WHEN 'trial' THEN 5 WHEN 'starter' THEN 25 WHEN 'pro' THEN 150 ELSE NULL END
    WHEN 'clients' THEN
      CASE p_plan WHEN 'trial' THEN 5 WHEN 'starter' THEN 25 WHEN 'pro' THEN 150 ELSE NULL END
    WHEN 'ai_calls_per_day' THEN
      CASE p_plan WHEN 'trial' THEN 20 WHEN 'starter' THEN 60 WHEN 'pro' THEN 200 WHEN 'enterprise' THEN 500 ELSE 20 END
    ELSE NULL
  END;
$$;
COMMENT ON FUNCTION public.plan_limit IS 'NULL return means unlimited for that plan/resource.';

-- Blocks all writes (insert/update/delete) once a tenant's license is
-- cancelled, while leaving reads (SELECT, governed by existing RLS) open —
-- so a cancelled chamber can still view and export its data rather than
-- losing access to it outright.
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
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.enforce_tenant_writable() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['matters', 'clients', 'hearings', 'time_entries', 'invoices',
                            'ai_conversations', 'ai_messages', 'ai_documents', 'ai_drafts']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable()',
      t || '_writable_check', t
    );
  END LOOP;
END $$;

-- Caps the number of matters/clients a tenant can create, based on its
-- license plan. NULL plan_limit() means unlimited (enterprise).
CREATE OR REPLACE FUNCTION public.enforce_resource_limit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  resource TEXT := TG_ARGV[0];
  lic_plan TEXT;
  max_allowed INTEGER;
  current_count INTEGER;
BEGIN
  SELECT plan INTO lic_plan FROM public.licenses WHERE tenant_id = NEW.tenant_id;
  max_allowed := public.plan_limit(COALESCE(lic_plan, 'trial'), resource);
  IF max_allowed IS NOT NULL THEN
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1', resource)
      INTO current_count USING NEW.tenant_id;
    IF current_count >= max_allowed THEN
      RAISE EXCEPTION 'Your % plan allows up to % %s — upgrade to add more.',
        COALESCE(lic_plan, 'trial'), max_allowed, resource
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_resource_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER matters_limit_check BEFORE INSERT ON public.matters
  FOR EACH ROW EXECUTE FUNCTION public.enforce_resource_limit('matters');
CREATE TRIGGER clients_limit_check BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_resource_limit('clients');

-- Plan-aware AI usage quota, replacing the flat 60/day env-configured
-- limit. Enforcement now lives entirely in this SECURITY DEFINER function
-- rather than being duplicated/checked again in application code.
CREATE OR REPLACE FUNCTION public.increment_ai_usage()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  SELECT plan, status INTO lic_plan, lic_status FROM public.licenses WHERE tenant_id = t_id;

  IF lic_status = 'cancelled' THEN
    RAISE EXCEPTION 'This chamber''s subscription is cancelled — AI features are unavailable.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_usage_daily (user_id, usage_date, call_count)
  VALUES (uid, current_date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET call_count = public.ai_usage_daily.call_count + 1
  RETURNING call_count INTO new_count;

  max_allowed := public.plan_limit(COALESCE(lic_plan, 'trial'), 'ai_calls_per_day');
  IF max_allowed IS NOT NULL AND new_count > max_allowed THEN
    RAISE EXCEPTION 'Daily AI usage limit reached for the % plan (% calls/day) — please try again tomorrow or upgrade your plan.',
      COALESCE(lic_plan, 'trial'), max_allowed
      USING ERRCODE = '42501';
  END IF;

  RETURN new_count;
END; $$;
