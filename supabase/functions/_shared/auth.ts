import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Builds a Supabase client scoped to the calling user's JWT (forwarded from
 * the client's Authorization header), so every query runs under that user's
 * RLS policies — the same trust boundary requireSupabaseAuth enforced.
 */
export function authedClient(req: Request): { supabase: SupabaseClient; token: string } | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  if (!token || token.split(".").length !== 3) return null;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  return { supabase, token };
}

export async function requireUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
