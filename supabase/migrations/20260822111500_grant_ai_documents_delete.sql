-- Found alongside the UPDATE fix in 20260822110000: ai_documents also has a
-- DELETE RLS policy ("Creator or admin delete document analyses") with no
-- matching GRANT — the exact same trap (a policy that can never fire because
-- the underlying privilege was never granted). No UI currently exposes a
-- delete action for document analyses, so this isn't an active regression
-- like the UPDATE one was, but it's the same bug class and would silently
-- repeat the instant a delete feature is added. Closing it now rather than
-- leaving a second dead policy in place.
GRANT DELETE ON public.ai_documents TO authenticated;
