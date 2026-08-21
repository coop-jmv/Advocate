import { supabase } from "@/integrations/supabase/client";

// Every edge function here returns a friendly `{ error: "..." }` body on a
// non-2xx response (see supabase/functions/_shared/cors.ts's errorResponse),
// but supabase-js's FunctionsHttpError.message is always the generic
// "Edge Function returned a non-2xx status code" — the actual body only
// lives on error.context, a raw Response the caller has to read itself.
// Left unhandled, every edge-function error in the app (quota limits, legal-
// safety refusals, "that scan was empty", etc.) shows that generic sentence
// instead of the real reason. Reproduced live via the OCR path's "too small"
// scan during Gate 1 boundary testing.
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw new Error(await friendlyEdgeFunctionError(error));
  return data as T;
}

async function friendlyEdgeFunctionError(error: {
  message: string;
  context?: unknown;
}): Promise<string> {
  const context = error.context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) return body.error;
    } catch {
      // Body wasn't JSON (or already consumed) — fall through to the generic message.
    }
  }
  return error.message;
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
    status: string;
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
    status: string;
    created_at: string;
  }>("ai-generate-draft", input);
}

export function generateBriefing(input: { context: string }) {
  return invoke<{ briefing: string }>("ai-generate-briefing", input);
}

export type MorningBriefSummaryInput = {
  hearingId: string;
  matterTitle: string;
  court: string | null;
  hearingTime: string | null;
  purpose: string | null;
  status: string;
  previousHearing: { hearingDate: string; status: string; purpose: string | null } | null;
  documentCount: number;
  hasConflict: boolean;
  hasOverdueInvoice: boolean;
};

export function generateMorningBriefSummaries(input: { items: MorningBriefSummaryInput[] }) {
  return invoke<{ summaries: { hearingId: string; summary: string }[] }>("ai-morning-brief", input);
}

// K3 — Matter Intelligence. The client sends only the already-authorized,
// already-aggregated facts (see MatterContext / getMatterContext), never a
// raw matter_id — the edge function has no DB access of its own and no way
// to look up a fact not already in this payload, same trust model as
// generateMorningBriefSummaries above.
export type MatterSummaryInput = {
  today: string;
  matter: {
    title: string;
    caseNumber: string | null;
    court: string | null;
    status: string;
    clientName: string | null;
    opposingParty: string | null;
    filedDate: string | null;
  };
  hearings: { hearingDate: string; status: string; purpose: string | null }[];
  causeListEvents: {
    changeType: string;
    detectedAt: string;
    fieldName: string | null;
    oldValue: string | null;
    newValue: string | null;
  }[];
  documentCount: number;
};

export type MatterSummary = {
  currentPosition: string;
  recentDevelopment: string;
  previousActivity: string;
  nextEvent: string;
};

export function generateMatterSummary(input: MatterSummaryInput) {
  return invoke<{ summary: MatterSummary }>("ai-matter-summary", input);
}

// K4 — Ask My Case. Same trust model as generateMatterSummary above: the
// client sends only already-authorized, already-aggregated matter facts
// (see MatterContext / getMatterContext / getMatterDocumentTexts) plus the
// question — the edge function has no DB access for matter facts of its
// own, so it has no way to answer from anything the client wasn't already
// authorized to read.
export type AskCaseSource = {
  sourceType: "matter" | "hearing" | "cause_list" | "document";
  sourceId: string;
  title: string;
  date: string;
  snippet: string | null;
};

export type AskCaseInput = {
  matterId: string;
  conversationId: string | null;
  question: string;
  today: string;
  matter: {
    title: string;
    caseNumber: string | null;
    court: string | null;
    status: string;
    clientName: string | null;
    opposingParty: string | null;
    filedDate: string | null;
  };
  hearings: {
    id: string;
    hearingDate: string;
    hearingTime: string | null;
    court: string | null;
    purpose: string | null;
    status: string;
  }[];
  causeListEvents: {
    id: string;
    recordId: string;
    changeType: string;
    fieldName: string | null;
    oldValue: string | null;
    newValue: string | null;
    detectedAt: string;
    serialNumber: string | null;
    courtHall: string | null;
    bench: string | null;
    stage: string | null;
  }[];
  documents: {
    id: string;
    name: string;
    docKind: string | null;
    rawText: string;
    createdAt: string;
  }[];
};

export type AskCaseAnswer = {
  conversationId: string;
  answer: string;
  status: "grounded" | "insufficient" | "unavailable";
  sources: AskCaseSource[];
};

export function askMyCase(input: AskCaseInput) {
  return invoke<AskCaseAnswer>("ai-ask-case", input);
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

export function ocrExtract(input: { imageBase64: string; mimeType?: string | undefined }) {
  return invoke<{ text: string }>("ocr-extract", input);
}

export function logAuthEvent(input: {
  event: "login_success" | "login_failed" | "logout" | "signup";
  email?: string | undefined;
  userId?: string | undefined;
}) {
  // Best-effort — a failure to log an audit event should never block the
  // actual sign-in/out/signup flow the user is doing.
  return invoke<{ ok: true }>("audit-log-auth", input).catch(() => undefined);
}
