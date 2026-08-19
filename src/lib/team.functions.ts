import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Team roster, invites, and usage summary. RLS does the real enforcement
// (tenant_id = current_tenant_id(), is_tenant_admin() for invite create/
// revoke) — these handlers never accept a tenant_id from the client.

export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, tenant_role, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tenant_invites")
      .select("id, email, role, status, created_at, expires_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ email: z.string().email(), role: z.enum(["admin", "member"]).default("member") })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: saved, error } = await context.supabase
      .from("tenant_invites")
      .insert({ email: data.email.toLowerCase().trim(), role: data.role, invited_by: context.userId })
      .select("id, email, role, status, token, created_at, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tenant_invites")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("my_usage_summary");
    if (error) throw new Error(error.message);
    return data?.[0] ?? null;
  });
