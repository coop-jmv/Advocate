const GATEWAY = Deno.env.get("AI_GATEWAY_URL") || "https://api.openai.com/v1";
const MODEL = Deno.env.get("AI_GATEWAY_MODEL") || "gpt-4o-mini";
const TRANSCRIBE_MODEL = Deno.env.get("AI_GATEWAY_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) throw new Error("AI is not configured for this workspace.");

  const response = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 429)
      throw new Error("AI is rate limited right now — try again shortly.");
    if (response.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    throw new Error(`AI request failed [${response.status}]: ${detail.slice(0, 200)}`);
  }

  const result = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return (result.choices?.[0]?.message?.content ?? "").trim();
}

export async function transcribeAudio(
  bytes: Uint8Array,
  language?: string,
): Promise<{ text: string }> {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) throw new Error("Transcription is not configured.");

  const form = new FormData();
  form.append("model", TRANSCRIBE_MODEL);
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "dictation.wav");
  if (language && language !== "auto") form.append("language", language);

  const response = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Transcription failed [${response.status}]: ${await response.text()}`);
  }
  const result = (await response.json()) as { text?: string };
  return { text: (result.text ?? "").trim() };
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  try {
    return JSON.parse(candidate.slice(start));
  } catch {
    return null;
  }
}

export const LEGAL_SYSTEM_PROMPT =
  "You are an AI legal associate in an Indian advocate's chamber. You know Indian civil, criminal, tax, consumer, family and constitutional practice, CPC/CrPC/BNSS, Evidence Act, Limitation Act and court procedure. Be precise and practical, cite sections and case names only when you are confident, and clearly flag anything the advocate must verify. Never fabricate citations, CNR numbers, dates or facts. Answer in clear plain text or markdown suitable for a practising advocate.";
