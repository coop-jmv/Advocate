-- Multi-tenant foundation: tenants, platform admins, licenses, and per-user tenant membership.

CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_admins (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.licenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise')),
  seats INTEGER NOT NULL DEFAULT 1 CHECK (seats > 0),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN tenant_id UUID REFERENCES public.tenants ON DELETE SET NULL,
  ADD COLUMN tenant_role TEXT NOT NULL DEFAULT 'owner' CHECK (tenant_role IN ('owner', 'admin', 'member'));

CREATE OR REPLACE FUNCTION public.is_platform_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = uid);
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(UUID) TO authenticated;

GRANT ALL ON public.tenants TO service_role;
GRANT ALL ON public.platform_admins TO service_role;
GRANT ALL ON public.licenses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Members view own tenant" ON public.tenants
  FOR SELECT TO authenticated
  USING (id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Platform admins view admin list" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins manage licenses" ON public.licenses
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Members view own tenant license" ON public.licenses
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER licenses_updated_at BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a tenant (with a trial license) for every new signup, owned by that user.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_tenant_id UUID;
  tenant_name TEXT;
  tenant_slug TEXT;
BEGIN
  tenant_name := COALESCE(NEW.raw_user_meta_data ->> 'firm_name', NEW.raw_user_meta_data ->> 'full_name', 'New chamber');
  tenant_slug := lower(regexp_replace(tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.tenants (name, slug) VALUES (tenant_name, tenant_slug)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.licenses (tenant_id, plan, status) VALUES (new_tenant_id, 'trial', 'trialing');

  INSERT INTO public.profiles (id, full_name, firm_name, tenant_id, tenant_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'firm_name',
    new_tenant_id,
    'owner'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
