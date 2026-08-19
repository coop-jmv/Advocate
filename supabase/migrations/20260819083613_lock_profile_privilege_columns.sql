-- profiles.tenant_id / tenant_role are privilege-bearing columns. The
-- existing "Users manage own profile" RLS policy is FOR ALL, so without a
-- column-level restriction any authenticated user could UPDATE their own
-- tenant_role to 'admin' or repoint tenant_id at another tenant. Neither is
-- exploitable today (nothing reads tenant_role/tenant_id for authorization
-- yet), but this closes the gap before that changes.

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, firm_name, enrolment_no) ON public.profiles TO authenticated;
