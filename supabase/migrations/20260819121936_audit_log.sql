-- Audit log for critical actions (per the audit's §24). Append-only: no
-- client (authenticated or anon) ever gets INSERT/UPDATE/DELETE grants on
-- this table directly — every row is written by a SECURITY DEFINER
-- function or trigger, so the actor/tenant/timestamp on a row can't be
-- forged by whoever is calling. There is intentionally no UPDATE/DELETE
-- policy at all, so even a tenant admin/platform admin can only ever
-- append and read, never edit or erase existing entries.

CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  result TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure')),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_tenant_idx ON public.audit_log (tenant_id, created_at DESC);
CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_user_id, created_at DESC);

-- No GRANT of INSERT/UPDATE/DELETE to authenticated/anon at all — only
-- SELECT, and only via the policies below. service_role (migrations,
-- future background jobs) keeps full access.
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins view own tenant audit log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "Platform admins view all audit log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Generic mutation logger for tenant-owned business tables. AFTER trigger
-- (fires once the row is durably committed to that point in the
-- transaction) so a rolled-back statement never leaves a stray log entry.
CREATE OR REPLACE FUNCTION public.log_tenant_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_tenant UUID;
  row_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_tenant := OLD.tenant_id;
    row_id := OLD.id;
  ELSE
    row_tenant := NEW.tenant_id;
    row_id := NEW.id;
  END IF;

  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id)
  VALUES (
    row_tenant, auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    lower(TG_OP), TG_TABLE_NAME, row_id
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.log_tenant_mutation() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['matters', 'clients', 'hearings', 'time_entries', 'invoices',
                            'ai_documents', 'ai_drafts', 'ai_conversations']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.log_tenant_mutation()',
      t || '_audit_log', t
    );
  END LOOP;
END $$;

-- Platform-admin actions: tenant status changes, license/plan changes,
-- admin grants/revokes. tenants.id *is* the tenant here; licenses has its
-- own tenant_id column already.
CREATE OR REPLACE FUNCTION public.log_tenant_admin_action() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id)
  VALUES (
    COALESCE(NEW.id, OLD.id), auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    lower(TG_OP), 'tenants', COALESCE(NEW.id, OLD.id)
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.log_tenant_admin_action() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tenants_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.log_tenant_admin_action();

CREATE OR REPLACE FUNCTION public.log_license_admin_action() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id, metadata)
  VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id), auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    lower(TG_OP), 'licenses', COALESCE(NEW.id, OLD.id),
    jsonb_build_object('plan', NEW.plan, 'status', NEW.status)
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.log_license_admin_action() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER licenses_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.log_license_admin_action();

CREATE OR REPLACE FUNCTION public.log_platform_admin_grant() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id)
  VALUES (
    NULL, auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    CASE WHEN TG_OP = 'INSERT' THEN 'admin_grant' ELSE 'admin_revoke' END,
    'platform_admins', COALESCE(NEW.user_id, OLD.user_id)
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.log_platform_admin_grant() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER platform_admins_audit_log AFTER INSERT OR DELETE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.log_platform_admin_grant();

-- Auth events (login/logout/signup) don't fire on a table a trigger can
-- hook — they're called explicitly by the client (via an edge function
-- that captures real IP/user-agent from the HTTP request, which no
-- Postgres trigger can see). actor_user_id is only trusted when resolved
-- server-side from a verified JWT (see the edge function) — for a failed
-- login there is no valid session yet, so p_actor_user_id is NULL and
-- p_email is only what was typed, not verified identity.
CREATE OR REPLACE FUNCTION public.log_auth_event(
  p_actor_user_id UUID, p_email TEXT, p_action TEXT, p_result TEXT, p_ip TEXT, p_user_agent TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_tenant UUID;
BEGIN
  IF p_actor_user_id IS NOT NULL THEN
    SELECT tenant_id INTO row_tenant FROM public.profiles WHERE id = p_actor_user_id;
  END IF;
  INSERT INTO public.audit_log
    (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id, result, ip_address, user_agent)
  VALUES (row_tenant, p_actor_user_id, p_email, p_action, 'auth', p_actor_user_id, p_result, p_ip, p_user_agent);
END; $$;
REVOKE ALL ON FUNCTION public.log_auth_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_auth_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;
