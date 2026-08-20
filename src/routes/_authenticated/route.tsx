import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // A trial that has run out, or a paid subscription past its renewal
    // date (plus grace), sends the dashboard itself to the plan-picker —
    // the database already blocks writes for both cases, this just means
    // opening the app leads with "pick a plan" instead of a raw write
    // error on whatever the person tries first.
    //
    // Scoped to the dashboard route only (exact "/app"), not every route
    // under this layout: every other page — profile, documents, cases,
    // diary — must stay reachable, because the whole point of the
    // read-only period is that data "stays readable and exportable" (see
    // the trial/subscription-expiry migrations and the pricing/subscription
    // page copy). Redirecting away from those too was a real bug: it
    // trapped an expired account on /app/subscription with no way to reach
    // even Profile & privacy.
    if (location.pathname === "/app") {
      const { data: entitlements } = await supabase.rpc("my_entitlements");
      if (entitlements?.[0]?.trial_expired || entitlements?.[0]?.subscription_expired) {
        throw redirect({ to: "/app/subscription" });
      }
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
