ALTER TABLE public.tenant_invites ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
