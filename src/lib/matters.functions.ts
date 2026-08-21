import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tenant-scoped matters/clients CRUD. RLS (tenant_id = current_tenant_id())
// does the real enforcement — these handlers never accept or trust a
// tenant_id from the client; the DB derives it server-side via a trigger
// from the authenticated user's profile.

export const listMatters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("matters")
      .select(
        "id, title, client_name, case_number, court, status, opposing_party, filed_date, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Single-matter fetch for the matter detail page. RLS makes "belongs to
// another tenant" and "doesn't exist" indistinguishable (both resolve to
// null) — that's the correct, non-leaking behavior, not a bug to fix.
export const getMatter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ matterId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: matter, error } = await context.supabase
      .from("matters")
      .select(
        "id, title, client_name, case_number, court, status, opposing_party, filed_date, notes, created_at",
      )
      .eq("id", data.matterId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return matter;
  });

export const createMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        title: z.string().min(2),
        clientName: z.string().optional(),
        caseNumber: z.string().optional(),
        court: z.string().optional(),
        opposingParty: z.string().optional(),
        filedDate: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: saved, error } = await context.supabase
      .from("matters")
      .insert({
        title: data.title,
        client_name: data.clientName ?? null,
        case_number: data.caseNumber ?? null,
        court: data.court ?? null,
        opposing_party: data.opposingParty ?? null,
        filed_date: data.filedDate ?? null,
        created_by: context.userId,
      })
      .select(
        "id, title, client_name, case_number, court, status, opposing_party, filed_date, created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("id, name, phone, email, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().min(2),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        notes: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: saved, error } = await context.supabase
      .from("clients")
      .insert({
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id, name, phone, email, notes, created_at")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });
