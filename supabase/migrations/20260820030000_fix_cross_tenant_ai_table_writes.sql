-- CRITICAL: closes a cross-tenant write hole on the four AI-owned tables.
--
-- Reproduced against the live database with an ordinary user token: an
-- authenticated user in tenant A could POST to ai_documents / ai_drafts /
-- ai_conversations / ai_messages with tenant_id set to tenant B and the row
-- was accepted (HTTP 201). The victim firm then saw the planted row in its own
-- Documents / Drafting / Assistant screens, because their SELECT policy is
-- scoped by tenant_id and the row now carried their tenant_id.
--
-- Two independent defects combined:
--
--   1. set_tenant_from_user() only derived tenant_id `IF NEW.tenant_id IS
--      NULL`, so a client-supplied tenant_id was left untouched. Every other
--      tenant-owned table takes tenant_id from a server-side DEFAULT
--      (current_tenant_id()) that a client cannot influence.
--
--   2. The INSERT policies on these four tables checked only
--      `user_id = auth.uid()` and never constrained tenant_id — unlike
--      matters/clients/hearings/invoices/time_entries, whose INSERT policies
--      carry `tenant_id = current_tenant_id()` and correctly rejected the same
--      attack with 403.
--
-- Note on why this was easy to miss: with PostgREST's default
-- `Prefer: return=representation`, the attack appears to fail with a 403,
-- because reading the row back trips the SELECT policy. The INSERT itself had
-- already succeeded; `Prefer: return=minimal` returns 201 and the row persists.
--
-- The UPDATE/DELETE policies on these tables are tightened at the same time.
-- They allowed `user_id = auth.uid()` with no tenant predicate, so a row
-- belonging to a different tenant could be mutated by whoever created it —
-- reachable if a user's tenant assignment ever changes.

------------------------------------------------------- server-side tenancy
-- tenant_id is now always derived from the owning user's profile and never
-- taken from client input, matching the guarantee the other tables get from
-- their column DEFAULT.
CREATE OR REPLACE FUNCTION public.set_tenant_from_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  derived UUID;
BEGIN
  SELECT tenant_id INTO derived FROM public.profiles WHERE id = NEW.user_id;

  IF derived IS NULL THEN
    RAISE EXCEPTION 'Cannot determine the chamber for this record.' USING ERRCODE = '42501';
  END IF;

  -- Deliberately unconditional: a client-supplied tenant_id is overwritten,
  -- not honoured.
  NEW.tenant_id := derived;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.set_tenant_from_user() FROM PUBLIC, anon, authenticated;

------------------------------------------------------------ policy hardening
-- Written out per table rather than generated: these are the rules that keep
-- one firm's privileged material out of another's, and they should be plainly
-- readable in the migration that sets them.

-- ai_documents
DROP POLICY IF EXISTS "Tenant members create document analyses" ON public.ai_documents;
CREATE POLICY "Tenant members create document analyses" ON public.ai_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS "Creator or admin delete document analyses" ON public.ai_documents;
CREATE POLICY "Creator or admin delete document analyses" ON public.ai_documents
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND (user_id = auth.uid() OR public.is_tenant_admin(tenant_id)));

-- ai_drafts
DROP POLICY IF EXISTS "Tenant members create drafts" ON public.ai_drafts;
CREATE POLICY "Tenant members create drafts" ON public.ai_drafts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS "Creator or admin update drafts" ON public.ai_drafts;
CREATE POLICY "Creator or admin update drafts" ON public.ai_drafts
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND (user_id = auth.uid() OR public.is_tenant_admin(tenant_id)))
  WITH CHECK (tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS "Creator or admin delete drafts" ON public.ai_drafts;
CREATE POLICY "Creator or admin delete drafts" ON public.ai_drafts
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND (user_id = auth.uid() OR public.is_tenant_admin(tenant_id)));

-- ai_conversations
DROP POLICY IF EXISTS "Tenant members create conversations" ON public.ai_conversations;
CREATE POLICY "Tenant members create conversations" ON public.ai_conversations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS "Creator or admin update conversations" ON public.ai_conversations;
CREATE POLICY "Creator or admin update conversations" ON public.ai_conversations
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND (user_id = auth.uid() OR public.is_tenant_admin(tenant_id)))
  WITH CHECK (tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS "Creator or admin delete conversations" ON public.ai_conversations;
CREATE POLICY "Creator or admin delete conversations" ON public.ai_conversations
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND (user_id = auth.uid() OR public.is_tenant_admin(tenant_id)));

-- ai_messages
DROP POLICY IF EXISTS "Tenant members create messages" ON public.ai_messages;
CREATE POLICY "Tenant members create messages" ON public.ai_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS "Creator or admin delete messages" ON public.ai_messages;
CREATE POLICY "Creator or admin delete messages" ON public.ai_messages
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND (user_id = auth.uid() OR public.is_tenant_admin(tenant_id)));

-------------------------------------------------------------------- cleanup
-- Remove the rows planted while proving the vulnerability, and any other row
-- whose tenant_id disagrees with its owner's profile (the signature this bug
-- leaves behind).
DELETE FROM public.ai_messages m
 WHERE m.tenant_id IS DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = m.user_id);
DELETE FROM public.ai_drafts d
 WHERE d.tenant_id IS DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = d.user_id);
DELETE FROM public.ai_documents d
 WHERE d.tenant_id IS DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = d.user_id);
DELETE FROM public.ai_conversations c
 WHERE c.tenant_id IS DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = c.user_id);
