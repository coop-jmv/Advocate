import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { generateMatterSummary, type MatterSummary } from "@/lib/edge-functions";
import type { MatterContext } from "@/lib/matter-context.functions";

// Optional, on-demand AI summary — generated fresh each time (no
// persistence), same pattern as CourtMorningBrief's "Generate AI prep
// notes": nothing here is cached across visits, so there's nothing stale to
// go out of date. Never blocks the rest of the Matter page: this section
// simply doesn't render if aiEnabled is false, and shows a plain failure
// message (not an error state that looks broken) if the AI call fails —
// the timeline, hearings, cause-list history and documents above it never
// depend on this succeeding.

function toSummaryInput(context: MatterContext) {
  return {
    matter: {
      title: context.matter.title,
      caseNumber: context.matter.caseNumber,
      court: context.matter.court,
      status: context.matter.status,
      clientName: context.matter.clientName,
      opposingParty: context.matter.opposingParty,
      filedDate: context.matter.filedDate,
    },
    hearings: context.hearings.map((h) => ({
      hearingDate: h.hearingDate,
      status: h.status,
      purpose: h.purpose,
    })),
    causeListEvents: context.causeListEvents.map((c) => ({
      changeType: c.changeType,
      detectedAt: c.detectedAt,
      fieldName: c.fieldName,
      oldValue: c.oldValue,
      newValue: c.newValue,
    })),
    documentCount: context.documents.length,
  };
}

export function MatterAiSummary({ context }: { context: MatterContext }) {
  const [summary, setSummary] = useState<MatterSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  if (!context.aiEnabled) return null;

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    setAttempted(true);
    try {
      const result = await generateMatterSummary(toSummaryInput(context));
      setSummary(result.summary);
    } catch {
      setError("AI summary temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-panel rounded p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">AI Matter Summary</h2>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={busy}
          className="flex items-center gap-2 rounded border border-input px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {attempted && !busy ? "Regenerate" : "Generate summary"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Grounded in LexDiary's own records for this matter only — never legal research or advice.
      </p>

      {error ? <p className="mt-4 text-sm text-muted-foreground">{error}</p> : null}

      {summary ? (
        <dl className="mt-4 space-y-3">
          {[
            ["Current Position", summary.currentPosition],
            ["Recent Development", summary.recentDevelopment],
            ["Previous Activity", summary.previousActivity],
            ["Next Event", summary.nextEvent],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-eyebrow text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      ) : !busy && !error ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Not generated yet — click Generate summary for a grounded read of this matter's current
          position.
        </p>
      ) : null}
    </section>
  );
}
