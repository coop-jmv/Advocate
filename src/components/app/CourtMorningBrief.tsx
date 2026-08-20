import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronDown, ChevronUp, FileText, Loader2, Sparkles } from "lucide-react";
import { StatCard, Tag, type Tone } from "@/components/app/primitives";
import { getMorningBrief, type BriefItem, type BriefPriority } from "@/lib/morning-brief.functions";
import { generateMorningBriefSummaries, type MorningBriefSummaryInput } from "@/lib/edge-functions";

const priorityTone: Record<BriefPriority, Tone> = {
  critical: "danger",
  attention: "warning",
  upcoming: "accent",
  informational: "neutral",
};

const priorityLabel: Record<BriefPriority, string> = {
  critical: "Critical",
  attention: "Attention required",
  upcoming: "Upcoming",
  informational: "Informational",
};

const statusLabel: Record<string, string> = {
  confirmed: "Confirmed",
  cause_list_awaited: "Cause list awaited",
  adjourned: "Adjourned",
  completed: "Completed",
};

// Used only when the AI call fails or hasn't been run yet — built entirely
// from the same structured facts the AI is given, so the brief is fully
// functional with zero AI configuration.
function buildDeterministicSummary(item: BriefItem): string {
  const parts: string[] = [];
  parts.push(
    item.previousHearing
      ? `Previous hearing on ${item.previousHearing.hearingDate} (${statusLabel[item.previousHearing.status] ?? item.previousHearing.status}${item.previousHearing.purpose ? `, purpose: ${item.previousHearing.purpose}` : ""}).`
      : "No previous hearing on record for this matter.",
  );
  parts.push(
    item.purpose ? `Today's purpose: ${item.purpose}.` : "Today's purpose is not on record.",
  );
  parts.push(
    item.documents.length > 0
      ? `${item.documents.length} document${item.documents.length === 1 ? "" : "s"} on file.`
      : "No documents on record for this matter.",
  );
  if (item.hasConflict)
    parts.push("This hearing clashes with another listing at the same time today.");
  if (item.invoiceAlerts.some((i) => i.overdue)) parts.push("This matter has an overdue invoice.");
  if (item.causeList?.isNewListing)
    parts.push("This is a new listing on today's cause list — wasn't on record before.");
  else if (item.causeList?.changeSummary.length)
    parts.push(`Cause-list details changed: ${item.causeList.changeSummary.join("; ")}.`);
  return parts.join(" ");
}

function toSummaryInput(item: BriefItem): MorningBriefSummaryInput {
  return {
    hearingId: item.hearingId,
    matterTitle: item.matterTitle,
    court: item.court,
    hearingTime: item.hearingTime,
    purpose: item.purpose,
    status: item.status,
    previousHearing: item.previousHearing
      ? {
          hearingDate: item.previousHearing.hearingDate,
          status: item.previousHearing.status,
          purpose: item.previousHearing.purpose,
        }
      : null,
    documentCount: item.documents.length,
    hasConflict: item.hasConflict,
    hasOverdueInvoice: item.invoiceAlerts.some((i) => i.overdue),
  };
}

