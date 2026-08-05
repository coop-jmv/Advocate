import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { FileText, Loader2, Printer, Save, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Tag } from "@/components/app/primitives";
import { generateDraft, listDrafts, saveDraft } from "@/lib/ai.functions";
import { matters } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/app/drafting")({
  head: () => ({
    meta: [
      { title: "AI drafting studio — Advocate Companion" },
      {
        name: "description",
        content:
          "Generate court-ready notices, applications, replies and client letters with AI, edit them inline and print from your chamber workspace.",
      },
      { property: "og:title", content: "AI drafting studio — Advocate Companion" },
      {
        property: "og:description",
        content:
          "AI-generated Indian legal drafts with numbered paragraphs, prayer and verification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Drafting,
});

type Draft = {
  id: string;
  doc_type: string;
  matter_ref: string | null;
  instructions: string;
  content: string;
  created_at: string;
};

const DOC_TYPES = [
  "Legal notice",
  "Plaint",
  "Written statement",
  "Bail application",
  "Interim injunction application",
  "Reply to notice",
  "Vakalatnama covering letter",
  "Client advice letter",
] as const;

function Drafting() {
  const create = useServerFn(generateDraft);
  const load = useServerFn(listDrafts);
  const persist = useServerFn(saveDraft);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [active, setActive] = useState<Draft | null>(null);
  const [docType, setDocType] = useState<string>(DOC_TYPES[0]);
  const [matterRef, setMatterRef] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load()
      .then((rows) => setDrafts(rows as Draft[]))
      .catch(() => setDrafts([]));
  }, [load]);

  async function handleGenerate() {
    if (!instructions.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const draft = (await create({
        data: { docType, matterRef: matterRef || undefined, instructions },
      })) as Draft;
      setActive(draft);
      setDrafts((prev) => [draft, ...prev]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The draft could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!active) return;
    setSaving(true);
    try {
      await persist({ data: { id: active.id, content: active.content } });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="AI drafting studio"
      subtitle="Generate a first draft, refine it in place, then print or save to the matter"
    >
      {error ? (
        <p className="mb-6 rounded border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="surface-panel h-fit rounded p-5">
          <h2 className="font-display text-base font-bold">Draft brief</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="text-eyebrow">Document type</span>
              <select
                value={docType}
                onChange={(event) => setDocType(event.target.value)}
                className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
              >
                {DOC_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-eyebrow">Matter</span>
              <select
                value={matterRef}
                onChange={(event) => setMatterRef(event.target.value)}
                className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Not linked</option>
                {matters.map((matter) => (
                  <option
                    key={matter.id}
                    value={`${matter.id} — ${matter.title} (${matter.court})`}
                  >
                    {matter.id} — {matter.client}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-eyebrow">Facts &amp; instructions</span>
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={9}
                placeholder="Parties, dates, cause of action, relief sought, tone…"
                className="mt-1.5 w-full rounded border border-input bg-background p-3 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy || !instructions.trim()}
              className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Generate draft
            </button>
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <p className="text-eyebrow">Recent drafts</p>
            <div className="mt-3 space-y-1">
              {drafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No drafts yet.</p>
              ) : (
                drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => setActive(draft)}
                    className="block w-full truncate rounded px-2.5 py-2 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    {draft.doc_type}
                    {draft.matter_ref ? ` · ${draft.matter_ref.split(" — ")[0]}` : ""}
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="surface-panel rounded p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold">Draft</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Replace every [bracketed] placeholder and verify all citations before filing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {active ? <Tag tone="warning">AI draft — verify</Tag> : null}
              <button
                type="button"
                onClick={handleSave}
                disabled={!active || saving}
                className="flex items-center gap-2 rounded border border-input px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!active}
                className="flex items-center gap-2 rounded border border-input px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <Printer className="size-4" />
                Print
              </button>
            </div>
          </div>

          {active ? (
            <article id="dictation-print" className="mt-4 rounded border border-border bg-card p-6">
              <textarea
                value={active.content}
                onChange={(event) => setActive({ ...active, content: event.target.value })}
                rows={24}
                className="w-full resize-y bg-transparent text-sm leading-7 whitespace-pre-wrap outline-none"
              />
            </article>
          ) : (
            <p className="mt-4 flex items-center gap-2 rounded border border-dashed border-border px-4 py-10 text-sm text-muted-foreground">
              <FileText className="size-4" />
              Fill the brief on the left and generate a draft to see it here.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
