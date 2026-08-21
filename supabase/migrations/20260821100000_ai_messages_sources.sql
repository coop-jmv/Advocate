-- K4 Ask My Case — structured source citations for an assistant message.
-- Generated entirely by the retrieval layer (never by the model itself, see
-- ai-ask-case/index.ts), so a citation can never reference a source that
-- wasn't actually retrieved for this matter. Additive and backward
-- compatible: every existing row defaults to an empty array, and the
-- existing generic ai-assistant chat (which never sets this) is unaffected.
ALTER TABLE public.ai_messages
  ADD COLUMN sources JSONB NOT NULL DEFAULT '[]'::jsonb;
