-- The public /contact "Request access" form previously had no backend at
-- all: its onSubmit just showed a fake success toast and discarded
-- everything typed into it (found live during a marketing-page review —
-- confirmed via network monitoring that submitting the form fires zero
-- requests). Every prospective customer who used it believed their inquiry
-- was sent; none were ever captured anywhere. This table is where real
-- submissions land instead.
--
-- Submitted by anonymous, unauthenticated visitors, so the write path is a
-- server function using the service-role client (see
-- src/integrations/supabase/client.server.ts), never a client-side insert —
-- RLS below only needs to govern who can *read*/*manage* these afterward,
-- which is platform admins only, same pattern as cause_list_sources.
CREATE TABLE public.contact_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  enrolment_no TEXT,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  court TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contact_requests_status_idx ON public.contact_requests (status, created_at DESC);

GRANT SELECT, UPDATE ON public.contact_requests TO authenticated;
GRANT ALL ON public.contact_requests TO service_role;
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins view contact_requests" ON public.contact_requests
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins manage contact_requests" ON public.contact_requests
  FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
