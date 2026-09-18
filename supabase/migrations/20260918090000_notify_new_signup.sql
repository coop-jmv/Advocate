-- Email the LexDiary team when someone registers.
--
-- An AFTER INSERT trigger on public.profiles — the row handle_new_user()
-- creates for every new account, both brand-new chambers and teammates who
-- join by invite — queues a pg_net call to the notify-new-signup edge
-- function, which looks up the person's name and login email and sends them
-- to lexdiary.online@gmail.com through Resend.
--
-- Same mechanism as the daily WhatsApp digest
-- (20260822120000_diary_reminder_notifications_whatsapp.sql): pg_net, with
-- the shared secret read from Vault at call time. Two properties matter:
--
--   * It can never block a signup. pg_net only queues the request; the HTTP
--     call happens in a background worker after the signup transaction
--     commits (a rolled-back signup sends nothing). Any error raised while
--     queueing is caught below and downgraded to a WARNING.
--   * No personal data passes through pg_net. The request body carries only
--     the new profile's id; the edge function reads the two fields it needs
--     (name, email) itself, so net's request queue and response log never
--     hold a name or an email address.
--
-- NOTE: the URL is hardcoded to this project's ref, for the same reason as
-- the digest's cron job: pg_net SQL cannot read an environment variable.
-- Update it by hand if this migration is ever reused in another project.
--
-- Kill switch: `DROP TRIGGER profiles_notify_new_signup ON public.profiles;`
-- stops the emails immediately without touching signup itself.

CREATE OR REPLACE FUNCTION public.notify_new_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://cjcjfdwdlsdgyvshuncn.supabase.co/functions/v1/notify-new-signup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
      ),
      body := jsonb_build_object('profile_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- A notification is never worth failing a signup over.
    RAISE WARNING 'notify_new_signup: could not queue notification for profile %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_new_signup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_notify_new_signup ON public.profiles;
CREATE TRIGGER profiles_notify_new_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_signup();
