-- Convenience RPC for the caller's own tenant: plan, estimated storage
-- used (see the storage_mb comment in plan_limit's migration — this is a
-- text-size proxy, no real file storage exists), and its limit.
CREATE OR REPLACE FUNCTION public.my_usage_summary()
RETURNS TABLE(plan TEXT, used_storage_mb NUMERIC, storage_limit_mb INTEGER, seats_used INTEGER, seats_limit INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_id UUID;
  lic_plan TEXT;
  lic_seats INTEGER;
BEGIN
  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = auth.uid();
  SELECT l.plan, l.seats INTO lic_plan, lic_seats FROM public.licenses l WHERE l.tenant_id = t_id;

  RETURN QUERY SELECT
    COALESCE(lic_plan, 'trial'),
    public.tenant_storage_estimate_mb(t_id),
    public.plan_limit(COALESCE(lic_plan, 'trial'), 'storage_mb'),
    (SELECT count(*)::INTEGER FROM public.profiles WHERE tenant_id = t_id) +
      (SELECT count(*)::INTEGER FROM public.tenant_invites WHERE tenant_id = t_id AND status = 'pending'),
    lic_seats;
END; $$;
REVOKE ALL ON FUNCTION public.my_usage_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_usage_summary() TO authenticated;
