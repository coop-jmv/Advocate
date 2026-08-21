-- CRITICAL, urgent: fixes a regression this same session introduced in
-- 20260821110000_fix_delete_my_account_audit_trigger_order.sql, which broke
-- every new signup in production.
--
-- That migration moved tenants_audit_log and licenses_audit_log from
-- `AFTER INSERT OR DELETE OR UPDATE` to `BEFORE INSERT OR DELETE OR UPDATE` to
-- fix delete_my_account() failing for a sole owner. It fixed DELETE, but broke
-- INSERT: a BEFORE INSERT trigger fires before the new row is actually written
-- to its table, so log_tenant_admin_action()'s audit_log insert — which
-- references NEW.id as tenant_id — hit the same FK violation in the opposite
-- direction: the tenant doesn't exist *yet*, instead of not existing *anymore*.
-- handle_new_user() creates a tenant (and a license) for every new signup, so
-- this made account creation fail with a 500 for every new user, confirmed
-- live against production:
--   POST /auth/v1/signup → 500
--   {"code":"23503","message":"...audit_log_tenant_id_fkey...",
--    "detail":"Key (tenant_id)=(...) is not present in table \"tenants\"."}
--
-- The real fix needs different timing for different operations: BEFORE DELETE
-- (so the row still exists when logging it — the actual problem this session
-- was solving), AFTER INSERT OR UPDATE (the original, correct timing — the row
-- already exists by then). One trigger can't declare mixed timing per
-- operation, so this splits each table into two triggers sharing the same
-- function, which already branches on TG_OP and needs no changes.

DROP TRIGGER IF EXISTS tenants_audit_log ON public.tenants;
CREATE TRIGGER tenants_audit_log_write
  AFTER INSERT OR UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.log_tenant_admin_action();
CREATE TRIGGER tenants_audit_log_delete
  BEFORE DELETE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.log_tenant_admin_action();

DROP TRIGGER IF EXISTS licenses_audit_log ON public.licenses;
CREATE TRIGGER licenses_audit_log_write
  AFTER INSERT OR UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.log_license_admin_action();
CREATE TRIGGER licenses_audit_log_delete
  BEFORE DELETE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.log_license_admin_action();
