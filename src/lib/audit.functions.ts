import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// RLS restricts this to tenant owner/admin (their own tenant) or platform
// admins (all tenants) — see the audit_log migration. A regular member
// gets an empty result, not an error.
export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_log")
      .select("id, action, resource_type, resource_id, actor_email, result, ip_address, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
