import { handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authedClient, requireUserId } from "../_shared/auth.ts";
import { lookupByCnr, currentProviderName } from "../_shared/ecourts.ts";

// Phase 1 of the e-Courts integration: on-demand CNR verify + auto-fill for
// the matter-creation form. A normal user-JWT function (not a background
// job) — every lookup is a live user action, gated by
// licenses.integrations.ecourts_enabled (default false, unlike
// whatsapp_enabled — see the migration header for why), by the plan
// (plan_feature 'ecourts', so never on Free) and a per-tenant daily quota.
//
// Every miss is a billed vendor call, so a snapshot already fetched for this
// chamber and CNR within CACHE_TTL_HOURS is served from ecourts_sync_log
// instead: no vendor call, no quota spent. Pass {"refresh": true} to force a
// fresh fetch (that one does cost a call and a quota unit).

const CACHE_TTL_HOURS = 24;

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

  // Plan gate, separate from the switch above: assert_feature() refuses Free
  // outright, so a chamber can never be switched on into a billed call its
  // plan doesn't cover. Both must pass.
  const { error: featureError } = await auth.supabase.rpc("assert_feature", {
    p_feature: "ecourts",
  });
  if (featureError) return errorResponse(req, featureError.message, 403);

  let body: { cnr?: string; refresh?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body");
  }
  const cnr = body.cnr?.trim();
  if (!cnr || !/^[A-Za-z0-9]{16}$/.test(cnr)) {
    return errorResponse(req, "cnr must be a 16-character alphanumeric CNR.");
  }
  const normalizedCnr = cnr.toUpperCase();

  // Cache read before anything is spent. Scoped to this tenant (RLS allows
  // no other), newest first. A cache hit is not logged again: the log is a
  // record of vendor calls, and logging hits would make it useless for
  // reconciling the vendor's bill.
  if (body.refresh !== true) {
    const since = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cached } = await auth.supabase
      .from("ecourts_sync_log")
      .select("snapshot, created_at")
      .eq("tenant_id", profile!.tenant_id)
      .eq("cnr", normalizedCnr)
      .eq("status", "success")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.snapshot) {
      return jsonResponse(req, {
        ...(cached.snapshot as Record<string, unknown>),
        cached: true,
        fetchedAt: cached.created_at,
      });
    }
  }

  try {
    const { error: quotaError } = await auth.supabase.rpc("increment_ecourts_usage");
    if (quotaError) return errorResponse(req, quotaError.message, 429);
  } catch (cause) {
    return errorResponse(req, cause instanceof Error ? cause.message : "Quota check failed.", 429);
  }

  try {
    const snapshot = await lookupByCnr(normalizedCnr);
    const { data: logged } = await auth.supabase
      .from("ecourts_sync_log")
      .insert({
        tenant_id: profile!.tenant_id,
        cnr: normalizedCnr,
        provider: currentProviderName(),
        status: "success",
        snapshot,
      })
      .select("created_at")
      .maybeSingle();
    return jsonResponse(req, {
      ...snapshot,
      cached: false,
      fetchedAt: logged?.created_at ?? new Date().toISOString(),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "e-Courts lookup failed.";
    await auth.supabase.from("ecourts_sync_log").insert({
      tenant_id: profile!.tenant_id,
      cnr: normalizedCnr,
      provider: currentProviderName(),
      status: "failed",
      status_detail: message,
    });
    return errorResponse(req, message, 502);
  }
});
