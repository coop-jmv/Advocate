import { handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authedClient, requireUserId } from "../_shared/auth.ts";
import { lookupByCnr, currentProviderName } from "../_shared/ecourts.ts";

// Phase 1 of the e-Courts integration: on-demand CNR verify + auto-fill for
// the matter-creation form. A normal user-JWT function (not a background
// job) — every lookup is a live user action, gated by
// licenses.integrations.ecourts_enabled (default false, unlike
// whatsapp_enabled — see the migration header for why) and a per-tenant
// daily quota.

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = authedClient(req);
  if (!auth) return errorResponse(req, "Unauthorized", 401);
  const userId = await requireUserId(auth.supabase);
  if (!userId) return errorResponse(req, "Unauthorized", 401);

  // Resolve tenant_id from the caller's own profile first — a bare
  // `licenses` query has no tenant filter for a platform-admin caller and
  // would otherwise fail open, same subtlety documented in
  // ai-morning-brief/index.ts.
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const { data: license } = profile?.tenant_id
    ? await auth.supabase
        .from("licenses")
        .select("integrations")
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle()
    : { data: null };
  const integrations = (license?.integrations ?? {}) as { ecourts_enabled?: boolean };
  if (integrations.ecourts_enabled !== true) {
    return errorResponse(
      req,
      "e-Courts lookup is not enabled for this chamber. Ask your workspace administrator to turn it on.",
      403,
    );
  }

  let body: { cnr?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body");
  }
  const cnr = body.cnr?.trim();
  if (!cnr || !/^[A-Za-z0-9]{16}$/.test(cnr)) {
    return errorResponse(req, "cnr must be a 16-character alphanumeric CNR.");
  }

  try {
    const { error: quotaError } = await auth.supabase.rpc("increment_ecourts_usage");
    if (quotaError) return errorResponse(req, quotaError.message, 429);
  } catch (cause) {
    return errorResponse(req, cause instanceof Error ? cause.message : "Quota check failed.", 429);
  }

  try {
    const snapshot = await lookupByCnr(cnr);
    await auth.supabase.from("ecourts_sync_log").insert({
      tenant_id: profile!.tenant_id,
      cnr,
      provider: currentProviderName(),
      status: "success",
      snapshot,
    });
    return jsonResponse(req, snapshot);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "e-Courts lookup failed.";
    await auth.supabase.from("ecourts_sync_log").insert({
      tenant_id: profile!.tenant_id,
      cnr,
      provider: currentProviderName(),
      status: "failed",
      status_detail: message,
    });
    return errorResponse(req, message, 502);
  }
});
