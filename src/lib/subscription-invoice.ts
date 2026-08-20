import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Mirrors plan_price_inr() in the database — see supabase/migrations/
// 20260820010000_pricing_plans_and_firm_features.sql. Duplicated here rather
// than queried at send-time because an invoice must show what was actually
// charged, not whatever the price happens to be when this runs.
const PLAN_NAMES: Record<string, string> = {
  solo_basic: "Solo Basic",
  solo_pro: "Solo Pro",
  chamber: "Chamber",
};
const PLAN_BASE_PRICE: Record<string, number> = {
  solo_basic: 499,
  solo_pro: 799,
  chamber: 999,
};
const CHAMBER_INCLUDED_SEATS = 2;
const CHAMBER_EXTRA_SEAT_PRICE = 499;
const GST_RATE = 0.18;

function rupees(value: number): string {
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function invoiceHtml(input: {
  invoiceNumber: string;
  date: string;
  chamberName: string;
  planName: string;
  basePrice: number;
  seatCost: number;
  extraSeats: number;
  gst: number;
  total: number;
}): string {
  const seatRow =
    input.extraSeats > 0
      ? `<tr><td style="padding:6px 0;color:#5B5F72">${input.extraSeats} extra seat${input.extraSeats === 1 ? "" : "s"} &times; ${rupees(CHAMBER_EXTRA_SEAT_PRICE)}</td><td style="padding:6px 0;text-align:right">${rupees(input.seatCost)}</td></tr>`
      : "";
  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1A1D2B">
      <h2 style="margin:0 0 4px">LexDiary</h2>
      <p style="margin:0 0 24px;color:#5B5F72;font-size:13px">Invoice ${input.invoiceNumber} &middot; ${input.date}</p>
      <p style="margin:0 0 4px"><strong>${input.chamberName}</strong></p>
      <p style="margin:0 0 24px;color:#5B5F72">${input.planName} plan &mdash; monthly subscription</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#5B5F72">${input.planName} plan</td><td style="padding:6px 0;text-align:right">${rupees(input.basePrice)}</td></tr>
        ${seatRow}
        <tr><td style="padding:6px 0;color:#5B5F72">GST (18%)</td><td style="padding:6px 0;text-align:right">${rupees(input.gst)}</td></tr>
        <tr style="border-top:1px solid #E2E1DC"><td style="padding:10px 0;font-weight:bold">Total paid</td><td style="padding:10px 0;text-align:right;font-weight:bold">${rupees(input.total)}</td></tr>
      </table>
      <p style="margin:28px 0 0;color:#5B5F72;font-size:12px">Payment received via Razorpay. Questions about this invoice? Reply to this email or write to chambers@lexdiary.online.</p>
    </div>
  `;
}

// Sends a subscription invoice by email once an admin moves a chamber onto a
// paid plan. Payment itself is reconciled manually (the chamber pays via a
// Razorpay payment link and emails the reference) — this is the one
// automated step in that flow, confirming to the chamber what they were
// actually charged.
export const sendSubscriptionInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ tenantId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: adminRow } = await context.supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!adminRow) throw new Error("Not authorized to send invoices.");

    const { data: tenant, error: tenantError } = await context.supabase
      .from("tenants")
      .select("id, name")
      .eq("id", data.tenantId)
      .single();
    if (tenantError || !tenant) throw new Error("Tenant not found.");

    const { data: license, error: licenseError } = await context.supabase
      .from("licenses")
      .select("plan, seats")
      .eq("tenant_id", data.tenantId)
      .single();
    if (licenseError || !license) throw new Error("License not found.");

    const basePrice = PLAN_BASE_PRICE[license.plan];
    const planName = PLAN_NAMES[license.plan];
    if (!basePrice || !planName) {
      throw new Error(`"${license.plan}" has no listed price to invoice.`);
    }

    const { data: owner, error: ownerError } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("tenant_id", data.tenantId)
      .eq("tenant_role", "owner")
      .maybeSingle();
    if (ownerError || !owner) throw new Error("Could not find the chamber owner.");

    // auth.users isn't reachable through the RLS-scoped client above — the
    // service-role client is the only way to resolve an id to an email.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(
      owner.id,
    );
    const ownerEmail = authUser?.user?.email;
    if (authUserError || !ownerEmail)
      throw new Error("Could not resolve the chamber owner's email.");

    const extraSeats =
      license.plan === "chamber" ? Math.max((license.seats ?? 0) - CHAMBER_INCLUDED_SEATS, 0) : 0;
    const seatCost = extraSeats * CHAMBER_EXTRA_SEAT_PRICE;
    const subtotal = basePrice + seatCost;
    const gst = Math.round(subtotal * GST_RATE);
    const total = subtotal + gst;
    const invoiceNumber = `LD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${tenant.id.slice(0, 8).toUpperCase()}`;

    const RESEND_API_KEY = process.env["RESEND_API_KEY"];
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "LexDiary Billing <billing@lexdiary.online>",
        to: [ownerEmail],
        subject: `Invoice ${invoiceNumber} — LexDiary ${planName} plan`,
        html: invoiceHtml({
          invoiceNumber,
          date: new Date().toLocaleDateString("en-IN", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          chamberName: tenant.name,
          planName,
          basePrice,
          seatCost,
          extraSeats,
          gst,
          total,
        }),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to send the invoice email: ${body}`);
    }

    return { ok: true, invoiceNumber, total };
  });
