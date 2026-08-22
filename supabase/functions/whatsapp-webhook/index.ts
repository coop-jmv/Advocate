import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";

// Receives delivery-status callbacks from the WhatsApp provider (Gupshup) and
// updates the matching whatsapp_messages row. A synchronous send only ever
// confirms *acceptance* (see whatsapp-diary-digest) — this is how a message
// actually becomes 'delivered'/'read', or turns out to have 'failed' after
// the fact.
//
// verify_jwt = false, same as whatsapp-diary-digest — the caller is Gupshup's
// servers, not a LexDiary user, so there is no JWT to check. AUTHENTICATION
// HERE IS INCOMPLETE: Gupshup's actual webhook signature/verification scheme
// depends on the final provider account setup (a per-app HMAC secret or a
// shared token, configured in their dashboard) and isn't known yet — the
// TODO below marks exactly where that check belongs before this goes live.
// Until it's added, this endpoint should be treated as not production-ready.

const GUPSHUP_STATUS_MAP: Record<string, "sent" | "delivered" | "failed" | "read"> = {
  submitted: "sent",
  enqueued: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return errorResponse(req, "Method not allowed", 405);

  // TODO before production use: verify the request actually came from
  // Gupshup (their dashboard-configured signature/token scheme — not yet
  // finalized, see the note above).

  let payload: {
    messageId?: string;
    type?: string;
    status?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body");
  }

  const providerMessageId = payload.messageId;
  const rawStatus = payload.status ?? payload.type;
  if (!providerMessageId || !rawStatus) {
    return errorResponse(req, "messageId and status are required");
  }

  const mappedStatus = GUPSHUP_STATUS_MAP[rawStatus];
  if (!mappedStatus) {
    // Unrecognized event type (e.g. a provider-side event with no bearing on
    // delivery status) — acknowledge without erroring so the provider
    // doesn't retry indefinitely.
    return jsonResponse(req, { ok: true, ignored: rawStatus });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const update: Record<string, unknown> = { status: mappedStatus };
  if (mappedStatus === "delivered") update.delivered_at = new Date().toISOString();

  const { error } = await admin
    .from("whatsapp_messages")
    .update(update)
    .eq("provider_message_id", providerMessageId);

  if (error) return errorResponse(req, error.message, 500);
  return jsonResponse(req, { ok: true });
});
