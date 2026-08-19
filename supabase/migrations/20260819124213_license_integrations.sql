-- Per-tenant integration entitlements, controlled by the platform admin
-- (part of the license, like plan/status/seats — not self-service). Only
-- WhatsApp exists today; the JSONB shape leaves room for future
-- integrations (SMS, email, etc.) without another migration per toggle.
--
-- IMPORTANT: this only stores whether the entitlement is switched on. No
-- WhatsApp Business API provider (Meta Cloud API, Twilio, Gupshup, ...) is
-- connected — there is no code anywhere that sends a WhatsApp message.
-- Toggling this on gates UI visibility only, so the account is ready to
-- have real sending wired in once a provider and credentials exist.
ALTER TABLE public.licenses ADD COLUMN integrations JSONB NOT NULL DEFAULT '{"whatsapp_enabled": false}'::jsonb;

-- Existing RLS on licenses already covers this column: platform admins
-- have FOR ALL, tenant members have SELECT-only ("Members view own tenant
-- license") — so an integration can only ever be toggled by a platform
-- admin, never by the tenant itself. No new policy needed.
