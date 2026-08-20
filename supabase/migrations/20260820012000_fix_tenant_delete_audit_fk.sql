-- Fixes a latent failure in the tenant audit trigger.
--
-- log_tenant_admin_action() is an AFTER INSERT/UPDATE/DELETE trigger on
-- public.tenants that writes audit_log.tenant_id = COALESCE(NEW.id, OLD.id).
-- On DELETE that row no longer exists, so the write violated
-- audit_log_tenant_id_fkey and aborted the delete: no tenant could ever be
-- removed, and the error surfaced as an opaque FK violation rather than
-- anything to do with auditing.
--
-- The delete is still recorded — tenant_id is left NULL (the column is
-- nullable and the FK is ON DELETE SET NULL for exactly this reason) while
-- resource_id, which carries no FK, keeps the identity of what was removed.
CREATE OR REPLACE FUNCTION public.log_tenant_admin_action() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id, metadata)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.id END,
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    lower(TG_OP), 'tenants', COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN jsonb_build_object('deleted_tenant_name', OLD.name) ELSE '{}'::jsonb END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

-- Same hazard on the licences trigger: a licence row is deleted whenever its
-- tenant is (ON DELETE CASCADE), so it would hit the identical FK violation.
CREATE OR REPLACE FUNCTION public.log_license_admin_action() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id, metadata)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.tenant_id END,
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    lower(TG_OP), 'licenses', COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN jsonb_build_object('deleted_for_tenant', OLD.tenant_id)
         ELSE jsonb_build_object('plan', NEW.plan, 'status', NEW.status, 'seats', NEW.seats) END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

-- And on the generic per-table logger, for the same reason: deleting a tenant
-- cascades to matters/clients/hearings/etc., each of which would try to log
-- against a tenant row that is already gone.
CREATE OR REPLACE FUNCTION public.log_tenant_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_tenant UUID;
  row_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_id := OLD.id;
    -- Only attribute the row to its tenant if that tenant still exists;
    -- during a tenant cascade it does not.
    SELECT id INTO row_tenant FROM public.tenants WHERE id = OLD.tenant_id;
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
