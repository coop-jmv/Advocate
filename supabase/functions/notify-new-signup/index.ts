import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { secretMatches } from "../_shared/timing-safe.ts";

// Emails the LexDiary team when someone registers. Invoked only by the
// AFTER INSERT trigger on public.profiles (via pg_net — see
// 20260918090000_notify_new_signup.sql), never by a user, so this function
// has `verify_jwt = false` in config.toml and checks the same shared secret as
// whatsapp-diary-digest instead.
//
// Deliberately minimal on personal data, at the owner's request: the email
// carries only the person's name and login email, plus whether they created a
// new chamber or joined an existing one by invite. No phone, enrolment number,
// chamber name, plan or ids. The trigger sends only the profile id, so no
// personal data passes through pg_net's request queue either — this function
// looks the two fields up itself.
//
// Best-effort by design: the signup has already committed by the time this
// runs, and nothing here can undo or block it.

const NOTIFY_TO = "lexdiary.online@gmail.com";
const NOTIFY_FROM = "LexDiary Onboarding <onboarding@lexdiary.online>";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const secret = Deno.env.get("CRON_SHARED_SECRET");
  if (!secret || !secretMatches(req.headers.get("x-cron-secret"), secret)) {
    return errorResponse(req, "Unauthorized", 401);
  }

  let body: { profile_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body");
  }
  const profileId = body.profile_id;
  if (!profileId || !UUID_PATTERN.test(profileId)) {
    return errorResponse(req, "profile_id must be a UUID.");
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("new-signup email not sent: RESEND_API_KEY is not set on the edge functions");
    return errorResponse(req, "Email is not configured.", 503);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Exactly two personal fields are read: the name from profiles, the login
  // email from auth. tenant_role only decides the label — invites can grant
  // admin or member, never owner, so owner always means a brand-new chamber.
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, tenant_role")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return errorResponse(req, "No profile with that id.", 404);

  const { data: authUser } = await admin.auth.admin.getUserById(profileId);
  const email = authUser?.user?.email ?? "(no email on record)";
  const name = profile.full_name?.trim() || "(no name given)";
  const isNewChamber = profile.tenant_role === "owner";

  const subject = isNewChamber
    ? `New LexDiary registration — ${name}`
    : `Teammate joined an existing chamber — ${name}`;
  const kind = isNewChamber
    ? "Registered and created a <strong>new chamber</strong>."
    : "Joined an <strong>existing chamber</strong> by invite.";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: NOTIFY_FROM,
      to: [NOTIFY_TO],
      subject,
      html: `
        <p>${kind}</p>
        <p>Name: <strong>${escapeHtml(name)}</strong><br>Email: ${escapeHtml(email)}</p>
      `,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      `new-signup email rejected by Resend (${response.status}): ${detail.slice(0, 500)}`,
    );
    return errorResponse(req, "Email provider rejected the message.", 502);
  }

  return jsonResponse(req, { ok: true });
});
