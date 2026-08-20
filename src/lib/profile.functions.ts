import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Account, consent, export and erasure. RLS and the SECURITY DEFINER
// functions do the real enforcement — these handlers never accept a
// tenant_id or user_id from the client, they act on the caller's own token.

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profile, error: profileError }, { data: userRes }] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("full_name, firm_name, enrolment_no, tenant_role, created_at")
        .eq("id", context.userId)
        .single(),
      context.supabase.auth.getUser(),
    ]);
    if (profileError) throw new Error(profileError.message);
    return { ...profile, email: userRes.user?.email ?? null };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fullName: z.string().trim().min(1).max(120),
        firmName: z.string().trim().max(160).optional(),
        enrolmentNo: z.string().trim().max(60).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        full_name: data.fullName,
        firm_name: data.firmName || null,
        enrolment_no: data.enrolmentNo || null,
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyConsents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("consents")
      .select("purpose, notice_version, granted_at, withdrawn_at")
      .order("granted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const withdrawMyConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ purpose: z.enum(["ai_processing", "product_updates"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("withdraw_consent", { p_purpose: data.purpose });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const grantMyConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ purpose: z.enum(["ai_processing", "product_updates"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("grant_consent", { p_purpose: data.purpose });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const exportMyPersonalData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("export_my_personal_data");
    if (error) throw new Error(error.message);
    return data;
  });

export const exportChamberData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("export_chamber_data");
    if (error) throw new Error(error.message);
    return data;
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("delete_my_account");
    if (error) throw new Error(error.message);
    return data as { outcome: string };
  });
