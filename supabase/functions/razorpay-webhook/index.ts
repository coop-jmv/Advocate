import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  applySubscription,
  fetchSubscription,
  RazorpayConfigError,
  webhookSignatureValid,
} from "../_shared/razorpay.ts";

// Razorpay subscription webhooks: renewals extend the paid period, failed
// renewals mark the chamber past due, and a halted, cancelled or finished
// subscription returns it to Free. Called only by Razorpay, so this function
// has `verify_jwt = false` in config.toml and authenticates the request by
// its X-Razorpay-Signature instead.
//
// The payload is used only to find which subscription changed. Its state is
// then fetched fresh from Razorpay and written absolutely (see
// applySubscription), so Razorpay's retries and out-of-order deliveries are
// harmless. razorpay_events is a record of what arrived, not a lock.
//
// Always answers 2xx once the signature checks out, even for events it
// ignores; a non-2xx makes Razorpay retry, and after enough failures it
// disables the webhook.

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  try {
    if (!(await webhookSignatureValid(rawBody, req.headers.get("x-razorpay-signature")))) {
      return new Response("Invalid signature", { status: 401 });
    }
  } catch (cause) {
    if (cause instanceof RazorpayConfigError) {
      console.error("[razorpay-webhook]", cause.message);
      return new Response("Not configured", { status: 503 });
    }
    throw cause;
  }

  let payload: { event?: string; payload?: { subscription?: { entity?: { id?: string } } } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = payload.event ?? "";
  const subscriptionId = payload.payload?.subscription?.entity?.id;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false },
    },
  );

  const eventId = req.headers.get("x-razorpay-event-id");
  if (eventId) {
    await admin
      .from("razorpay_events")
      .upsert(
        { event_id: eventId, event, subscription_id: subscriptionId ?? null },
        { onConflict: "event_id", ignoreDuplicates: true },
      );
  }

  if (!event.startsWith("subscription.") || !subscriptionId) {
    return new Response(JSON.stringify({ ignored: event }), { status: 200 });
  }

  // Only a subscription this app created and recorded on a licence is acted
  // on — the tenant comes from our own row, never from the payload's notes.
  const { data: license } = await admin
    .from("licenses")
    .select("tenant_id")
    .eq("razorpay_subscription_id", subscriptionId)
    .maybeSingle();
  if (!license) {
    console.warn(`[razorpay-webhook] ${event} for unknown subscription ${subscriptionId}`);
    return new Response(JSON.stringify({ ignored: "unknown subscription" }), { status: 200 });
  }

  try {
    const result = await applySubscription(
      admin,
      license.tenant_id,
      await fetchSubscription(subscriptionId),
    );
    return new Response(JSON.stringify({ event, result }), { status: 200 });
  } catch (cause) {
    // A failure here (Razorpay or the database unreachable) should be
    // retried, so this one is a 5xx.
    console.error(`[razorpay-webhook] ${event} ${subscriptionId}:`, cause);
    return new Response("Processing failed", { status: 500 });
  }
});
