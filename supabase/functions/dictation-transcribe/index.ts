import { handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authedClient, requireUserId } from "../_shared/auth.ts";
import { transcribeAudio } from "../_shared/ai.ts";

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = authedClient(req);
  if (!auth) return errorResponse("Unauthorized", 401);
  const userId = await requireUserId(auth.supabase);
  if (!userId) return errorResponse("Unauthorized", 401);

  let body: { audioBase64: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (!body.audioBase64) return errorResponse("audioBase64 is required");

  const bytes = decodeBase64(body.audioBase64);
  if (bytes.byteLength < 2048) {
    return errorResponse("That recording was empty — please dictate again.");
  }

  try {
    const result = await transcribeAudio(bytes, body.language);
    return jsonResponse(result);
  } catch (cause) {
    return errorResponse(cause instanceof Error ? cause.message : "Transcription failed.", 502);
  }
});
