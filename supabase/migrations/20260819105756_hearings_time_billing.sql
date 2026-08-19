-- Real, tenant-scoped hearings/time-entries/invoices, replacing the mock
-- Diary and Billing screens. Same pattern as matters/clients: tenant-wide
-- read/create/update, owner/admin-only delete, tenant_id server-derived via
-- current_tenant_id() default — never accepted from the client.
--
-- Invoices are manually-tracked status only (draft/sent/paid/overdue set by
-- the advocate). No payment gateway integration here — that needs a real
-- Razorpay/UPI decision, webhook signature verification and idempotency
-- handling, which is separate, higher-risk work (see the audit's Billing/
-- Payment Security section) and is not something to bolt on incidentally.

CREATE TABLE public.hearings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants ON DELETE CASCADE,
  matter_id UUID REFERENCES public.matters ON DELETE SET NULL,
  matter_title TEXT NOT NULL,
  court TEXT,
  hearing_date DATE NOT NULL,
  hearing_time TEXT,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cause_list_awaited', 'adjourned', 'completed')),
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hearings_tenant_date_idx ON public.hearings (tenant_id, hearing_date);

CREATE TABLE public.time_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants ON DELETE CASCADE,
  matter_id UUID REFERENCES public.matters ON DELETE SET NULL,
  matter_title TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT current_date,
  task TEXT NOT NULL,
  hours NUMERIC(6, 2) NOT NULL CHECK (hours > 0),
  rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
  billed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX time_entries_tenant_idx ON public.time_entries (tenant_id);

CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  matter_id UUID REFERENCES public.matters ON DELETE SET NULL,
  matter_title TEXT,
  invoice_number TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  due_date DATE,
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);
CREATE INDEX invoices_tenant_idx ON public.invoices (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hearings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.hearings TO service_role;
GRANT ALL ON public.time_entries TO service_role;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.hearings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER hearings_updated_at BEFORE UPDATE ON public.hearings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Tenant members view hearings" ON public.hearings
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create hearings" ON public.hearings
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND created_by = auth.uid());
CREATE POLICY "Tenant members update hearings" ON public.hearings
  FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant admins delete hearings" ON public.hearings
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant members view time entries" ON public.time_entries
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create time entries" ON public.time_entries
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND created_by = auth.uid());
CREATE POLICY "Tenant members update time entries" ON public.time_entries
  FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant admins delete time entries" ON public.time_entries
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant members view invoices" ON public.invoices
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant members create invoices" ON public.invoices
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND created_by = auth.uid());
CREATE POLICY "Tenant members update invoices" ON public.invoices
  FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Tenant admins delete invoices" ON public.invoices
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));
