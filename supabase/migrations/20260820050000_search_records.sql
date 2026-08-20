-- Backs the header search box, which previously read "Search CNR, matter or
-- client" over a non-interactive <div> — no search existed at all, for CNR
-- or anything else (there is no cnr column; matters are found by case
-- number, title, client or opposing party).
--
-- SECURITY INVOKER, deliberately not DEFINER: this only reads, and the
-- existing SELECT policies on matters/clients (tenant_id = current_tenant_id())
-- already scope results correctly for whichever authenticated user calls it.
-- No elevated privilege is needed or wanted for a search box.
CREATE OR REPLACE FUNCTION public.search_records(p_query TEXT)
RETURNS TABLE(kind TEXT, id UUID, title TEXT, subtitle TEXT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  (SELECT 'matter'::text, m.id, m.title,
          COALESCE(NULLIF(m.case_number, ''), NULLIF(m.client_name, ''), m.court, '')::text
     FROM public.matters m
    WHERE length(trim(p_query)) > 0
      AND (m.title ILIKE '%' || p_query || '%'
           OR m.case_number ILIKE '%' || p_query || '%'
           OR m.client_name ILIKE '%' || p_query || '%'
           OR m.opposing_party ILIKE '%' || p_query || '%')
    ORDER BY m.created_at DESC
    LIMIT 6)
  UNION ALL
  (SELECT 'client'::text, c.id, c.name,
          COALESCE(NULLIF(c.phone, ''), NULLIF(c.email, ''), '')::text
     FROM public.clients c
    WHERE length(trim(p_query)) > 0
      AND (c.name ILIKE '%' || p_query || '%'
           OR c.phone ILIKE '%' || p_query || '%'
           OR c.email ILIKE '%' || p_query || '%')
    ORDER BY c.created_at DESC
    LIMIT 6)
$$;
REVOKE ALL ON FUNCTION public.search_records(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_records(TEXT) TO authenticated;
