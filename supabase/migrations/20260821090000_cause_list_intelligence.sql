-- K2: Cause List Intelligence — schema.
--
-- No live court integration exists anywhere in this codebase, and none is
-- fabricated here: the one real, working source_type is 'manual_import' —
-- an advocate (or admin) pastes/uploads a cause list they already have, and
-- the pipeline parses, normalizes, matches, diffs and reconciles it. The
-- CourtSource abstraction is real and extensible (a live 'api'/'scrape'
-- source_type can be added later without touching this shape), but nothing
-- here claims a live sync that doesn't exist.
--
-- No background-job/cron framework exists in this app either, so ingestion
-- runs synchronously on request rather than as a scheduled job — see
-- cause-list.functions.ts.

------------------------------------------------------------- cause_list_sources
-- One row per court/bench an advocate tracks. Tenant-scoped: this is "my
-- chamber's cause-list sources", not a shared platform catalog — there is
-- no live crawler to share across tenants.
CREATE TABLE public.cause_list_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants ON DELETE CASCADE,
  court TEXT NOT NULL,
  bench TEXT,
  list_type TEXT NOT NULL DEFAULT 'daily' CHECK (list_type IN ('daily', 'supplementary', 'special')),
  source_type TEXT NOT NULL DEFAULT 'manual_import' CHECK (source_type IN ('manual_import')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'never_run' CHECK (sync_status IN ('never_run', 'success', 'failed', 'partial')),
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cause_list_sources_tenant_idx ON public.cause_list_sources (tenant_id);

------------------------------------------------------------- cause_list_records
-- One row per ingested listing, per ingestion. Re-ingesting the same source
-- doesn't overwrite history — the older row's superseded_by is set instead,
-- so change detection always has both versions to diff (§18: preserve
-- change history, never silently overwrite).
CREATE TABLE public.cause_list_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.cause_list_sources ON DELETE CASCADE,
  list_date DATE NOT NULL,
  court TEXT,
  bench TEXT,
  list_type TEXT,
  serial_number TEXT,
  case_number TEXT,
  cnr TEXT,
  petitioner TEXT,
  respondent TEXT,
  advocate_names TEXT,
  stage TEXT,
  court_hall TEXT,
  -- Identity of this listing *within its source*, used to find "the same
  -- listing, re-ingested" across two pastes of the same cause list — CNR
  -- first, falling back to case_number, falling back to a serial+date
  -- composite when neither is present in the source text.
  source_reference TEXT NOT NULL,
  source_timestamp TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  superseded_by UUID REFERENCES public.cause_list_records ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cause_list_records_tenant_idx ON public.cause_list_records (tenant_id, list_date DESC);
CREATE INDEX cause_list_records_source_ref_idx ON public.cause_list_records (source_id, source_reference);
CREATE INDEX cause_list_records_cnr_idx ON public.cause_list_records (tenant_id, cnr) WHERE cnr IS NOT NULL;

-------------------------------------------------------------- cause_list_matches
-- One row per record's match decision. UNIQUE(record_id): re-matching a
-- record updates this row rather than accumulating history — the change
-- log (below) is where history belongs, matches are current-state.
CREATE TABLE public.cause_list_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants ON DELETE CASCADE,
  record_id UUID NOT NULL UNIQUE REFERENCES public.cause_list_records ON DELETE CASCADE,
  matter_id UUID REFERENCES public.matters ON DELETE SET NULL,
  match_method TEXT NOT NULL CHECK (
    match_method IN ('cnr', 'case_number', 'case_number_fuzzy', 'party_name', 'advocate_context', 'manual')
  ),
  confidence NUMERIC NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (
    status IN ('matched', 'needs_review', 'unmatched', 'rejected')
  ),
  reviewed_by UUID REFERENCES auth.users ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cause_list_matches_tenant_idx ON public.cause_list_matches (tenant_id, status);

-------------------------------------------------------------- cause_list_changes
CREATE TABLE public.cause_list_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES public.cause_list_records ON DELETE CASCADE,
  previous_record_id UUID REFERENCES public.cause_list_records ON DELETE SET NULL,
  change_type TEXT NOT NULL CHECK (
    change_type IN (
      'new_listing', 'date_changed', 'serial_changed', 'hall_changed',
      'bench_changed', 'stage_changed', 'unchanged'
    )
  ),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cause_list_changes_record_idx ON public.cause_list_changes (record_id);
CREATE INDEX cause_list_changes_tenant_idx ON public.cause_list_changes (tenant_id, detected_at DESC);

------------------------------------------------------ hearings reconciliation
-- Nullable, source-derived columns — reusing the existing hearing model
-- (§7) instead of a parallel entity. cause_list_record_id is the
-- reconciliation link: ingestion finds-or-creates against it rather than
-- always inserting, which is what prevents duplicate hearings on re-ingest.
ALTER TABLE public.hearings
  ADD COLUMN IF NOT EXISTS cnr TEXT,
  ADD COLUMN IF NOT EXISTS court_hall TEXT,
  ADD COLUMN IF NOT EXISTS bench TEXT,
  ADD COLUMN IF NOT EXISTS cause_list_record_id UUID REFERENCES public.cause_list_records ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS hearings_cause_list_record_idx ON public.hearings (cause_list_record_id)
  WHERE cause_list_record_id IS NOT NULL;

----------------------------------------------------------------------- grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cause_list_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cause_list_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cause_list_matches TO authenticated;
GRANT SELECT, INSERT              ON public.cause_list_changes    TO authenticated;
GRANT ALL ON public.cause_list_sources TO service_role;
GRANT ALL ON public.cause_list_records TO service_role;
GRANT ALL ON public.cause_list_matches TO service_role;
GRANT ALL ON public.cause_list_changes TO service_role;

ALTER TABLE public.cause_list_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cause_list_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cause_list_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cause_list_changes ENABLE ROW LEVEL SECURITY;

-------------------------------------------------------------------------- RLS
-- Same template as every other tenant-owned table (matters/hearings):
-- members read/write their own tenant's rows, admins additionally delete,
-- platform admins retain their existing cross-tenant read access pattern
-- for the superadmin monitoring page.
CREATE POLICY "Tenant members view cause_list_sources" ON public.cause_list_sources
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create cause_list_sources" ON public.cause_list_sources
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND created_by = auth.uid());
CREATE POLICY "Tenant members update cause_list_sources" ON public.cause_list_sources
  FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant admins delete cause_list_sources" ON public.cause_list_sources
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "Platform admins view all cause_list_sources" ON public.cause_list_sources
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins manage cause_list_sources" ON public.cause_list_sources
  FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Tenant members view cause_list_records" ON public.cause_list_records
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create cause_list_records" ON public.cause_list_records
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND created_by = auth.uid());
CREATE POLICY "Tenant members update cause_list_records" ON public.cause_list_records
  FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant admins delete cause_list_records" ON public.cause_list_records
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "Platform admins view all cause_list_records" ON public.cause_list_records
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Tenant members view cause_list_matches" ON public.cause_list_matches
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create cause_list_matches" ON public.cause_list_matches
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members update cause_list_matches" ON public.cause_list_matches
  FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant admins delete cause_list_matches" ON public.cause_list_matches
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant members view cause_list_changes" ON public.cause_list_changes
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create cause_list_changes" ON public.cause_list_changes
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id());

------------------------------------------------------------------- audit log
-- Reuses the existing generic mutation logger (audit_log migration) rather
-- than a second audit system — every insert/update/delete on these tables
-- now shows up in the same audit_log table every other tenant-owned table
-- already writes to.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cause_list_sources', 'cause_list_records', 'cause_list_matches']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.log_tenant_mutation()',
      t || '_audit_log', t
    );
  END LOOP;
END $$;

-------------------------------------------------------------- feature toggle
-- Same JSONB toggle pattern as whatsapp_enabled/ai_morning_brief_enabled —
-- reused, not reinvented. Default enabled (?? true client-side) so nothing
-- regresses for existing tenants; a platform admin can turn it off from the
-- same /admin/settings/integrations page.
COMMENT ON COLUMN public.licenses.integrations IS
  'Per-tenant feature toggles: whatsapp_enabled, ai_morning_brief_enabled, cause_list_enabled. All default true when absent except whatsapp_enabled (opt-in).';
