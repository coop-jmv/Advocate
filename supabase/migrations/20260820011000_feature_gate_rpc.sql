-- Server-side feature gate for edge functions.
--
-- plan_feature() answers "does this plan include X" but every caller would
-- otherwise have to re-derive the caller's plan and decide what to do on a
-- miss. assert_feature() does both and raises, so an edge function gates a
-- paid feature with one call and cannot accidentally fail open.
--
-- OCR is the first consumer: it is a Solo Pro / Chamber feature under the
-- published pricing, and gating it only in the UI would leave the edge
-- function callable directly by a Solo Basic tenant.
CREATE OR REPLACE FUNCTION public.assert_feature(p_feature TEXT)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lic_plan TEXT;
  wa_flag BOOLEAN;
BEGIN
  SELECT l.plan, COALESCE((l.integrations ->> 'whatsapp_enabled')::boolean, false)
    INTO lic_plan, wa_flag
    FROM public.licenses l
    WHERE l.tenant_id = public.current_tenant_id();

  lic_plan := COALESCE(lic_plan, 'trial');

  IF NOT public.plan_feature(lic_plan, p_feature) THEN
    IF p_feature = 'ocr' THEN
      RAISE EXCEPTION 'Document OCR is part of the Solo Pro and Chamber plans. Upgrade to scan documents.'
        USING ERRCODE = '42501';
    ELSIF p_feature = 'whatsapp' THEN
      RAISE EXCEPTION 'WhatsApp messaging is part of the Solo Pro and Chamber plans.'
        USING ERRCODE = '42501';
    ELSIF p_feature = 'team' THEN
      RAISE EXCEPTION 'Team management is part of the Chamber plan.'
        USING ERRCODE = '42501';
    ELSE
      RAISE EXCEPTION 'Your plan does not include %.', p_feature USING ERRCODE = '42501';
    END IF;
  END IF;

  -- WhatsApp additionally requires the platform-admin integration switch.
  IF p_feature = 'whatsapp' AND NOT wa_flag THEN
    RAISE EXCEPTION 'WhatsApp is not switched on for this chamber yet.' USING ERRCODE = '42501';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assert_feature(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_feature(TEXT) TO authenticated;
