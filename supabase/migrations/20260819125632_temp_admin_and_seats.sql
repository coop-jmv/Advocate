-- Temporary: re-grant the test account platform admin to bump its own
-- tenant's seat count so the invite/accept flow can be verified live
-- through the real UI. Both the admin grant and the seat bump are
-- reverted in a follow-up migration once verification is complete.
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'dhanapalan.jmv+testportal@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
