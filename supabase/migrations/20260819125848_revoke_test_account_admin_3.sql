-- Revoke the test account's temporary admin grant used to bump seats and
-- verify the invite/accept flow. Only dhanapalan.jmv@gmail.com should
-- remain a platform admin. The seat bump (1 -> 3) and the two resulting
-- tenant members are left as-is — they're real, working proof the
-- feature functions correctly, not throwaway test rows.
DELETE FROM public.platform_admins
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'dhanapalan.jmv+testportal@gmail.com');
