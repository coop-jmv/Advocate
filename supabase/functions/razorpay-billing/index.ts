import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authedClient, requireUserId } from "../_shared/auth.ts";
import {
  applySubscription,
  assertPlanPrice,
  cancelSubscriptionAtPeriodEnd,
  checkoutSignatureValid,
  createSubscription,
  fetchSubscription,
  RazorpayApiError,
  RazorpayConfigError,
  razorpayKeyId,
  updateSubscriptionSeats,
} from "../_shared/razorpay.ts";

// Premium plan billing, called by the app with the user's JWT. Only a chamber
// owner or admin may act. Reads go through the caller's RLS-scoped client;
// licence writes go through the service role, because members have no write
// access to their own licence row.
//
// Actions:
//   start   {seats}                        create a Razorpay subscription for checkout
//   verify  {paymentId, subscriptionId, signature}   checkout success callback
//   seats   {seats}                        change the seat count of an active subscription
//   cancel  {}                             end the subscription when the paid period ends

const MAX_SEATS = 100;
const LIVE_STATES = new Set(["active", "pending", "authenticated"]);

type Body = {
  action?: string;
  seats?: unknown;
  paymentId?: unknown;
  subscriptionId?: unknown;
  signature?: unknown;
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = authedClient(req);
  if (!auth) return errorResponse(req, "Unauthorized", 401);
  const userId = await requireUserId(auth.supabase);
  if (!userId) return errorResponse(req, "Unauthorized", 401);

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("tenant_id, tenant_role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.tenant_id) return errorResponse(req, "No chamber found for this account.", 403);
  if (profile.tenant_role !== "owner" && profile.tenant_role !== "admin") {
    return errorResponse(req, "Only a chamber owner or admin can manage the subscription.", 403);
  }
  const tenantId = profile.tenant_id as string;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false },
    },
  );

  const { data: license } = await admin
    .from("licenses")
    .select("plan, seats, razorpay_subscription_id, razorpay_subscription_status")
    .eq("tenant_id", tenantId)
    .single();
  if (!license) return errorResponse(req, "No licence found for this chamber.", 404);

  const seatsInUse = async (): Promise<number> => {
    const [{ count: members }, { count: invites }] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      admin
        .from("tenant_invites")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),
    ]);
    return (members ?? 0) + (invites ?? 0);
  };

  const parseSeats = (value: unknown): number | null =>
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_SEATS
      ? value
      : null;

  const hasLiveSubscription =
    !!license.razorpay_subscription_id &&
    (LIVE_STATES.has(license.razorpay_subscription_status ?? "") ||
      license.razorpay_subscription_status === "cancel_scheduled");

  try {
    switch (body.action) {
      case "start": {
        const seats = parseSeats(body.seats);
        if (!seats) return errorResponse(req, `Choose between 1 and ${MAX_SEATS} seats.`);
        if (license.plan === "premium" && hasLiveSubscription) {
          return errorResponse(
            req,
            "This chamber is already on Premium. Change the number of seats instead.",
          );
        }
        const inUse = await seatsInUse();
        if (seats < inUse) {
          return errorResponse(
            req,
            `Your chamber already uses ${inUse} seats, so choose at least ${inUse}.`,
          );
        }

        const planId = await assertPlanPrice();
        const subscription = await createSubscription(planId, seats, tenantId);
        // Replaces any earlier subscription that was never paid (checkout
        // closed half way); Razorpay expires those on its own.
        const { error } = await admin
          .from("licenses")
          .update({
            razorpay_subscription_id: subscription.id,
            razorpay_subscription_status: subscription.status,
          })
          .eq("tenant_id", tenantId);
        if (error) throw new Error(error.message);

        return jsonResponse(req, { subscriptionId: subscription.id, keyId: razorpayKeyId() });
      }

      case "verify": {
        const { paymentId, subscriptionId, signature } = body;
        if (
          typeof paymentId !== "string" ||
          typeof subscriptionId !== "string" ||
          typeof signature !== "string"
        ) {
          return errorResponse(req, "Missing payment details.");
        }
        if (subscriptionId !== license.razorpay_subscription_id) {
          return errorResponse(
            req,
            "That payment is not for this chamber's current checkout.",
            409,
          );
        }
        if (!(await checkoutSignatureValid(paymentId, subscriptionId, signature))) {
          return errorResponse(req, "The payment could not be verified.", 400);
        }
        // The signature proves checkout succeeded; the licence is still set
        // from Razorpay's own record, the same way the webhook does it.
        const result = await applySubscription(
          admin,
          tenantId,
          await fetchSubscription(subscriptionId),
        );
        return jsonResponse(req, { result });
      }

      case "seats": {
        const seats = parseSeats(body.seats);
        if (!seats) return errorResponse(req, `Choose between 1 and ${MAX_SEATS} seats.`);
        if (
          license.plan !== "premium" ||
          !license.razorpay_subscription_id ||
          license.razorpay_subscription_status !== "active"
        ) {
          return errorResponse(req, "Seats can only be changed on an active Premium subscription.");
        }
        if (seats === license.seats) return jsonResponse(req, { result: "unchanged" });
        const inUse = await seatsInUse();
        if (seats < inUse) {
          return errorResponse(
            req,
            `${inUse} seats are in use. Remove a member or revoke an invite before going down to ${seats}.`,
          );
        }
        const increase = seats > license.seats;
        await updateSubscriptionSeats(license.razorpay_subscription_id, seats, increase);
        const result = await applySubscription(
          admin,
          tenantId,
          await fetchSubscription(license.razorpay_subscription_id),
        );
        return jsonResponse(req, { result, effective: increase ? "now" : "next_renewal" });
      }

      case "cancel": {
        if (
          license.plan !== "premium" ||
          !license.razorpay_subscription_id ||
          license.razorpay_subscription_status !== "active"
        ) {
          return errorResponse(req, "There is no active Premium subscription to cancel.");
        }
        await cancelSubscriptionAtPeriodEnd(license.razorpay_subscription_id);
        const { error } = await admin
          .from("licenses")
          .update({ razorpay_subscription_status: "cancel_scheduled" })
          .eq("tenant_id", tenantId);
        if (error) throw new Error(error.message);
        return jsonResponse(req, { result: "cancel_scheduled" });
      }

      default:
        return errorResponse(req, "Unknown action.");
    }
  } catch (cause) {
    if (cause instanceof RazorpayConfigError) return errorResponse(req, cause.message, 503);
    if (cause instanceof RazorpayApiError) return errorResponse(req, cause.message, 502);
    // Anything else (a database error, a network failure) is logged, not
    // shown: its text can name internal tables.
    console.error("[razorpay-billing]", cause);
    return errorResponse(req, "Something went wrong with the subscription. Please try again.", 500);
  }
});
