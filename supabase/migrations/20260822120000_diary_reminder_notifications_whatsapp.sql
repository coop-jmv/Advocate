-- Daily diary reminder: a general-purpose in-app notification system, plus
-- the WhatsApp send infrastructure needed to deliver a "today's hearings"
-- digest to a chamber's own team (not clients — that is a separate,
-- unbuilt, client-facing consent surface). The daily trigger itself
-- (pg_cron + pg_net calling a new edge function) is added at the bottom of
-- this migration.
--
-- Design note carried over from the audit's UTC/IST bug (git: "Fix UTC-vs-IST
-- date bug in Diary, Morning Brief, Dashboard and Insights"): every "today"
-- in this feature is computed once, explicitly, in Asia/Kolkata, by the
-- caller — never left to a column default's server-local `current_date`.

--------------------------------------------------------------- notifications
-- General-purpose, addressed to one recipient (not tenant-wide), so
-- "mark as read" only ever touches the reading user's own row. Append-only
-- from the client's point of view: every INSERT comes from a service-role
-- context (the digest function today; any future feature that wants to
-- notify a user goes through the same table, never invents its own).
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id) WHERE read_at IS NULL;

GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users mark own notifications read" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- No INSERT policy for `authenticated` at all — a client can never forge a
-- notification's title/body/link. Every row is written by service_role.

----------------------------------------------------------------- consent (S.6)
-- WhatsApp send is a new disclosure of personal data (phone number) to a
-- third-party processor (the WhatsApp BSP) — that is the DPDP-relevant event,
-- same category as 'ai_processing' covering the AI vendor. In-app
-- notifications need no new consent; they're core service functionality
-- already covered by 'service_provision'.
ALTER TABLE public.consents DROP CONSTRAINT consents_purpose_check;
ALTER TABLE public.consents ADD CONSTRAINT consents_purpose_check
  CHECK (purpose IN ('service_provision', 'ai_processing', 'product_updates', 'whatsapp_notifications'));
-- Deliberately NOT backfilled for existing accounts (unlike service_provision/
-- ai_processing at signup) — WhatsApp consent must be an opt-in action taken
-- on the Profile screen, never assumed.

------------------------------------------------------------- whatsapp_messages
-- Delivery log, one row per send attempt. Admin-visible (not member-visible)
-- so a chamber owner can answer "why did I get this message" without a
-- support ticket, same visibility line as the audit log.
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  recipient_profile_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  phone TEXT NOT NULL,
  hearing_date DATE NOT NULL,
  hearing_count INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gupshup',
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'read')),
  status_detail TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_messages_tenant_date_idx ON public.whatsapp_messages (tenant_id, hearing_date);
CREATE INDEX whatsapp_messages_provider_id_idx ON public.whatsapp_messages (provider_message_id);

GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins view own tenant whatsapp log" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

---------------------------------------------------------- whatsapp_usage_daily
-- Cost-control cap, keyed by tenant (unlike ai_usage_daily, which is per
-- user — WhatsApp spend is a chamber-level concern). usage_date is always
-- supplied explicitly by the caller (the IST date the digest computed once),
-- never defaulted to Postgres current_date — see the note at the top of this
-- file about why.
CREATE TABLE public.whatsapp_usage_daily (
  tenant_id UUID NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  send_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, usage_date)
);
GRANT SELECT ON public.whatsapp_usage_daily TO authenticated;
GRANT ALL ON public.whatsapp_usage_daily TO service_role;
ALTER TABLE public.whatsapp_usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins view own tenant whatsapp usage" ON public.whatsapp_usage_daily
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

