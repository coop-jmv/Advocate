-- Record two-factor enrolment and removal in the chamber's own audit_log.
--
-- The gap this closes: 20260921090000_mfa_enforcement.sql made 2FA real, and
-- the superadmin "Reset 2FA" path writes an audit row (src/lib/
-- admin-users.functions.ts), but a user switching their OWN 2FA on or off went
-- unrecorded. src/lib/mfa.ts calls supabase.auth.mfa.enroll()/unenroll()
-- straight from the browser, and src/components/app/TwoFactorSettings.tsx
-- writes nothing to audit_log. Turning 2FA off is one of the first things an
-- attacker holding a stolen session does, and a chamber owner reading
-- /app/audit-log would have seen nothing at all.
--
-- Done as a trigger rather than an audit_log insert next to the client call,
-- deliberately: the browser is the one party that must not be trusted to
-- report its own security-relevant actions. A trigger fires whether the change
-- came from this app, another client, or the admin API.
--
-- Precedent for attaching a trigger to an auth.* table is public.handle_new_user
-- on auth.users (20260805003318). Same caveat applies: auth schema objects
-- belong to GoTrue, so re-check this after a major Supabase Auth upgrade.

CREATE OR REPLACE FUNCTION public.log_mfa_factor_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  subject_user UUID;
  row_tenant UUID;
  act TEXT;
BEGIN
  -- Only verified factors are worth recording. Enrolment inserts a row as
  -- 'unverified' and flips it to 'verified' once the first code is accepted,
  -- and clearUnverifiedFactors() in src/lib/mfa.ts routinely deletes abandoned
  -- unverified rows. Logging those would bury the two events that matter in
  -- scanned-but-never-finished noise.
  IF TG_OP = 'UPDATE' AND NEW.status = 'verified' AND OLD.status IS DISTINCT FROM 'verified' THEN
    subject_user := NEW.user_id;
    act := 'mfa_enrolled';
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'verified' THEN
    subject_user := OLD.user_id;
    act := 'mfa_unenrolled';
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT tenant_id INTO row_tenant FROM public.profiles WHERE id = subject_user;

  -- auth.uid() is the actor when the user did this themselves. A superadmin
  -- reset goes through the admin API on the service-role key, where auth.uid()
  -- is NULL, so it falls back to the factor's owner — the row then states the
  -- fact ("this user's factor was removed") while the companion 'mfa_reset'
  -- row already written by admin-users.functions.ts names the admin who did it.
  -- Both rows are wanted: one is the event, the other is the authorisation.
  INSERT INTO public.audit_log (
    tenant_id, actor_user_id, actor_email, action, resource_type, resource_id, metadata
  )
  VALUES (
    row_tenant,
    COALESCE(auth.uid(), subject_user),
    (SELECT email FROM auth.users WHERE id = COALESCE(auth.uid(), subject_user)),
    act,
    'auth',
    subject_user,
    jsonb_build_object('source', 'db_trigger', 'self_service', auth.uid() IS NOT NULL)
  );

  RETURN COALESCE(NEW, OLD);
END; $$;

REVOKE ALL ON FUNCTION public.log_mfa_factor_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mfa_factors_audit_log ON auth.mfa_factors;
CREATE TRIGGER mfa_factors_audit_log
  AFTER UPDATE OR DELETE ON auth.mfa_factors
  FOR EACH ROW EXECUTE FUNCTION public.log_mfa_factor_change();
