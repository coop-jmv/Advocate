import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Backs the header search box. search_records() is SECURITY INVOKER — the
// existing SELECT policies on matters/clients scope results to the caller's
// tenant, this handler adds no scoping of its own.
export const searchRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ query: z.string().trim().max(120) }).parse(data))
  .handler(async ({ data, context }) => {
    if (!data.query) return [];
    const { data: rows, error } = await context.supabase.rpc("search_records", {
      p_query: data.query,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
