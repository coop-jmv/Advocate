-- Grant platform_admin to the chamber owner's real account, and temporarily
-- to the session's test account so the admin console can be verified
-- end-to-end through the UI. The test account's admin grant is revoked in
-- a follow-up migration once verification is complete.
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'dhanapalan.jmv@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'dhanapalan.jmv+testportal@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
