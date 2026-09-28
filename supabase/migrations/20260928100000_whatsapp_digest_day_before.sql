-- The WhatsApp/in-app diary digest used to run at 07:00 IST and cover the
-- SAME day's hearings — an advocate got the heads-up the same morning they
-- needed to already be prepared. Moved to the evening before, covering
-- TOMORROW's hearings instead, so there's a full day's notice. The edge
-- function itself (whatsapp-diary-digest/index.ts) now queries
-- tomorrowIsoIST() rather than todayIsoIST(); this migration only moves the
-- cron trigger time to match — running it at the old 07:00 IST slot would
-- otherwise fire a "tomorrow" digest 24 hours later than intended relative to
-- when an advocate actually wants that notice (the evening before, not the
-- following morning).
--
-- Schedule is UTC. 30 12 * * * = 18:00 IST.
--
-- cron.unschedule() raises rather than no-oping when the named job doesn't
-- exist, and it turns out no 'diary-whatsapp-digest' job is currently
-- scheduled on this project at all (checked while writing this migration) —
-- so the digest hasn't been firing daily since it was set up. Guarded here so
-- this migration works either way; cron.schedule() below creates or updates
-- the named job in one step regardless.
DO $$
BEGIN
  PERFORM cron.unschedule('diary-whatsapp-digest');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'diary-whatsapp-digest',
  '30 12 * * *',
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