export function CourtMorningBrief() {
  const loadBrief = useServerFn(getMorningBrief);

  const [date, setDate] = useState<string | null>(null);
  const [advocateName, setAdvocateName] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [items, setItems] = useState<BriefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [aiSummaries, setAiSummaries] = useState<Map<string, string>>(new Map());
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAttempted, setAiAttempted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadBrief({ data: {} })
      .then((result) => {
        if (cancelled) return;
        setDate(result.date);
        setAdvocateName(result.advocateName);
        setAiEnabled(result.aiEnabled);
        setItems(result.items as BriefItem[]);
        if (result.items.length === 1) setExpandedId(result.items[0]!.hearingId);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Failed to load today's brief.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // loadBrief is re-created every render; listing it would re-fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const critical = items.filter((i) => i.priority === "critical").length;
    const conflicts = items.filter((i) => i.hasConflict).length;
    const withoutDocuments = items.filter((i) => i.documents.length === 0).length;
    const pendingActions = items.reduce(
      (sum, i) => sum + i.invoiceAlerts.filter((a) => a.overdue).length,
      0,
    );
    const causeListChanges = items.filter(
      (i) => i.causeList?.isNewListing || (i.causeList?.changeSummary.length ?? 0) > 0,
    ).length;
    return {
      hearings: items.length,
      critical,
      conflicts,
      withoutDocuments,
      pendingActions,
      causeListChanges,
    };
  }, [items]);

  const nextHearing = items[0] ?? null;

  async function handleGenerateSummaries() {
    setAiBusy(true);
    setAiError(null);
    setAiAttempted(true);
    try {
      const result = await generateMorningBriefSummaries({ items: items.map(toSummaryInput) });
      const next = new Map(aiSummaries);
      for (const s of result.summaries) {
        if (s.hearingId && typeof s.summary === "string") next.set(s.hearingId, s.summary);
      }
      setAiSummaries(next);
    } catch (cause) {
      // AI failure never breaks the brief — every card already has a
      // deterministic fallback summary built from the same structured data.
      setAiError(
        cause instanceof Error ? cause.message : "AI prep notes are unavailable right now.",
      );
    } finally {
      setAiBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="surface-panel rounded p-6">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Building today's court brief…
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="surface-panel rounded border-l-4 border-destructive p-6">
        <p className="text-sm text-destructive">{error}</p>
      </section>
    );
  }

  return (
    <section className="surface-panel rounded p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">
            Good morning{advocateName ? `, ${advocateName}` : ""}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your Court Brief —{" "}
            {date
              ? new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : ""}
          </p>
        </div>
        {items.length > 0 && aiEnabled ? (
          <button
            type="button"
            onClick={() => void handleGenerateSummaries()}
            disabled={aiBusy}
            className="flex items-center gap-2 rounded border border-input px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
          >
            {aiBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {aiAttempted && !aiBusy ? "Regenerate AI prep notes" : "Generate AI prep notes"}
          </button>
        ) : items.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            AI prep notes are turned off for this chamber by your workspace administrator.
          </p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No hearings listed for today. Add one from the{" "}
          <Link to="/app/diary" className="text-accent hover:underline">
            court diary
          </Link>
          .
        </p>
      ) : (
        <>
          {/* Mobile-only compact summary — spec order: next hearing, critical
              alerts, conflicts, pending actions, documents required. */}
          <div className="mt-5 space-y-2 rounded border border-border bg-secondary/40 p-3 text-xs sm:hidden">
            <p>
              <span className="font-semibold">Next:</span>{" "}
              {nextHearing
                ? `${nextHearing.hearingTime ?? "no time set"} — ${nextHearing.matterTitle}`
                : "—"}
            </p>
            <p>
              <span className="font-semibold">Critical:</span> {counts.critical}
            </p>
            <p>
              <span className="font-semibold">Conflicts:</span> {counts.conflicts}
            </p>
            <p>
              <span className="font-semibold">Pending actions:</span> {counts.pendingActions} · Task
              tracking not set up
            </p>
            <p>
              <span className="font-semibold">Without documents:</span> {counts.withoutDocuments}
            </p>
            <p>
              <span className="font-semibold">New/changed on cause list:</span>{" "}
              {counts.causeListChanges}
            </p>
          </div>

          <div className="mt-5 hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-6 [&>*]:min-w-0">
            <StatCard label="Hearings today" value={String(counts.hearings)} />
            <StatCard
              label="Critical"
              value={String(counts.critical)}
              note="Conflicts or overdue billing"
            />
            <StatCard
              label="Pending actions"
              value={String(counts.pendingActions)}
              note="Task tracking not set up yet"
            />
            <StatCard label="Conflicts" value={String(counts.conflicts)} />
            <StatCard label="Without documents" value={String(counts.withoutDocuments)} />
            <StatCard
              label="Cause list"
              value={String(counts.causeListChanges)}
              note="New or changed since last import"
            />
          </div>

          {aiError ? (
            <p className="mt-4 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
              {aiError} Showing deterministic summaries instead.
            </p>
          ) : null}

          <ol className="mt-6 space-y-3">
            {items.map((item) => {
              const expanded = expandedId === item.hearingId;
              const summary = aiSummaries.get(item.hearingId) ?? buildDeterministicSummary(item);
              return (
                <li
                  key={item.hearingId}
                  className={
                    item.priority === "critical"
                      ? "rounded border-l-4 border-destructive bg-destructive/5"
                      : item.priority === "attention"
                        ? "rounded border-l-4 border-warning bg-warning/5"
                        : "rounded border-l-4 border-accent bg-secondary/40"
                  }
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : item.hearingId)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold">{item.matterTitle}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.hearingTime ?? "No time set"} · {item.court ?? "Court not set"}
                        {item.matter?.clientName ? ` · ${item.matter.clientName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.causeList?.isNewListing ? (
                        <Tag tone="danger">New on cause list</Tag>
                      ) : item.causeList?.changeSummary.length ? (
                        <Tag tone="warning">Cause list changed</Tag>
                      ) : null}
                      <Tag tone={priorityTone[item.priority]}>{priorityLabel[item.priority]}</Tag>
                      <Tag tone="neutral">{statusLabel[item.status] ?? item.status}</Tag>
                      {expanded ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {item.priorityReasons.length > 0 ? (
                    <div className="flex flex-wrap gap-2 px-4 pb-2">
                      {item.priorityReasons.map((reason) => (
                        <span
                          key={reason}
                          className="flex items-center gap-1 text-xs font-medium text-destructive"
                        >
                          <AlertTriangle className="size-3" /> {reason}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {expanded ? (
                    <div className="space-y-4 border-t border-border/60 px-4 py-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-eyebrow text-muted-foreground">Previous hearing</p>
                          <p className="mt-1 text-sm">
                            {item.previousHearing
                              ? `${item.previousHearing.hearingDate} — ${statusLabel[item.previousHearing.status] ?? item.previousHearing.status}${item.previousHearing.purpose ? ` (${item.previousHearing.purpose})` : ""}`
                              : "Not available — no earlier hearing on record for this matter."}
                          </p>
                        </div>
                        <div>
                          <p className="text-eyebrow text-muted-foreground">Today's purpose</p>
                          <p className="mt-1 text-sm">{item.purpose ?? "Not available"}</p>
                        </div>
                        <div>
                          <p className="text-eyebrow text-muted-foreground">Case / client</p>
                          <p className="mt-1 text-sm">
                            {item.matter
                              ? `${item.matter.caseNumber ?? "No case number on record"} · ${item.matter.clientName ?? "No client on record"}`
                              : "Not available — no matching matter on record"}
                          </p>
                        </div>
                        <div>
                          <p className="text-eyebrow text-muted-foreground">Pending actions</p>
                          <p className="mt-1 text-sm">
                            {item.invoiceAlerts.filter((a) => a.overdue).length > 0
                              ? `${item.invoiceAlerts.filter((a) => a.overdue).length} overdue invoice(s) for this matter`
                              : "None on record. Task/deadline tracking isn't set up in this version."}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-eyebrow flex items-center gap-1.5 text-muted-foreground">
                          <FileText className="size-3.5" /> Documents ({item.documents.length})
                        </p>
                        {item.documents.length === 0 ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            No documents on record for this matter.
                          </p>
                        ) : (
                          <ul className="mt-1 space-y-1">
                            {item.documents.map((doc) => (
                              <li key={doc.id} className="text-sm">
                                {doc.name}
                                {doc.recentlyAnalyzed ? (
                                  <span className="ml-2 text-xs text-accent">
                                    recently analyzed
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {item.causeList?.changeSummary.length ? (
                        <div>
                          <p className="text-eyebrow text-muted-foreground">
                            Changed since last cause-list import
                          </p>
                          <ul className="mt-1 list-inside list-disc text-sm">
                            {item.causeList.changeSummary.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="rounded border border-border bg-card p-3">
                        <p className="text-eyebrow flex items-center gap-1.5 text-accent">
                          <Sparkles className="size-3.5" />
                          {aiSummaries.has(item.hearingId)
                            ? "AI preparation summary"
                            : "Preparation summary"}
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed">{summary}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link
                          to="/app/cases"
                          className="rounded border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                        >
                          Open matter
                        </Link>
                        <Link
                          to="/app/documents"
                          className="rounded border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                        >
                          View documents
                        </Link>
                        {item.causeList ? (
                          <Link
                            to="/app/cause-list"
                            className="rounded border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                          >
                            View in cause list
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