-- SECURITY DEFINER, but unlike increment_ai_usage() this is never called by
-- an authenticated user — only by the digest edge function's service-role
-- client, which has no auth.uid() to fall back on. p_tenant_id and
-- p_ist_date are therefore both explicit arguments, not derived. Raises if
-- the increment would exceed the plan's daily cap, so the caller can catch
-- the exception and skip just that tenant.
CREATE OR REPLACE FUNCTION public.increment_whatsapp_usage(p_tenant_id UUID, p_ist_date DATE, p_count INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_count INTEGER;
  tenant_plan TEXT;
  daily_cap INTEGER;
BEGIN
  SELECT plan INTO tenant_plan FROM public.licenses WHERE tenant_id = p_tenant_id;
  daily_cap := public.plan_limit(tenant_plan, 'whatsapp_messages_per_day');

  INSERT INTO public.whatsapp_usage_daily (tenant_id, usage_date, send_count)
  VALUES (p_tenant_id, p_ist_date, p_count)
  ON CONFLICT (tenant_id, usage_date)
  DO UPDATE SET send_count = public.whatsapp_usage_daily.send_count + p_count
  RETURNING send_count INTO new_count;

  IF daily_cap IS NOT NULL AND new_count > daily_cap THEN
    RAISE EXCEPTION 'WhatsApp daily send cap (%) exceeded for tenant %', daily_cap, p_tenant_id
      USING ERRCODE = '22023';
  END IF;

  RETURN new_count;
END; $$;
REVOKE ALL ON FUNCTION public.increment_whatsapp_usage(UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_whatsapp_usage(UUID, DATE, INTEGER) TO service_role;

-------------------------------------------------------------- plan_limit arm
-- Placeholder caps — real Gupshup/Interakt per-conversation pricing isn't
-- known yet. Treat these numbers as product/finance's to set before launch,
-- not as reviewed limits.
CREATE OR REPLACE FUNCTION public.plan_limit(p_plan TEXT, p_resource TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_resource
    WHEN 'matters' THEN
      CASE p_plan WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 50 WHEN 'solo_pro' THEN 200 ELSE NULL END
    WHEN 'clients' THEN
      CASE p_plan WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 50 WHEN 'solo_pro' THEN 200 ELSE NULL END
    WHEN 'ai_calls_per_day' THEN
      CASE p_plan WHEN 'trial' THEN 20 WHEN 'solo_basic' THEN 40 WHEN 'solo_pro' THEN 150 WHEN 'chamber' THEN 400 ELSE 20 END
    WHEN 'storage_mb' THEN
      CASE p_plan WHEN 'trial' THEN 100 WHEN 'solo_basic' THEN 1000 WHEN 'solo_pro' THEN 5000 WHEN 'chamber' THEN 25000 ELSE 100 END
    WHEN 'seats_included' THEN
      CASE p_plan WHEN 'chamber' THEN 2 ELSE 1 END
    WHEN 'whatsapp_messages_per_day' THEN
      CASE p_plan WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 20 WHEN 'solo_pro' THEN 50 WHEN 'chamber' THEN 150 ELSE 10 END
    ELSE NULL
  END;
$$;
COMMENT ON FUNCTION public.plan_limit IS 'NULL return means unlimited for that plan/resource.';

------------------------------------------------------- pg_cron / pg_net / vault
-- Both confirmed available on this project but not previously enabled — this
-- is the first migration to touch cluster-level extensions rather than the
-- public schema. The shared secret the cron call and the edge function agree
-- on lives in Vault (encrypted at rest), not a plain table/column.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- idempotent: safe to re-run this migration without duplicating the secret
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_shared_secret');
  END IF;
END $$;

-- NOTE: the URL below is hardcoded to this project's ref
-- (cjcjfdwdlsdgyvshuncn, per supabase/config.toml) because pg_cron/pg_net SQL
-- cannot read an environment variable. Copying this migration verbatim into
-- a second Supabase project (a staging environment, a fork) would silently
-- point that project's cron at THIS project's edge function — update the
-- URL by hand if this migration is ever reused elsewhere.
--
-- Schedule is UTC. 30 1 * * * = 07:00 IST.
SELECT cron.schedule(
  'diary-whatsapp-digest',
  '30 1 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://cjcjfdwdlsdgyvshuncn.supabase.co/functions/v1/whatsapp-diary-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- Kill switch, for the record: `SELECT cron.unschedule('diary-whatsapp-digest');`
-- stops the daily run immediately with no code path to trust — the cheapest,
-- most reliable first-line safety valve during rollout.
