-- The session test account's platform_admin grant was temporary, for
-- verifying the admin console end-to-end through the real UI. Revoke it
-- now that verification is complete — only the chamber owner's real
-- account should remain a platform admin.
DELETE FROM public.platform_admins
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'dhanapalan.jmv+testportal@gmail.com');
