-- Fixes a genuine bug in the DPDP "right to erasure" path, found by live-testing
-- delete_my_account() for a sole chamber owner (the most common real case: a
-- solo advocate closing their account).
--
-- Reproduced against the live database: the call failed with
--   23503  insert or update on table "audit_log" violates foreign key
--          constraint "audit_log_tenant_id_fkey"
-- because tenants_audit_log and licenses_audit_log both fire AFTER DELETE and
-- try to INSERT an audit_log row referencing the tenant that delete_my_account()
-- is in the middle of deleting. For a sole owner, DELETE FROM tenants cascades
-- to the licenses row; by the time either AFTER trigger's audit INSERT runs,
-- the parent tenants row it wants to reference is already gone from the table,
-- so the FK check fails and the whole deletion — the erasure the DPDP
-- migration exists to guarantee — is rolled back.
--
-- The fix is timing, not logic: both trigger functions already
-- `RETURN COALESCE(NEW, OLD)`, which is a valid non-null return for a BEFORE
-- trigger (returning NULL would be the only way to cancel the operation, and
-- neither function ever does). Running them BEFORE instead of AFTER means the
-- audit row is written — and its FK to tenants satisfied — while the row being
-- deleted still exists, exactly as delete_my_account()'s own explicit
-- 'account_deleted' audit insert already does deliberately (see its comment:
-- "Logged before the delete... writing afterwards would lose who did what").
-- This migration brings the two generic table-level audit triggers in line
-- with that same, already-established reasoning.

DROP TRIGGER IF EXISTS tenants_audit_log ON public.tenants;
CREATE TRIGGER tenants_audit_log
  BEFORE INSERT OR DELETE OR UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.log_tenant_admin_action();

DROP TRIGGER IF EXISTS licenses_audit_log ON public.licenses;
CREATE TRIGGER licenses_audit_log
  BEFORE INSERT OR DELETE OR UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.log_license_admin_action();
