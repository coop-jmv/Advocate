-- Temporary re-grant to verify the cancelled-license write-block live
-- through the real UI/API, same pattern as the earlier admin-console
-- verification. Revoked again in the immediately following migration.
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'dhanapalan.jmv+testportal@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
