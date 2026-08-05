import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const askInput = z.object({
  conversationId: z.string().uuid().nullable(),
  matterRef: z.string().optional(),
  question: z.string().min(1),
});

const analyzeInput = z.object({
  name: z.string().min(1),
  matterRef: z.string().optional(),
  text: z.string().min(20),
});

const draftInput = z.object({
  docType: z.string().min(1),
  matterRef: z.string().optional(),
  instructions: z.string().min(5),
});

const briefingInput = z.object({
  context: z.string().min(10),
});

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_conversations")
      .select("id, title, matter_ref, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => askInput.parse(data))
  .handler(async ({ data, context }) => {
    const { chatComplete, LEGAL_SYSTEM_PROMPT } = await import("./ai-gateway.server");
    const { supabase, userId } = context;

    let conversationId = data.conversationId;
    if (!conversationId) {
      const { data: created, error } = await supabase
        .from("ai_conversations")
        .insert({
          user_id: userId,
          title: data.question.slice(0, 70),
          matter_ref: data.matterRef ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      conversationId = created.id;
    }

    const { data: history } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(40);

    const answer = await chatComplete([
      { role: "system", content: LEGAL_SYSTEM_PROMPT },
      ...(data.matterRef
        ? [{ role: "system" as const, content: `Active matter: ${data.matterRef}` }]
        : []),
      ...(history ?? []).map((row) => ({
        role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: row.content,
      })),
      { role: "user", content: data.question },
    ]);

    const { error: insertError } = await supabase.from("ai_messages").insert([
      { conversation_id: conversationId, user_id: userId, role: "user", content: data.question },
      {
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: answer || "No answer was generated. Please rephrase the question.",
      },
    ]);
    if (insertError) throw new Error(insertError.message);

    await supabase
      .from("ai_conversations")
      .update({ matter_ref: data.matterRef ?? null })
      .eq("id", conversationId);

    return { conversationId, answer };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_conversations")
      .delete()
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const analyzeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => analyzeInput.parse(data))
  .handler(async ({ data, context }) => {
    const { chatComplete, extractJson, LEGAL_SYSTEM_PROMPT } = await import("./ai-gateway.server");

    const raw = await chatComplete([
      { role: "system", content: LEGAL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyse this legal document for an Indian advocate. Reply with ONLY a JSON object using keys: doc_kind (string), summary (string, max 6 sentences), parties (array of strings), key_dates (array of objects with date and what), tags (array of short strings), risk_notes (string covering limitation, missing annexures, compliance and drafting risks).\n\nDocument name: ${data.name}\n\n---\n${data.text.slice(0, 24000)}`,
      },
    ]);

    const parsed = extractJson(raw) as Record<string, unknown> | null;
    const record = {
      user_id: context.userId,
      name: data.name,
      matter_ref: data.matterRef ?? null,
      raw_text: data.text.slice(0, 60000),
      doc_kind: typeof parsed?.["doc_kind"] === "string" ? (parsed["doc_kind"] as string) : null,
      summary: typeof parsed?.["summary"] === "string" ? (parsed["summary"] as string) : raw,
      parties: Array.isArray(parsed?.["parties"]) ? parsed["parties"] : [],
      key_dates: Array.isArray(parsed?.["key_dates"]) ? parsed["key_dates"] : [],
      tags: Array.isArray(parsed?.["tags"]) ? parsed["tags"] : [],
      risk_notes:
        typeof parsed?.["risk_notes"] === "string" ? (parsed["risk_notes"] as string) : null,
    };

    const { data: saved, error } = await context.supabase
      .from("ai_documents")
      .insert(record)
      .select(
        "id, name, matter_ref, doc_kind, summary, parties, key_dates, tags, risk_notes, created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const listDocumentAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_documents")
      .select(
        "id, name, matter_ref, doc_kind, summary, parties, key_dates, tags, risk_notes, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const generateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => draftInput.parse(data))
  .handler(async ({ data, context }) => {
    const { chatComplete, LEGAL_SYSTEM_PROMPT } = await import("./ai-gateway.server");

    const content = await chatComplete([
      { role: "system", content: LEGAL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Draft a complete, court-ready ${data.docType} following Indian drafting conventions (cause title, numbered paragraphs, prayer, verification and place/date blocks where applicable). Use [square brackets] for any detail the advocate must fill in — never invent facts, names, dates or citations.\n\nMatter: ${data.matterRef ?? "Not specified"}\n\nInstructions from the advocate:\n${data.instructions}`,
      },
    ]);

    const { data: saved, error } = await context.supabase
      .from("ai_drafts")
      .insert({
        user_id: context.userId,
        doc_type: data.docType,
        matter_ref: data.matterRef ?? null,
        instructions: data.instructions,
        content,
      })
      .select("id, doc_type, matter_ref, instructions, content, created_at")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const listDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_drafts")
      .select("id, doc_type, matter_ref, instructions, content, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), content: z.string() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_drafts")
      .update({ content: data.content })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => briefingInput.parse(data))
  .handler(async ({ data }) => {
    const { chatComplete, LEGAL_SYSTEM_PROMPT } = await import("./ai-gateway.server");

    return {
      briefing: await chatComplete([
        { role: "system", content: LEGAL_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Prepare a chamber briefing for the advocate from the workload below. Use these markdown sections:\n\n## Hearing readiness\n## Limitation & deadline risk\n## Conflict and workload watch\n## Priority actions today\n\nBe specific, reference the matter codes given, and never invent matters or dates that are not listed.\n\n${data.context}`,
        },
      ]),
    };
  });
