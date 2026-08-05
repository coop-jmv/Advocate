import { handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authedClient, requireUserId } from "../_shared/auth.ts";
import { chatComplete, extractJson, LEGAL_SYSTEM_PROMPT } from "../_shared/ai.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = authedClient(req);
  if (!auth) return errorResponse("Unauthorized", 401);
  const userId = await requireUserId(auth.supabase);
  if (!userId) return errorResponse("Unauthorized", 401);
  const { supabase } = auth;

  let body: { name: string; matterRef?: string; text: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (!body.name?.trim() || !body.text || body.text.length < 20) {
    return errorResponse("name and text (min 20 chars) are required");
  }

  let raw: string;
  try {
    raw = await chatComplete([
      { role: "system", content: LEGAL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyse this legal document for an Indian advocate. Reply with ONLY a JSON object using keys: doc_kind (string), summary (string, max 6 sentences), parties (array of strings), key_dates (array of objects with date and what), tags (array of short strings), risk_notes (string covering limitation, missing annexures, compliance and drafting risks).\n\nDocument name: ${body.name}\n\n---\n${body.text.slice(0, 24000)}`,
      },
    ]);
  } catch (cause) {
    return errorResponse(cause instanceof Error ? cause.message : "AI request failed.", 502);
  }

  const parsed = extractJson(raw) as Record<string, unknown> | null;
  const record = {
    user_id: userId,
    name: body.name,
    matter_ref: body.matterRef ?? null,
    raw_text: body.text.slice(0, 60000),
    doc_kind: typeof parsed?.["doc_kind"] === "string" ? (parsed["doc_kind"] as string) : null,
    summary: typeof parsed?.["summary"] === "string" ? (parsed["summary"] as string) : raw,
    parties: Array.isArray(parsed?.["parties"]) ? parsed["parties"] : [],
    key_dates: Array.isArray(parsed?.["key_dates"]) ? parsed["key_dates"] : [],
    tags: Array.isArray(parsed?.["tags"]) ? parsed["tags"] : [],
    risk_notes:
      typeof parsed?.["risk_notes"] === "string" ? (parsed["risk_notes"] as string) : null,
  };

  const { data: saved, error } = await supabase
    .from("ai_documents")
    .insert(record)
    .select(
      "id, name, matter_ref, doc_kind, summary, parties, key_dates, tags, risk_notes, created_at",
    )
    .single();
  if (error) return errorResponse(error.message, 500);

  return jsonResponse(saved);
});
