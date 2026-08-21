-- Second half of the delete_my_account() fix (see
-- 20260821110000_fix_delete_my_account_audit_trigger_order.sql for the first).
--
-- Reproduced live even after that migration: a sole owner's deletion still
-- failed with the same 23503 on audit_log_tenant_id_fkey. Cause: ON DELETE
-- CASCADE from tenants to licenses is implemented by Postgres as an internal
-- action that runs *after* the tenants row is already gone, regardless of
-- what timing licenses' own trigger uses — BEFORE vs AFTER on licenses only
-- controls order relative to the licenses row's own removal, not relative to
-- the already-completed deletion of its parent. So licenses_audit_log's
-- INSERT still referenced a tenant_id that no longer existed in tenants.
--
-- Fix: delete_my_account() now deletes the licenses row itself, explicitly,
-- while the tenant still exists — the same principle already applied to its
-- own 'account_deleted' audit entry ("logged before the delete"). The
-- subsequent tenant delete then has nothing left to cascade for licenses.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  t_id UUID;
  my_role TEXT;
  owners INTEGER;
  members INTEGER;
  outcome TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id, tenant_role INTO t_id, my_role FROM public.profiles WHERE id = uid;
  SELECT count(*) INTO members FROM public.profiles WHERE tenant_id = t_id;
  SELECT count(*) INTO owners  FROM public.profiles WHERE tenant_id = t_id AND tenant_role = 'owner';

  IF my_role = 'owner' AND members > 1 THEN
    RAISE EXCEPTION 'You are the owner of a chamber with % people in it. Make someone else an owner, or remove the others first — deleting your account would destroy their files too.', members - 1
      USING ERRCODE = '42501';
  END IF;

  -- Logged before the delete: the audit row's FKs are ON DELETE SET NULL, so
  -- writing afterwards would lose who did what.
  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, metadata)
  VALUES (t_id, uid, (SELECT email FROM auth.users WHERE id = uid),
          'account_deleted', 'profiles',
          jsonb_build_object('was_role', my_role, 'chamber_deleted', (my_role = 'owner' AND members = 1)));

  IF my_role = 'owner' AND members = 1 THEN
    -- Sole occupant: the chamber and every record in it goes. licenses is
    -- deleted explicitly, ahead of the tenant, so its own audit trigger still
    -- sees a live tenant_id to log against — leaving it to ON DELETE CASCADE
    -- would fire that trigger after the tenant row is already gone.
    DELETE FROM public.licenses WHERE tenant_id = t_id;
    DELETE FROM public.tenants WHERE id = t_id;
    outcome := 'chamber_and_account_deleted';
  ELSE
    outcome := 'account_deleted';
  END IF;

  DELETE FROM auth.users WHERE id = uid;
  RETURN jsonb_build_object('outcome', outcome);
END; $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
