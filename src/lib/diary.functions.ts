import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tenant-scoped hearings CRUD. Same trust model as matters.functions.ts:
// tenant_id is never accepted from the client, it's DB-derived.

export const listHearings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("hearings")
      .select("id, matter_title, court, hearing_date, hearing_time, purpose, status, created_at")
      .order("hearing_date", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createHearing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        matterTitle: z.string().min(2),
        court: z.string().optional(),
        hearingDate: z.string().min(1),
        hearingTime: z.string().optional(),
        purpose: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: saved, error } = await context.supabase
      .from("hearings")
      .insert({
        matter_title: data.matterTitle,
        court: data.court ?? null,
        hearing_date: data.hearingDate,
        hearing_time: data.hearingTime ?? null,
        purpose: data.purpose ?? null,
        created_by: context.userId,
      })
      .select("id, matter_title, court, hearing_date, hearing_time, purpose, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const updateHearingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["confirmed", "cause_list_awaited", "adjourned", "completed"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("hearings")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
