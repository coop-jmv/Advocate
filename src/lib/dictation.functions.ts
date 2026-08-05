import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = process.env["AI_GATEWAY_URL"] || "https://api.openai.com/v1";
const MODEL = process.env["AI_GATEWAY_MODEL"] || "gpt-4o-mini";

const transcribeInput = z.object({
  audioBase64: z.string(),
  language: z.string().optional(),
});

const formatInput = z.object({
  transcript: z.string(),
  style: z.string(),
  matter: z.string().optional(),
});

function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const transcribeDictation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => transcribeInput.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["AI_GATEWAY_API_KEY"];
    if (!apiKey) throw new Error("Transcription is not configured.");

    const bytes = decodeBase64(data.audioBase64);
    if (bytes.byteLength < 2048) {
      throw new Error("That recording was empty — please dictate again.");
    }

    const form = new FormData();
    form.append("model", process.env["AI_GATEWAY_TRANSCRIBE_MODEL"] || "gpt-4o-mini-transcribe");
    form.append("file", new Blob([bytes], { type: "audio/wav" }), "dictation.wav");
    if (data.language && data.language !== "auto") form.append("language", data.language);

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
  });

export const formatDictation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => formatInput.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["AI_GATEWAY_API_KEY"];
    if (!apiKey) throw new Error("Formatting is not configured.");

    const response = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a legal stenographer for an Indian advocate's chamber. Clean up dictated speech into a print-ready draft: fix punctuation and paragraphing, expand dictated instructions like 'new paragraph' or 'full stop', keep Indian legal drafting conventions, cite sections exactly as dictated, and never invent facts. Return only the formatted document text in plain text with clear headings and numbered paragraphs where appropriate.",
          },
          {
            role: "user",
            content: `Document type: ${data.style}\nMatter: ${data.matter ?? "Not specified"}\n\nRaw dictation:\n${data.transcript}`,
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Formatting failed [${response.status}]: ${await response.text()}`);
    }
    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { text: (result.choices?.[0]?.message?.content ?? "").trim() };
  });
