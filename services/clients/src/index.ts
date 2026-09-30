import type { SupabaseClient } from "@supabase/supabase-js";
import { handleOptions, jsonResponse, errorResponse, dbError } from "./cors";
import { rateLimitResponse, type RateLimitEnv } from "./rate-limit";
import { authedClient, requireUserId } from "./auth";
import { requireClientsModule } from "./require-module";
import { decryptField, encryptField } from "./field-encryption";

// LexDiary Clients service — the Phase 1 pilot extraction of
// C:\Users\cdhan\.claude\plans\bright-toasting-thompson.md. Clients was
// chosen first because the coupling audit in that plan found zero live
// dependents on it (invoices.client_id exists but is dead code — the app
// only ever uses invoices.client_name text). No SUPABASE_SERVICE_ROLE_KEY
// anywhere in this service — every query runs under the calling user's own
// JWT, so RLS (tenant_id = current_tenant_id()) provides the same isolation
// it does everywhere else in the app. Called directly from the browser with
// the user's own Supabase access token, the same trust model
// src/lib/edge-functions.ts already uses for Edge Functions — not routed
// through the main Worker, so there's no dependency on Cloudflare env/
// service-binding plumbing the main app deliberately doesn't have (see
// src/lib/server-handler.ts's "stays portable" comment).

const CLIENT_COLUMNS = "id, name, phone, email, notes, created_at";

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// The deleted clients.functions.ts validated this with Zod's z.string().email()
// — this is the format check that was dropped when the handler moved here.
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

// Same rules as src/lib/validation.ts: first name and surname (stored as one
// "First Surname" string), an Indian mobile as +91XXXXXXXXXX, and an email.
type ClientBody = { name?: string; phone?: string; email?: string; notes?: string };

function clientInputError(body: ClientBody): string | null {
  const name = body.name?.trim() ?? "";
  if (name.split(/\s+/).filter(Boolean).length < 2)
    return "Enter the client's first name and surname.";
  if (name.length > 101) return "The client's name is too long.";
  if (!body.phone || !/^\+91[6-9]\d{9}$/.test(body.phone)) {
    return "Enter the client's 10-digit mobile number.";
  }
  if (!body.email || !isValidEmail(body.email.trim()))
    return "Enter a valid email address for the client.";
  if (body.notes && body.notes.length > 2000) return "Notes can be at most 2000 characters.";
  return null;
}

async function listClients(req: Request, supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return dbError(req, error, "Could not load your clients.");
  const rows = await Promise.all(
    ((data ?? []) as ClientRow[]).map(async (client) => ({
      ...client,
      notes: await decryptField(client.notes),
    })),
  );
  return jsonResponse(req, rows);
}

async function createClient(req: Request, supabase: SupabaseClient, userId: string) {
  let body: ClientBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body");
  }
  const inputError = clientInputError(body);
  if (inputError) return errorResponse(req, inputError);

  const { data: saved, error } = await supabase
    .from("clients")
    .insert({
      name: body.name!.trim(),
      phone: body.phone,
      email: body.email!.trim(),
      notes: await encryptField(body.notes),
      created_by: userId,
    })
    .select(CLIENT_COLUMNS)
    .single();
  if (error) return dbError(req, error, "Could not save that client.");
  return jsonResponse(req, { ...(saved as ClientRow), notes: body.notes ?? null });
}

async function updateClient(req: Request, supabase: SupabaseClient, clientId: string) {
  if (!isUuid(clientId)) return errorResponse(req, "Invalid client id", 400);
  let body: ClientBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body");
  }
  const inputError = clientInputError(body);
  if (inputError) return errorResponse(req, inputError);

  const { data: saved, error } = await supabase
    .from("clients")
    .update({
      name: body.name!.trim(),
      phone: body.phone,
      email: body.email!.trim(),
      notes: await encryptField(body.notes),
    })
    .eq("id", clientId)
    .select(CLIENT_COLUMNS)
    .single();
  if (error) return dbError(req, error, "Could not update that client.");
  return jsonResponse(req, { ...(saved as ClientRow), notes: body.notes ?? null });
}

async function deleteClient(req: Request, supabase: SupabaseClient, clientId: string) {
  if (!isUuid(clientId)) return errorResponse(req, "Invalid client id", 400);
  const { error, count } = await supabase
    .from("clients")
    .delete({ count: "exact" })
    .eq("id", clientId);
  if (error) return dbError(req, error, "Could not delete that client.");
  if (!count) {
    return errorResponse(req, "Client not found, or you don't have permission to delete it.", 404);
  }
  return jsonResponse(req, { ok: true });
}

export default {
  async fetch(req: Request, env: RateLimitEnv): Promise<Response> {
    const preflight = handleOptions(req);
    if (preflight) return preflight;

    // Before auth: shed flood traffic at the front door (see rate-limit.ts).
    const limited = await rateLimitResponse(req, env);
    if (limited) return limited;

    const auth = authedClient(req);
    if (!auth) return errorResponse(req, "Unauthorized", 401);
    const userId = await requireUserId(auth.supabase, auth.token);
    if (!userId) return errorResponse(req, "Unauthorized", 401);

    try {
      await requireClientsModule(auth.supabase, userId);
    } catch (cause) {
      return errorResponse(
        req,
        cause instanceof Error ? cause.message : "Module check failed.",
        403,
      );
    }

    const url = new URL(req.url);
    const match = url.pathname.match(/^\/api\/v1\/clients\/?([0-9a-fA-F-]*)$/);
    if (!match) return errorResponse(req, "Not found", 404);
    const clientId = match[1];

    if (req.method === "GET" && !clientId) return listClients(req, auth.supabase);
    if (req.method === "POST" && !clientId) return createClient(req, auth.supabase, userId);
    if (req.method === "PATCH" && clientId) return updateClient(req, auth.supabase, clientId);
    if (req.method === "DELETE" && clientId) return deleteClient(req, auth.supabase, clientId);

    return errorResponse(req, "Method not allowed", 405);
  },
};
