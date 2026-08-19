import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authedClient, requireUserId } from "../_shared/auth.ts";

// login_success/logout require a verified JWT — actor_user_id is resolved
// server-side from the token, never client-asserted, for these two.
//
// login_failed and signup are the two events with no valid session at the
// moment they're logged (a failed login never had one; signup has none
// yet either, since this project requires email confirmation before the
// first session exists). For signup only, the client may pass the user id
// Supabase's own signUp() response just returned — trusted at the same
// (low) level as the email on a failed-login attempt: useful for the
// audit trail, but not cryptographically verified identity.
const REQUIRES_AUTH = new Set(["login_success", "logout"]);
const ALLOWED_EVENTS = new Set(["login_success", "login_failed", "logout", "signup"]);

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  let body: { event: string; email?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body");
  }
  if (!ALLOWED_EVENTS.has(body.event)) return errorResponse(req, "Unknown event type");

  const auth = authedClient(req);
  let userId: string | null = null;
  let email: string | null = body.email?.slice(0, 320) ?? null;

  if (auth) {
    userId = await requireUserId(auth.supabase);
    if (userId) {
      const { data } = await auth.supabase.auth.getUser();
      email = data.user?.email ?? email;
    }
  }

  if (REQUIRES_AUTH.has(body.event) && !userId) {
    return errorResponse(req, "Unauthorized", 401);
  }

  if (body.event === "signup" && !userId && isUuid(body.userId)) {
    userId = body.userId;
  }

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });

  const { error } = await anon.rpc("log_auth_event", {
    p_actor_user_id: userId,
    p_email: email,
    p_action: body.event,
    p_result: body.event === "login_failed" ? "failure" : "success",
    p_ip: clientIp(req),
    p_user_agent: req.headers.get("user-agent") ?? "unknown",
  });
  if (error) return errorResponse(req, error.message, 500);

  return jsonResponse(req, { ok: true });
});
