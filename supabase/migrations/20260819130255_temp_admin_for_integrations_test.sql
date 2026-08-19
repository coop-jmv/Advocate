-- Temporary re-grant, one more time, to verify the new
-- /admin/settings/integrations route actually renders (it's a brand-new
-- route file, never tested) before shipping it to production untested.
-- Revoked in the immediately following migration.
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'dhanapalan.jmv+testportal@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
