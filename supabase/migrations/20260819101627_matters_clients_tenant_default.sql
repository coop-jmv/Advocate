-- matters/clients omitted a server-side default for tenant_id (unlike the
-- retrofitted AI tables, which get it from a BEFORE INSERT trigger keyed on
-- user_id). Give them the same guarantee via current_tenant_id(), so an
-- INSERT never needs to — and never can — supply tenant_id itself.
ALTER TABLE public.matters ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.clients ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
