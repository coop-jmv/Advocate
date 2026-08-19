-- Phase 2 of the security audit remediation: the app previously had no real
-- matters/clients data (mock UI only), and the 4 real AI tables were scoped
-- to auth.uid() = user_id — meaning two users in the same firm/tenant could
-- not see each other's work at all. This migration:
--   1. Adds real, tenant-scoped `matters` and `clients` tables.
--   2. Retrofits `tenant_id` onto the 4 existing per-user AI tables and
--      switches their RLS from per-user to per-tenant visibility (any
--      member of the firm can see the firm's AI work; only the creator or
--      an owner/admin can modify/delete a given row).
--
-- Design decision (confirmed with the product owner): matter/document
-- visibility is tenant-wide by default, not per-matter-assignment. Owners/
-- admins can layer a restricted-assignment model on top of this later
-- without a further redesign (a matter_assignees join table + an extra RLS
-- clause), but the default is "everyone in the firm sees the firm's work,"
-- matching how solo/small advocate chambers actually operate.

CREATE TABLE public.matters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  title TEXT NOT NULL,
  client_name TEXT,
  case_number TEXT,
  court TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  opposing_party TEXT,
  filed_date DATE,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX matters_tenant_idx ON public.matters (tenant_id);

CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clients_tenant_idx ON public.clients (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.matters TO service_role;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER matters_updated_at BEFORE UPDATE ON public.matters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Any tenant member can see/create/edit; only owner/admin (or platform
-- admin) can delete — matters/clients are shared firm assets, so deletion
-- is kept to a smaller set of roles than read/write by default.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(target_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND tenant_id = target_tenant AND tenant_role IN ('owner', 'admin')
  );
$$;
REVOKE ALL ON FUNCTION public.is_tenant_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(UUID) TO authenticated;

CREATE POLICY "Tenant members view matters" ON public.matters
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create matters" ON public.matters
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND created_by = auth.uid());
CREATE POLICY "Tenant members update matters" ON public.matters
  FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant admins delete matters" ON public.matters
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant members view clients" ON public.clients
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create clients" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND created_by = auth.uid());
CREATE POLICY "Tenant members update clients" ON public.clients
  FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant admins delete clients" ON public.clients
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------
-- Retrofit tenant_id onto the 4 pre-existing per-user AI tables and move
-- their RLS from "auth.uid() = user_id" to tenant-wide read visibility.
-- ---------------------------------------------------------------------

ALTER TABLE public.ai_conversations ADD COLUMN tenant_id UUID REFERENCES public.tenants ON DELETE CASCADE;
ALTER TABLE public.ai_documents ADD COLUMN tenant_id UUID REFERENCES public.tenants ON DELETE CASCADE;
ALTER TABLE public.ai_drafts ADD COLUMN tenant_id UUID REFERENCES public.tenants ON DELETE CASCADE;
ALTER TABLE public.ai_messages ADD COLUMN tenant_id UUID REFERENCES public.tenants ON DELETE CASCADE;

UPDATE public.ai_conversations c SET tenant_id = p.tenant_id FROM public.profiles p WHERE p.id = c.user_id;
UPDATE public.ai_documents d SET tenant_id = p.tenant_id FROM public.profiles p WHERE p.id = d.user_id;
UPDATE public.ai_drafts d SET tenant_id = p.tenant_id FROM public.profiles p WHERE p.id = d.user_id;
UPDATE public.ai_messages m SET tenant_id = p.tenant_id FROM public.profiles p WHERE p.id = m.user_id;

-- Auto-fill tenant_id on every future insert from the inserting user's
-- profile, so edge functions/server fns don't each need to look it up —
-- and, more importantly, so tenant_id can never be spoofed by the client:
-- it is always derived server-side from the authenticated row owner.
CREATE OR REPLACE FUNCTION public.set_tenant_from_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (SELECT tenant_id FROM public.profiles WHERE id = NEW.user_id);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.set_tenant_from_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ai_conversations_set_tenant BEFORE INSERT ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_from_user();
CREATE TRIGGER ai_documents_set_tenant BEFORE INSERT ON public.ai_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_from_user();
CREATE TRIGGER ai_drafts_set_tenant BEFORE INSERT ON public.ai_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_from_user();
CREATE TRIGGER ai_messages_set_tenant BEFORE INSERT ON public.ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_from_user();

DROP POLICY "Users manage own conversations" ON public.ai_conversations;
CREATE POLICY "Tenant members view conversations" ON public.ai_conversations
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create conversations" ON public.ai_conversations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Creator or admin update conversations" ON public.ai_conversations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_tenant_admin(tenant_id))
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Creator or admin delete conversations" ON public.ai_conversations
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_tenant_admin(tenant_id));

DROP POLICY "Users manage own messages" ON public.ai_messages;
CREATE POLICY "Tenant members view messages" ON public.ai_messages
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create messages" ON public.ai_messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Creator or admin delete messages" ON public.ai_messages
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_tenant_admin(tenant_id));

DROP POLICY "Users manage own document analyses" ON public.ai_documents;
CREATE POLICY "Tenant members view document analyses" ON public.ai_documents
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create document analyses" ON public.ai_documents
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Creator or admin delete document analyses" ON public.ai_documents
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_tenant_admin(tenant_id));

DROP POLICY "Users manage own drafts" ON public.ai_drafts;
CREATE POLICY "Tenant members view drafts" ON public.ai_drafts
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create drafts" ON public.ai_drafts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Creator or admin update drafts" ON public.ai_drafts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_tenant_admin(tenant_id))
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Creator or admin delete drafts" ON public.ai_drafts
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_tenant_admin(tenant_id));
