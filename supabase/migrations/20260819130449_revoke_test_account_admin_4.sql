-- Final revoke of the test account's temporary admin grant. Only
-- dhanapalan.jmv@gmail.com should remain a platform admin going forward.
DELETE FROM public.platform_admins
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'dhanapalan.jmv+testportal@gmail.com');
