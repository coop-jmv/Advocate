-- Two-factor authentication (TOTP), enforced by the database.
--
-- Policy (product decision, 2026-09-21): optional for every user, required for
-- platform admins.
--
-- Why the database and not only the login screen: a login screen that asks
-- for the code can be skipped. Signing in with just a password yields a valid
-- session at assurance level aal1; only entering the authenticator code
-- upgrades it to aal2. If only the UI checked, someone holding a stolen
-- password could call the API directly with the aal1 session. So:
--
--   1. mfa_satisfied(): true when the session is aal2, or when the user has no
--      verified factor (2FA not switched on — nothing to enforce).
--   2. A PostgREST pre-request hook raises for any authenticated request that
--      fails it. That covers every table AND every RPC — including SECURITY
--      DEFINER functions, which bypass RLS (export_chamber_data,
--      delete_my_account, set_member_role, ...). The Cloudflare Workers, the
--      Edge Functions and the app's server functions all reach the database
--      through PostgREST under the user's JWT, so they are covered too.
--   3. The same check as a RESTRICTIVE RLS policy on every RLS-enabled table:
--      a backstop for anything that does not go through PostgREST (Realtime).
--   4. is_platform_admin() additionally requires aal2 when checking the
--      caller, so superadmin powers are unavailable until 2FA is verified —
--      an admin who has not set 2FA up has no admin rights at all.
--
-- service_role is unaffected (it bypasses RLS and is not 'authenticated' in the
-- hook), so signup triggers, crons and the admin server functions keep working.
--
-- Kill switch if the hook ever misbehaves:
--   ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst, 'reload config';

------------------------------------------------------------------ 1. check
CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f
         WHERE f.user_id = auth.uid() AND f.status = 'verified'
      );
$$;
REVOKE ALL ON FUNCTION public.mfa_satisfied() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.mfa_satisfied() IS
  'True when the current session is aal2, or the user has no verified MFA factor. Used by the PostgREST pre-request hook and the mfa_required RLS policies.';

------------------------------------------------------------------ 2. pre-request hook
CREATE OR REPLACE FUNCTION public.enforce_mfa_pre_request()
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.jwt() ->> 'role' = 'authenticated' AND NOT public.mfa_satisfied() THEN
    -- 42501 → HTTP 403. The message is user-facing on purpose: the Workers'
    -- dbError() passes 42501 messages through verbatim.
    RAISE EXCEPTION 'Two-factor verification required. Sign in again and enter the code from your authenticator app.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_mfa_pre_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_mfa_pre_request() TO anon, authenticated, service_role;

ALTER ROLE authenticator SET pgrst.db_pre_request TO 'public.enforce_mfa_pre_request';
NOTIFY pgrst, 'reload config';

------------------------------------------------------------------ 3. RLS backstop
-- (SELECT ...) makes Postgres evaluate the check once per statement rather
-- than once per row.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity LOOP
    EXECUTE format('DROP POLICY IF EXISTS mfa_required ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY mfa_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING ((SELECT public.mfa_satisfied())) WITH CHECK ((SELECT public.mfa_satisfied()))',
      t
    );
  END LOOP;
END $$;

------------------------------------------------------------------ 4. admins need aal2
-- Every caller passes auth.uid() (policies, purge_expired_chambers), so the
-- aal2 requirement applies exactly when an admin is acting for themselves.
-- A check about someone else's id is unchanged.
CREATE OR REPLACE FUNCTION public.is_platform_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = uid)
     AND (uid IS DISTINCT FROM auth.uid() OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2');
$$;

------------------------------------------------------------------ admin guard helper
-- Lets the /admin route tell "not an admin" apart from "admin who still has to
-- set up / enter 2FA", which is_platform_admin() deliberately cannot.
CREATE OR REPLACE FUNCTION public.my_admin_status()
RETURNS TABLE(is_admin BOOLEAN, mfa_enrolled BOOLEAN, aal TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()),
    EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified'),
    COALESCE(auth.jwt() ->> 'aal', 'aal1');
$$;
REVOKE ALL ON FUNCTION public.my_admin_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_admin_status() TO authenticated;

------------------------------------------------------------------ admin Users page
-- Which users have two-factor login on. The admin API's listUsers() does not
-- include MFA factors, and auth.mfa_factors is unreachable through PostgREST,
-- so the superadmin Users page reads this instead. service_role only: the
-- page's server function calls it after proving the caller is a verified admin.
CREATE OR REPLACE FUNCTION public.users_with_verified_mfa()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT user_id FROM auth.mfa_factors WHERE status = 'verified';
$$;
REVOKE ALL ON FUNCTION public.users_with_verified_mfa() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.users_with_verified_mfa() TO service_role;
