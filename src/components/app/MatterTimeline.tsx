import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Briefcase, CalendarClock, FileText, ListChecks } from "lucide-react";
import type { TimelineEvent, TimelineEventType } from "@/lib/matter-timeline";

// Every event traces back to a real source record (see matter-timeline.ts) —
// this component only renders and filters, it never fabricates an event.
// Source links go to the relevant existing list page (Diary/Cause
// list/Documents), not a specific record permalink, since no per-record
// detail page exists yet for hearings/cause-list listings/documents in this
// app — a known, documented limitation rather than a broken deep link.

const TYPE_META: Record<
  TimelineEventType,
  { label: string; icon: typeof Briefcase; tone: string; to?: string; sourceLabel?: string }
> = {
  matter_created: { label: "Matter", icon: Briefcase, tone: "text-docket-violet" },
  hearing: {
    label: "Hearing",
    icon: CalendarClock,
    tone: "text-docket-sapphire",
    to: "/app/diary",
    sourceLabel: "View in Court diary",
  },
  cause_list: {
    label: "Cause list",
    icon: ListChecks,
    tone: "text-docket-amber",
    to: "/app/cause-list",
    sourceLabel: "View in Cause list",
  },
  document: {
    label: "Document",
    icon: FileText,
    tone: "text-docket-teal",
    to: "/app/documents",
    sourceLabel: "View in Documents",
  },
};

const ALL_TYPES = Object.keys(TYPE_META) as TimelineEventType[];
const PAGE_SIZE = 15;

function formatDate(iso: string): string {
  const date = iso.length <= 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function MatterTimeline({ events }: { events: TimelineEvent[] }) {
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [activeTypes, setActiveTypes] = useState<Set<TimelineEventType>>(new Set(ALL_TYPES));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    let list = events.filter((e) => activeTypes.has(e.type));
    if (from) list = list.filter((e) => e.eventAt >= from);
    if (to) list = list.filter((e) => e.eventAt <= `${to}T23:59:59`);
    list = [...list].sort((a, b) => a.eventAt.localeCompare(b.eventAt));
    if (order === "newest") list.reverse();
    return list;
  }, [events, activeTypes, from, to, order]);

  const visible = filtered.slice(0, visibleCount);

  function toggleType(type: TimelineEventType) {
    setVisibleCount(PAGE_SIZE);
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No timeline events yet for this matter.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded border border-input">
          {(["newest", "oldest"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOrder(value)}
              className={
                order === value
                  ? "bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  : "px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
              }
            >
              {value === "newest" ? "Newest first" : "Oldest first"}
            </button>
          ))}
        </div>
        {ALL_TYPES.map((type) => {
          const meta = TYPE_META[type];
          const active = activeTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className={
                active
                  ? "rounded border border-input bg-secondary px-2.5 py-1 text-xs font-medium"
                  : "rounded border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground opacity-60"
              }
            >
              {meta.label}
            </button>
          );
        })}
        <input
          type="date"
          value={from}
          onChange={(event) => {
            setVisibleCount(PAGE_SIZE);
            setFrom(event.target.value);
          }}
          className="rounded border border-input bg-background px-2 py-1 text-xs"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={to}
          onChange={(event) => {
            setVisibleCount(PAGE_SIZE);
            setTo(event.target.value);
          }}
          className="rounded border border-input bg-background px-2 py-1 text-xs"
          aria-label="To date"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events match these filters.</p>
      ) : (
        <ol className="space-y-3">
          {visible.map((event) => {
            const meta = TYPE_META[event.type];
            const Icon = meta.icon;
            return (
              <li key={event.id} className="surface-panel flex gap-3 rounded p-4">
                <span
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center ${meta.tone}`}
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold">{event.title}</p>
                    <p className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDate(event.eventAt)}
                    </p>
                  </div>
                  {event.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                  ) : null}
                  {meta.to ? (
                    <Link
                      to={meta.to}
                      className="mt-1.5 inline-block text-xs font-medium text-accent hover:underline"
                    >
                      {meta.sourceLabel}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {filtered.length > visible.length ? (
        <button
          type="button"
          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
          className="mt-4 w-full rounded border border-input py-2 text-sm font-medium transition-colors hover:bg-secondary"
        >
          Show more ({filtered.length - visible.length} remaining)
        </button>
      ) : null}
    </div>
  );
}
