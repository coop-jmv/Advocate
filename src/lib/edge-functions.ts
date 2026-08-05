import { supabase } from "@/integrations/supabase/client";

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw new Error(error.message);
  return data as T;
}

export function askAssistant(input: {
  conversationId: string | null;
  matterRef?: string | undefined;
  question: string;
}) {
  return invoke<{ conversationId: string; answer: string }>("ai-assistant", input);
}

export function analyzeDocument(input: {
  name: string;
  matterRef?: string | undefined;
  text: string;
}) {
  return invoke<{
    id: string;
    name: string;
    matter_ref: string | null;
    doc_kind: string | null;
    summary: string | null;
    parties: unknown;
    key_dates: unknown;
    tags: unknown;
    risk_notes: string | null;
    created_at: string;
  }>("ai-analyze-document", input);
}

export function generateDraft(input: {
  docType: string;
  matterRef?: string | undefined;
  instructions: string;
}) {
  return invoke<{
    id: string;
    doc_type: string;
    matter_ref: string | null;
    instructions: string;
    content: string;
    created_at: string;
  }>("ai-generate-draft", input);
}

export function generateBriefing(input: { context: string }) {
  return invoke<{ briefing: string }>("ai-generate-briefing", input);
}

export function transcribeDictation(input: { audioBase64: string; language?: string | undefined }) {
  return invoke<{ text: string }>("dictation-transcribe", input);
}

export function formatDictation(input: {
  transcript: string;
  style: string;
  matter?: string | undefined;
}) {
  return invoke<{ text: string }>("dictation-format", input);
}
