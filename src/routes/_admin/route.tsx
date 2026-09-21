import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { needsMfaChallenge } from "@/lib/mfa";

export const Route = createFileRoute("/_admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw redirect({ to: "/auth" });

    // Two-factor login is mandatory for platform admins, and the database
    // enforces it: is_platform_admin() is false for an admin whose session
    // hasn't entered the code (20260921090000_mfa_enforcement.sql). This guard
    // only routes them to the right place instead of showing an empty console.
    if (await needsMfaChallenge()) {
      throw redirect({ to: "/auth", search: { next: "/admin" } });
    }

    const { data: status } = await supabase.rpc("my_admin_status");
    const admin = status?.[0];
    if (!admin?.is_admin) throw redirect({ to: "/app" });
    // An admin who hasn't set 2FA up yet: the profile page is where they do it.
    if (!admin.mfa_enrolled) throw redirect({ to: "/app/profile" });

    return { user: userData.user };
  },
  component: () => <Outlet />,
});
