import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // A trial that has run out, or a paid subscription past its renewal
    // date (plus grace), sends everyone straight to the plan-picker — the
    // database already blocks writes for both cases, this just means the
    // person lands on the "pick a plan" page directly instead of hitting
    // that as a raw error on whatever they were doing.
    if (location.pathname !== "/app/subscription") {
      const { data: entitlements } = await supabase.rpc("my_entitlements");
      if (entitlements?.[0]?.trial_expired || entitlements?.[0]?.subscription_expired) {
        throw redirect({ to: "/app/subscription" });
      }
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
