import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Tag, type Tone } from "@/components/app/primitives";
import { MatterTimeline } from "@/components/app/MatterTimeline";
import { MatterAiSummary } from "@/components/app/MatterAiSummary";
import { AskMyCase } from "@/components/app/AskMyCase";
import { getMatterContext, type MatterContext } from "@/lib/matter-context.functions";
import { buildMatterTimeline } from "@/lib/matter-timeline";
import { todayIsoIST } from "@/lib/date-ist";

export const Route = createFileRoute("/_authenticated/app/cases/$matterId")({
  head: () => ({
    meta: [
      { title: "Matter — LexDiary" },
      {
        name: "description",
        content: "Case timeline, hearings, cause-list history and documents for one matter.",
      },
    ],
  }),
  component: MatterDetail,
});

const statusTone: Record<string, Tone> = {
  active: "accent",
  closed: "success",
  archived: "neutral",
};

function MatterDetail() {
  const { matterId } = Route.useParams();
  const loadContext = useServerFn(getMatterContext);

  const [context, setContext] = useState<MatterContext | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContext(undefined);
    setError(null);
    void loadContext({ data: { matterId } })
      .then((result) => {
        if (!cancelled) setContext(result as MatterContext | null);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Failed to load this matter.");
      });
    return () => {
      cancelled = true;
    };
  }, [matterId, loadContext]);

  const timeline = useMemo(() => (context ? buildMatterTimeline(context) : []), [context]);

  const nextHearing = useMemo(() => {
    if (!context) return null;
    const today = todayIsoIST();
    return (
      context.hearings.find(
        (h) => h.hearingDate >= today && h.status !== "completed" && h.status !== "adjourned",
      ) ?? null
    );
  }, [context]);

  const recentEvents = useMemo(() => [...timeline].reverse().slice(0, 3), [timeline]);

  if (context === undefined && !error) {
    return (
      <AppShell title="Matter" subtitle="Loading…">
        <p className="text-sm text-muted-foreground">Loading matter…</p>
      </AppShell>
    );
  }

  if (error || !context) {
    return (
      <AppShell title="Matter" subtitle="Not found">
        <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ?? "This matter doesn't exist, or isn't part of your chamber."}
        </p>
        <Link to="/app/cases" className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent">
          <ArrowLeft className="size-4" /> Back to Cases & matters
        </Link>
      </AppShell>
    );
  }

  const { matter } = context;

  return (
    <AppShell
      title={matter.title}
      subtitle={
        [matter.caseNumber, matter.court].filter(Boolean).join(" · ") || "No details on record"
      }
      action={
        <Link
          to="/app/cases"
          className="flex items-center gap-1.5 rounded border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
        >
          <ArrowLeft className="size-4" /> Cases
        </Link>
      }
    >
      <section className="surface-panel mb-6 rounded p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={statusTone[matter.status] ?? "neutral"}>{matter.status}</Tag>
          {matter.caseNumber ? (
            <span className="font-mono text-xs text-muted-foreground">{matter.caseNumber}</span>
          ) : null}
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-eyebrow text-muted-foreground">Court</dt>
            <dd className="mt-1 text-sm">{matter.court ?? "Not on record"}</dd>
          </div>
          <div>
            <dt className="text-eyebrow text-muted-foreground">Client</dt>
            <dd className="mt-1 text-sm">{matter.clientName ?? "Not on record"}</dd>
          </div>
          <div>
            <dt className="text-eyebrow text-muted-foreground">Opposing party</dt>
            <dd className="mt-1 text-sm">{matter.opposingParty ?? "Not on record"}</dd>
          </div>
          <div>
            <dt className="text-eyebrow text-muted-foreground">Next hearing</dt>
            <dd className="mt-1 text-sm">
              {nextHearing
                ? `${nextHearing.hearingDate}${nextHearing.hearingTime ? `, ${nextHearing.hearingTime}` : ""}`
                : "None scheduled"}
            </dd>
          </div>
        </dl>
      </section>

      <div className="mb-6">
        <MatterAiSummary context={context} />
      </div>

      <div className="mb-6">
        <AskMyCase context={context} />
      </div>

      <div className="mb-6">
        <h2 className="mb-3 font-display text-lg font-bold">Recent activity</h2>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet for this matter.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentEvents.map((event) => (
              <li key={event.id} className="text-sm">
                <span className="text-muted-foreground">{event.eventAt.slice(0, 10)}</span>{" "}
                <span className="font-medium">{event.title}</span>
                {event.description ? (
                  <span className="text-muted-foreground"> — {event.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Case timeline</h2>
        <MatterTimeline events={timeline} />
      </section>
    </AppShell>
  );
}
