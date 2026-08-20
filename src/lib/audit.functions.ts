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

// Platform-admin view across every tenant: who changed which chamber's
// status or plan, and what it changed from/to (log_tenant_admin_action()/
// log_license_admin_action() write old_status/old_plan into metadata for
// exactly this). RLS's "Platform admins view all audit log" policy is what
// actually restricts this to real platform admins — a non-admin caller
// simply gets nothing back, same failure shape as listAuditLog above.
export const listPlatformAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_log")
      .select(
        "id, action, resource_type, resource_id, actor_email, metadata, created_at, tenants(name)",
      )
      .in("resource_type", ["tenants", "licenses"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
