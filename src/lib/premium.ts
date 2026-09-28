import { supabase } from "@/integrations/supabase/client";

// Premium pricing shown in the app. The charged amount is the Razorpay plan's
// (PREMIUM_SEAT_AMOUNT_PAISE in supabase/functions/_shared/razorpay.ts, and
// plan_price_inr() in the database) — keep all three in step.
export const PREMIUM_SEAT_PRICE_INR = 1999;
export const GST_RATE = 0.18;
export const PREMIUM_MAX_SEATS = 100;

export function premiumQuote(seats: number) {
  const subtotal = seats * PREMIUM_SEAT_PRICE_INR;
  const gst = Math.round(subtotal * GST_RATE * 100) / 100;
  return { subtotal, gst, total: Math.round((subtotal + gst) * 100) / 100 };
}

export function inr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

async function billing<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("razorpay-billing", { body });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const parsed = (await context.clone().json().catch(() => null)) as { error?: unknown } | null;
      if (typeof parsed?.error === "string" && parsed.error) throw new Error(parsed.error);
    }
    throw new Error(error.message);
  }
  return data as T;
}

type RazorpayCheckout = { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

let checkoutScript: Promise<void> | null = null;
function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutScript = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return checkoutScript;
}

export type CheckoutOutcome = "paid" | "processing" | "dismissed";

/**
 * Opens Razorpay checkout for a Premium subscription of `seats` seats.
 * Resolves "paid" once the chamber is on Premium, "processing" when the
 * payment went through but Razorpay hasn't confirmed the charge yet (the
 * webhook will finish it), or "dismissed" if the window was closed.
 */
export async function startPremiumCheckout(
  seats: number,
  prefill: { name?: string | undefined; email?: string | undefined },
): Promise<CheckoutOutcome> {
  await loadCheckoutScript();
  const { subscriptionId, keyId } = await billing<{ subscriptionId: string; keyId: string }>({
    action: "start",
    seats,
  });
  const quote = premiumQuote(seats);

  return new Promise<CheckoutOutcome>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: keyId,
      subscription_id: subscriptionId,
      name: "LexDiary",
      description: `Premium — ${seats} seat${seats === 1 ? "" : "s"}, ${inr(quote.total)}/month incl. GST`,
      prefill: { name: prefill.name ?? "", email: prefill.email ?? "" },
      theme: { color: "#12254A" },
      handler: (response: {
        razorpay_payment_id: string;
        razorpay_subscription_id: string;
        razorpay_signature: string;
      }) => {
        billing<{ result: string }>({
          action: "verify",
          paymentId: response.razorpay_payment_id,
          subscriptionId: response.razorpay_subscription_id,
          signature: response.razorpay_signature,
        })
          .then(({ result }) => resolve(result === "premium" ? "paid" : "processing"))
          .catch(reject);
      },
      modal: { ondismiss: () => resolve("dismissed") },
    });
    checkout.on("payment.failed", () => {
      // Razorpay shows its own failure message and lets the customer retry
      // inside the same window, so nothing is resolved here.
    });
    checkout.open();
  });
}

export function changePremiumSeats(seats: number) {
  return billing<{ result: string; effective: "now" | "next_renewal" }>({ action: "seats", seats });
}

export function cancelPremium() {
  return billing<{ result: string }>({ action: "cancel" });
}
