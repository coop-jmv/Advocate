import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Integrations = {
  whatsapp_enabled?: boolean;
  ai_morning_brief_enabled?: boolean;
  cause_list_enabled?: boolean;
};

/**
 * The caller's own tenant's integrations flags — scoped explicitly by
 * tenant_id, not left to RLS alone. A platform admin's `licenses` RLS grant
 * ("Platform admins manage licenses", ALL, no tenant filter) makes every
 * tenant's license row visible to them, so a bare
 * `.from("licenses").select("integrations").maybeSingle()` returns more
 * than one row for a platform-admin caller and `.maybeSingle()` errors —
 * silently, if only `data` is destructured, which resolves every
 * `?? true`-defaulted flag to fail-open regardless of what's actually set.
 * Resolving tenant_id from the caller's own profile first, then filtering
 * on it explicitly, is what makes this work correctly for platform admins
 * checking their own chamber's flags, not just regular members.
 */
export async function getOwnIntegrations(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Integrations> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.tenant_id) return {};

  const { data: license } = await supabase
    .from("licenses")
    .select("integrations")
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  return (license?.integrations ?? {}) as Integrations;
}
