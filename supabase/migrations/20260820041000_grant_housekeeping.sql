-- Housekeeping flagged by the isolation audit, both low-severity because RLS
-- already denies what these grants would otherwise allow — but "already
-- denied by a policy that could change" is not the same guarantee as "not
-- granted", and the migration comments claimed the latter.

------------------------------------------------------- revoke blanket grants
-- Supabase's default grants give every public-schema table ALL to anon and
-- authenticated. Every table here already relies on RLS alone; this makes the
-- audit_log migration's stated intent ("no client ever gets INSERT/UPDATE/
-- DELETE") actually true at the grant level, not just true because no policy
-- happens to permit it yet.
--
-- profiles keeps its existing narrower grant from an earlier migration
-- (column-restricted UPDATE) and is left alone.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_conversations','ai_documents','ai_drafts','ai_messages','ai_usage_daily',
    'audit_log','clients','hearings','invoices','licenses','matters',
    'platform_admins','tenant_invites','tenants','time_entries','consents'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Grant back only what each role's policies actually use. RLS still does the
-- row-level decision; this bounds the statement types it is ever asked to
-- decide on, per table.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT, INSERT              ON public.ai_documents      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_drafts         TO authenticated;
GRANT SELECT, INSERT              ON public.ai_messages        TO authenticated;
GRANT SELECT                      ON public.ai_usage_daily     TO authenticated;
GRANT SELECT                      ON public.audit_log          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hearings           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices           TO authenticated;
GRANT SELECT                      ON public.licenses           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matters            TO authenticated;
GRANT SELECT                      ON public.platform_admins    TO authenticated;
GRANT SELECT, INSERT, UPDATE       ON public.tenant_invites      TO authenticated;
GRANT SELECT                      ON public.tenants            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries       TO authenticated;
GRANT SELECT, UPDATE              ON public.consents           TO authenticated;

-------------------------------------------------- restrict profile deletion
-- "Users manage own profile" was FOR ALL, which included DELETE — letting a
-- member delete their profile row directly and orphan their login from the
-- chamber without going through delete_my_account()'s last-owner check.
-- delete_my_account() removes the auth.users row instead, which cascades to
-- profiles on its own (profiles.id references auth.users ON DELETE CASCADE),
-- so no legitimate path needs client-side DELETE on this table at all.
DROP POLICY IF EXISTS "Users manage own profile" ON public.profiles;
CREATE POLICY "Users manage own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
