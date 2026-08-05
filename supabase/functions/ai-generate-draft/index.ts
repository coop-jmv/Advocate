import { handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authedClient, requireUserId } from "../_shared/auth.ts";
import { chatComplete, LEGAL_SYSTEM_PROMPT } from "../_shared/ai.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = authedClient(req);
  if (!auth) return errorResponse("Unauthorized", 401);
  const userId = await requireUserId(auth.supabase);
  if (!userId) return errorResponse("Unauthorized", 401);
  const { supabase } = auth;

  let body: { docType: string; matterRef?: string; instructions: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (!body.docType?.trim() || !body.instructions || body.instructions.length < 5) {
    return errorResponse("docType and instructions (min 5 chars) are required");
  }

  let content: string;
  try {
    content = await chatComplete([
      { role: "system", content: LEGAL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Draft a complete, court-ready ${body.docType} following Indian drafting conventions (cause title, numbered paragraphs, prayer, verification and place/date blocks where applicable). Use [square brackets] for any detail the advocate must fill in — never invent facts, names, dates or citations.\n\nMatter: ${body.matterRef ?? "Not specified"}\n\nInstructions from the advocate:\n${body.instructions}`,
      },
    ]);
  } catch (cause) {
    return errorResponse(cause instanceof Error ? cause.message : "AI request failed.", 502);
  }

  const { data: saved, error } = await supabase
    .from("ai_drafts")
    .insert({
      user_id: userId,
      doc_type: body.docType,
      matter_ref: body.matterRef ?? null,
      instructions: body.instructions,
      content,
    })
    .select("id, doc_type, matter_ref, instructions, content, created_at")
    .single();
  if (error) return errorResponse(error.message, 500);

  return jsonResponse(saved);
});
