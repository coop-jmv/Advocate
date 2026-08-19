-- Fix "up to 5 matterss" (resource name is already plural, the format
-- string's trailing literal 's' was a copy-paste leftover).
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
      RAISE EXCEPTION 'Your % plan allows up to % % — upgrade to add more.',
        COALESCE(lic_plan, 'trial'), max_allowed, resource
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_resource_limit() FROM PUBLIC, anon, authenticated;
