import { handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { authedClient, requireUserId } from "../_shared/auth.ts";
import { enforceUsageQuota, extractTextFromImage } from "../_shared/ai.ts";
import { requireModule } from "../_shared/modules.ts";

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// The client's mimeType reaches extractTextFromImage() and is interpolated
// straight into a `data:${mimeType};base64,...` URL, so it was unvalidated
// passthrough into a string the AI gateway parses. The <input accept="image/*">
// in DocumentIntelligence.tsx is a picker hint, not a control — the field is
// whatever the caller sends.
//
// The list is every image type an "image/*" picker realistically yields rather
// than a minimal jpeg/png pair, on purpose: iOS cameras hand back HEIC/HEIF and
// this app ships an iPhone build (capacitor.config.ts), so a tighter list would
// break scans that work today. The point is to exclude non-images, not to
// second-guess the camera.
//
// Parameters are stripped ("image/jpeg; charset=binary") and case is
// normalised, because File.type is whatever the OS reported.
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

function normalizeImageMime(raw: string | undefined): string | null {
  // Same default as before: an empty File.type (common on some Android
  // pickers) is treated as a JPEG rather than rejected.
  const candidate = (raw ?? "").split(";")[0].trim().toLowerCase() || "image/jpeg";
  return ALLOWED_IMAGE_MIME.has(candidate) ? candidate : null;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = authedClient(req);
  if (!auth) return errorResponse(req, "Unauthorized", 401);
  const userId = await requireUserId(auth.supabase);
  if (!userId) return errorResponse(req, "Unauthorized", 401);

  // OCR is now its own purchasable module rather than tied to a plan tier
  // (was gated via assert_feature('ocr')/plan_feature — superseded). Gate
  // it here, not only in the UI: this endpoint is directly callable with
  // any valid user token.
  try {
    await requireModule(auth.supabase, userId, "documents");
  } catch (cause) {
    return errorResponse(req, cause instanceof Error ? cause.message : "Module check failed.", 403);
  }

  try {
    await enforceUsageQuota(auth.supabase);
  } catch (cause) {
    return errorResponse(req, cause instanceof Error ? cause.message : "Quota check failed.", 429);
  }

  let body: { imageBase64: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body");
  }
  if (!body.imageBase64) return errorResponse(req, "imageBase64 is required");

  const bytes = decodeBase64(body.imageBase64);
  if (bytes.byteLength < 1024) {
    return errorResponse(req, "That scan was empty — please retake the photo.");
  }
  if (bytes.byteLength > 10 * 1024 * 1024) {
    return errorResponse(req, "That photo is too large (max 10MB) — please retake it.", 413);
  }

  const mimeType = normalizeImageMime(body.mimeType);
  if (!mimeType) {
    return errorResponse(
      req,
      "That file type isn't supported — please send a photo (JPEG, PNG, WebP, GIF or HEIC).",
      415,
    );
  }

  try {
    const result = await extractTextFromImage(bytes, mimeType);
    return jsonResponse(req, result);
  } catch (cause) {
    return errorResponse(req, cause instanceof Error ? cause.message : "OCR failed.", 502);
  }
});
