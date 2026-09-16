-- The support contact address moves from chambers@lexdiary.online to
-- lexdiary.online@gmail.com.
--
-- module_denied_message() (20260908090500_enforce_module_entitlement.sql)
-- produces the "not included on this chamber's plan" error that the
-- database raises when an unpurchased module is used. It deliberately uses
-- the same wording as the TypeScript requireModule() copies, so a user sees
-- one message whether the Worker or the database stopped them — which means
-- the address has to change here too, or the two would disagree.
--
-- Body is otherwise identical to the original.

CREATE OR REPLACE FUNCTION public.module_denied_message(p_module TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_module
    WHEN 'matters'             THEN 'Case/matter tracking'
    WHEN 'clients'             THEN 'Client management'
    WHEN 'diary'               THEN 'The court diary'
    WHEN 'documents'           THEN 'Document intake (including OCR)'
    WHEN 'billing'             THEN 'Time tracking and billing'
    WHEN 'ai_drafting'         THEN 'AI drafting (including dictation)'
    WHEN 'ai_assistant'        THEN 'The AI case assistant'
    WHEN 'matter_intelligence' THEN 'AI matter intelligence'
    ELSE p_module
  END || ' isn''t included on this chamber''s plan yet — contact lexdiary.online@gmail.com to add it.';
$$;
REVOKE ALL ON FUNCTION public.module_denied_message(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.module_denied_message(TEXT) TO authenticated;
