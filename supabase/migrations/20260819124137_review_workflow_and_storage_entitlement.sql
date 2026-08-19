-- Review/approve/reject workflow for AI document analyses (OCR pipeline
-- output) and drafts (drafting studio + dictation output), mirroring the
-- manual-status pattern already used for invoices. Status is advisory —
-- it does not delete or hide rejected items, it just tells the advocate
-- (and any tenant colleague) which AI output has been vetted.

ALTER TABLE public.ai_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'pending_review'
  CHECK (status IN ('pending_review', 'approved', 'rejected'));
ALTER TABLE public.ai_drafts ADD COLUMN status TEXT NOT NULL DEFAULT 'pending_review'
  CHECK (status IN ('pending_review', 'approved', 'rejected'));

-- Storage-size entitlement. No object storage subsystem exists yet (no
-- S3/R2/Supabase Storage bucket is provisioned anywhere in this app) — the
-- platform does not store uploaded files, only extracted text and AI
-- output. This is therefore a soft, informational limit computed from
-- stored text size (raw_text + drafted content), not a hard block, and it
-- is explicitly labelled as an estimate in the UI. It exists so plan
-- comparison/marketing copy has a real number behind it, not so it can be
-- enforced against something that doesn't exist yet.
CREATE OR REPLACE FUNCTION public.plan_limit(p_plan TEXT, p_resource TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_resource
    WHEN 'matters' THEN
      CASE p_plan WHEN 'trial' THEN 5 WHEN 'starter' THEN 25 WHEN 'pro' THEN 150 ELSE NULL END
    WHEN 'clients' THEN
      CASE p_plan WHEN 'trial' THEN 5 WHEN 'starter' THEN 25 WHEN 'pro' THEN 150 ELSE NULL END
    WHEN 'ai_calls_per_day' THEN
      CASE p_plan WHEN 'trial' THEN 20 WHEN 'starter' THEN 60 WHEN 'pro' THEN 200 WHEN 'enterprise' THEN 500 ELSE 20 END
    WHEN 'storage_mb' THEN
      CASE p_plan WHEN 'trial' THEN 50 WHEN 'starter' THEN 500 WHEN 'pro' THEN 5000 ELSE NULL END
    ELSE NULL
  END;
$$;
COMMENT ON FUNCTION public.plan_limit IS 'NULL return means unlimited for that plan/resource.';

-- Estimated storage used by a tenant, in MB: sum of stored text length
-- (raw_text on ai_documents, content on ai_drafts) converted from
-- characters to an approximate byte count. This is a text-size proxy, not
-- real file storage — there is nothing else to measure yet.
CREATE OR REPLACE FUNCTION public.tenant_storage_estimate_mb(p_tenant_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROUND((
    COALESCE((SELECT sum(length(raw_text)) FROM public.ai_documents WHERE tenant_id = p_tenant_id), 0) +
    COALESCE((SELECT sum(length(content)) FROM public.ai_drafts WHERE tenant_id = p_tenant_id), 0)
  )::NUMERIC / 1048576, 3);
$$;
REVOKE ALL ON FUNCTION public.tenant_storage_estimate_mb(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_storage_estimate_mb(UUID) TO authenticated;
