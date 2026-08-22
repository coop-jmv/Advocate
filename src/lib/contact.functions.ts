import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public, unauthenticated — a prospective customer submitting "Request
// access" has no account yet. Writes via the service-role client rather
// than an anon-role RLS policy, so contact_requests can stay closed to
// anon/authenticated writes entirely; see that migration's comment.
const inputSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  enrolmentNo: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(1).max(30),
  court: z.string().trim().max(200).optional(),
  note: z.string().trim().max(4000).optional(),
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Best-effort — a failed notification email should never lose a request
// that's already safely in contact_requests; the table (visible on
// /admin/contact-requests) is the source of truth, this is just paging
// whoever's on point sooner than a next admin-panel check would.
async function notifyChambers(data: z.infer<typeof inputSchema>): Promise<void> {
  const RESEND_API_KEY = process.env["RESEND_API_KEY"];
  if (!RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "LexDiary Onboarding <onboarding@lexdiary.online>",
        to: ["chambers@lexdiary.online"],
        subject: `New access request — ${data.fullName}`,
        html: `
          <p><strong>${escapeHtml(data.fullName)}</strong>${data.enrolmentNo ? ` (${escapeHtml(data.enrolmentNo)})` : ""} requested access.</p>
          <p>Email: ${escapeHtml(data.email)}<br>Phone: ${escapeHtml(data.phone)}${data.court ? `<br>Court/bench: ${escapeHtml(data.court)}` : ""}</p>
          ${data.note ? `<p>${escapeHtml(data.note).replace(/\n/g, "<br>")}</p>` : ""}
        `,
      }),
    });
  } catch {
    // Swallowed deliberately — see the comment above this function.
  }
}

export const submitContactRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("contact_requests").insert({
      full_name: data.fullName,
      enrolment_no: data.enrolmentNo || null,
      email: data.email,
      phone: data.phone,
      court: data.court || null,
      note: data.note || null,
    });
    if (error) throw new Error(error.message);
    await notifyChambers(data);
    return { ok: true };
  });
