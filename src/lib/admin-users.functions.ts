import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// Superadmin user management: a list of every user, and resetting a user's
// two-factor login when they have lost their authenticator.
//
// Both need the service-role client (emails, sign-in times and MFA factors
// live in auth.users / auth.mfa_factors, unreachable through RLS), so both first
// prove the caller is a platform admin using the caller's OWN, RLS-scoped
// client. That check goes through is_platform_admin(), which since
// 20260921090000_mfa_enforcement.sql is false unless the admin's session has
// passed two-factor verification — so this power is gated on 2FA too.

async function assertPlatformAdmin(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data: adminRow } = await context.supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!adminRow)
    throw new Error("Only a platform admin with two-factor login verified can do this.");
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  chamber: string | null;
  role: string | null;
  isPlatformAdmin: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const users = [];
    const perPage = 200;
    for (let page = 1; ; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      users.push(...data.users);
      if (data.users.length < perPage) break;
    }

    // listUsers() does not return MFA factors, so 2FA status comes from a
    // service-role-only RPC over auth.mfa_factors.
    const [
      { data: profiles },
      { data: tenants },
      { data: admins },
      { data: mfaUsers, error: mfaError },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, tenant_id, tenant_role"),
      supabaseAdmin.from("tenants").select("id, name"),
      supabaseAdmin.from("platform_admins").select("user_id"),
      supabaseAdmin.rpc("users_with_verified_mfa"),
    ]);
    if (mfaError) throw new Error(mfaError.message);
    const mfaIds = new Set(mfaUsers ?? []);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const tenantName = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    const adminIds = new Set((admins ?? []).map((a) => a.user_id));

    return users
      .map((user) => {
        const profile = profileById.get(user.id);
        return {
          id: user.id,
          email: user.email ?? null,
          fullName: profile?.full_name ?? null,
          chamber: profile?.tenant_id ? (tenantName.get(profile.tenant_id) ?? null) : null,
          role: profile?.tenant_role ?? null,
          isPlatformAdmin: adminIds.has(user.id),
          mfaEnabled: mfaIds.has(user.id),
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at ?? null,
        };
      })
      .sort((a, b) => (b.lastSignInAt ?? "").localeCompare(a.lastSignInAt ?? ""));
  });

export const resetUserMfa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: factors, error: listError } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId: data.userId,
    });
    if (listError) throw new Error(listError.message);

    let removed = 0;
    for (const factor of factors.factors) {
      const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: data.userId,
      });
      if (error) throw new Error(error.message);
      removed++;
    }

    // Recorded like every other admin action, against the user's chamber.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", data.userId)
      .maybeSingle();
    const claims = context.claims as { email?: string };
    await supabaseAdmin.from("audit_log").insert({
      tenant_id: profile?.tenant_id ?? null,
      actor_user_id: context.userId,
      actor_email: claims.email ?? null,
      action: "mfa_reset",
      resource_type: "auth",
      resource_id: data.userId,
      metadata: { factors_removed: removed },
    });

    return { removed };
  });
