-- Found live during Security Pass 1 (tenant-isolation write testing): the
-- Approve/Reject document-review action (updateDocumentAnalysisStatus,
-- src/lib/ai.functions.ts) has been completely non-functional for every
-- tenant since at least 20260820041000_grant_housekeeping.sql, which
-- granted ai_documents only SELECT/INSERT to authenticated — no UPDATE —
-- while the app's own review-status update goes through the RLS-scoped
-- client (context.supabase), never supabaseAdmin. Worse: ai_documents never
-- had an UPDATE RLS policy at all, even before that migration, so the
-- update would have silently affected zero rows (masked by
-- DocumentIntelligence.tsx's optimistic UI update) rather than erroring —
-- meaning this likely never worked, not just regressed on 20260820.
--
-- Confirmed live: clicking Approve visibly flips to "Approved" for an
-- instant, then silently reverts to "Pending review" on the reload that
-- follows a failed call, with no error ever shown to the user. Confirmed
-- via direct SQL that the status column was never actually written.
--
-- Same authorization shape as every other tenant table already using this
-- exact policy name convention (see e.g. "Tenant members update clients") —
-- any tenant member may update; delete stays creator-or-admin only, per the
-- existing (and correctly working) DELETE policy on this table.
GRANT UPDATE ON public.ai_documents TO authenticated;

CREATE POLICY "Tenant members update document analyses" ON public.ai_documents
  FOR UPDATE TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
