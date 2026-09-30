import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { secretMatches } from "./timing-safe.ts";

// Razorpay Subscriptions client shared by razorpay-billing (called by the app)
// and razorpay-webhook (called by Razorpay). Test and live mode are chosen
// entirely by which keys are set as secrets:
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET  API keys (rzp_test_... / rzp_live_...)
//   RAZORPAY_PLAN_ID                      the monthly per-seat plan, created in
//                                         the Razorpay dashboard for that mode
//   RAZORPAY_WEBHOOK_SECRET               the secret set on the webhook

const API = "https://api.razorpay.com/v1";

// Rs 1999 per seat + 18% GST, in paise. The Razorpay plan must be created at
// exactly this amount; razorpay-billing refuses to create subscriptions
// against a plan with any other price.
export const PREMIUM_SEAT_AMOUNT_PAISE = 235882;

// A monthly subscription needs a finite cycle count; ten years is effectively
// open-ended and the customer can cancel at any time.
const TOTAL_BILLING_CYCLES = 120;

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  quantity: number;
  current_end: number | null;
  notes: Record<string, string> | [];
};

export class RazorpayConfigError extends Error {}
// Razorpay's own error description — written for end users, so safe to show.
export class RazorpayApiError extends Error {}

function credentials(): { keyId: string; keySecret: string } {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) {
    throw new RazorpayConfigError("Online payment is not configured yet.");
  }
  return { keyId, keySecret };
}

export function razorpayKeyId(): string {
  return credentials().keyId;
}

async function razorpayRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const description = payload?.error?.description;
    console.error(`[razorpay] ${method} ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
    throw new RazorpayApiError(
      typeof description === "string" ? description : "The payment provider rejected the request.",
    );
  }
  return payload as T;
}

export async function assertPlanPrice(): Promise<string> {
  const planId = Deno.env.get("RAZORPAY_PLAN_ID");
  if (!planId) throw new RazorpayConfigError("Online payment is not configured yet.");
  const plan = await razorpayRequest<{
    period: string;
    interval: number;
    item: { amount: number; currency: string };
  }>("GET", `/plans/${planId}`);
  if (
    plan.period !== "monthly" ||
    plan.interval !== 1 ||
    plan.item.currency !== "INR" ||
    plan.item.amount !== PREMIUM_SEAT_AMOUNT_PAISE
  ) {
    console.error(
      `[razorpay] plan ${planId} does not match Premium pricing: ${JSON.stringify(plan)}`,
    );
    throw new RazorpayConfigError(
      "Online payment is misconfigured. Please contact lexdiary.online@gmail.com.",
    );
  }
  return planId;
}

export function createSubscription(planId: string, seats: number, tenantId: string) {
  return razorpayRequest<RazorpaySubscription>("POST", "/subscriptions", {
    plan_id: planId,
    quantity: seats,
    total_count: TOTAL_BILLING_CYCLES,
    customer_notify: 1,
    notes: { tenant_id: tenantId },
  });
}

export function fetchSubscription(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscription>("GET", `/subscriptions/${subscriptionId}`);
}

// Increases apply now so the new seats can be used at once; decreases wait
// for the end of the paid period, which the customer has already paid for.
export function updateSubscriptionSeats(subscriptionId: string, seats: number, increase: boolean) {
  return razorpayRequest<RazorpaySubscription>("PATCH", `/subscriptions/${subscriptionId}`, {
    quantity: seats,
    schedule_change_at: increase ? "now" : "cycle_end",
  });
}

export function cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscription>("POST", `/subscriptions/${subscriptionId}/cancel`, {
    cancel_at_cycle_end: 1,
  });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Checkout's success callback: signed over "payment_id|subscription_id" with
// the API key secret.
export async function checkoutSignatureValid(
  paymentId: string,
  subscriptionId: string,
  signature: string,
): Promise<boolean> {
  const { keySecret } = credentials();
  return secretMatches(signature, await hmacSha256Hex(keySecret, `${paymentId}|${subscriptionId}`));
}

// Webhooks: signed over the exact raw request body with the webhook secret.
export async function webhookSignatureValid(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) throw new RazorpayConfigError("RAZORPAY_WEBHOOK_SECRET is not set.");
  return secretMatches(signature, await hmacSha256Hex(secret, rawBody));
}

const PAID_STATES = new Set(["active"]);
const RETRYING_STATES = new Set(["pending"]);
const ENDED_STATES = new Set(["halted", "cancelled", "completed", "expired"]);

/**
 * Writes a Razorpay subscription's current state onto the chamber's licence.
 * Always called with state fetched fresh from Razorpay, never with a webhook
 * payload, and every write is absolute rather than incremental — so a
 * retried or out-of-order delivery re-applies the same state instead of
 * double-extending a period.
 *
 * Returns the licence status the chamber ended up in.
 */
export async function applySubscription(
  admin: SupabaseClient,
  tenantId: string,
  subscription: RazorpaySubscription,
): Promise<"premium" | "past_due" | "free" | "unchanged"> {
  const { data: license, error } = await admin
    .from("licenses")
    .select("razorpay_subscription_id, razorpay_subscription_status")
    .eq("tenant_id", tenantId)
    .single();
  if (error || !license) throw new Error(`No licence for tenant ${tenantId}`);

  // Only the subscription this chamber most recently started may change it;
  // an old or abandoned one never downgrades a newer paid one.
  if (license.razorpay_subscription_id !== subscription.id) return "unchanged";

  if (PAID_STATES.has(subscription.status) || RETRYING_STATES.has(subscription.status)) {
    const keepScheduledCancel = license.razorpay_subscription_status === "cancel_scheduled";
    const { error: updateError } = await admin
      .from("licenses")
      .update({
        plan: "premium",
        seats: subscription.quantity,
        status: PAID_STATES.has(subscription.status) ? "active" : "past_due",
        billing_cadence: "monthly",
        current_period_end: subscription.current_end
          ? new Date(subscription.current_end * 1000).toISOString()
          : null,
        razorpay_subscription_status: keepScheduledCancel
          ? "cancel_scheduled"
          : subscription.status,
      })
      .eq("tenant_id", tenantId);
    if (updateError) throw new Error(updateError.message);
    return PAID_STATES.has(subscription.status) ? "premium" : "past_due";
  }

  if (ENDED_STATES.has(subscription.status)) {
    // Back to Free, never read-only: nothing is deleted, and extra members
    // keep their logins (Free just can't invite more). seats must drop to 1
    // in the same write or the seat-floor trigger rejects it.
    const { error: updateError } = await admin
      .from("licenses")
      .update({
        plan: "free",
        seats: 1,
        status: "active",
        current_period_end: null,
        razorpay_subscription_id: null,
        razorpay_subscription_status: subscription.status,
      })
      .eq("tenant_id", tenantId);
    if (updateError) throw new Error(updateError.message);
    return "free";
  }

  // created / authenticated: checkout started or mandate set, not yet charged.
  const { error: updateError } = await admin
    .from("licenses")
    .update({ razorpay_subscription_status: subscription.status })
    .eq("tenant_id", tenantId);
  if (updateError) throw new Error(updateError.message);
  return "unchanged";
}
