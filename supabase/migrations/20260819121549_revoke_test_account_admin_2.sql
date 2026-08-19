-- Revoke the test account's temporary admin grant used to verify the
-- cancelled-license write-block. Only dhanapalan.jmv@gmail.com should
-- remain a platform admin.
DELETE FROM public.platform_admins
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'dhanapalan.jmv+testportal@gmail.com');
