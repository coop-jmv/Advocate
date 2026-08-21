import type { MatterContext } from "@/lib/matter-context.functions";

// Pure transform: MatterContext -> a flat, sorted list of timeline events.
// No DB access here (matches the cause-list-matching.ts / cause-list-changes.ts
// convention of keeping deterministic logic separate from data-fetching) and
// no fabricated events — every entry traces back to a real row already
// present in MatterContext, via sourceType/sourceId (see K3 spec §10).

export type TimelineEventType = "matter_created" | "hearing" | "cause_list" | "document";

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  eventAt: string;
  title: string;
  description: string | null;
  sourceType: "matter" | "hearing" | "cause_list" | "document";
  sourceId: string;
};

const hearingStatusLabel: Record<string, string> = {
  completed: "Hearing held",
  adjourned: "Hearing adjourned",
  cause_list_awaited: "Hearing — cause list awaited",
  confirmed: "Hearing scheduled",
};

const causeListChangeLabel: Record<string, string> = {
  new_listing: "Cause list — listed",
  removed: "Cause list — removed",
  hall_changed: "Cause list — hall changed",
  bench_changed: "Cause list — bench changed",
  stage_changed: "Cause list — stage changed",
  date_changed: "Cause list — date changed",
  serial_changed: "Cause list — serial number changed",
};

export function buildMatterTimeline(context: MatterContext): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: `matter-created-${context.matter.id}`,
    type: "matter_created",
    eventAt: context.matter.createdAt,
    title: "Matter created",
    description: context.matter.caseNumber
      ? `${context.matter.title} — ${context.matter.caseNumber}`
      : context.matter.title,
    sourceType: "matter",
    sourceId: context.matter.id,
  });

  for (const hearing of context.hearings) {
    events.push({
      id: `hearing-${hearing.id}`,
      type: "hearing",
      eventAt: hearing.hearingDate,
      title: hearingStatusLabel[hearing.status] ?? "Hearing scheduled",
      description: hearing.purpose,
      sourceType: "hearing",
      sourceId: hearing.id,
    });
  }

  for (const change of context.causeListEvents) {
    const description =
      change.changeType === "new_listing"
        ? [
            change.serialNumber ? `Serial No. ${change.serialNumber}` : null,
            change.courtHall,
            change.stage,
          ]
            .filter(Boolean)
            .join(", ") || null
        : change.fieldName
          ? `${change.fieldName.replace(/_/g, " ")}: ${change.oldValue ?? "—"} → ${change.newValue ?? "—"}`
          : null;

    events.push({
      id: `cause-list-${change.id}`,
      type: "cause_list",
      eventAt: change.detectedAt,
      title: causeListChangeLabel[change.changeType] ?? "Cause list update",
      description,
      sourceType: "cause_list",
      sourceId: change.recordId,
    });
  }

  for (const document of context.documents) {
    events.push({
      id: `document-${document.id}`,
      type: "document",
      eventAt: document.createdAt,
      title: document.docKind ? `Document added — ${document.docKind}` : "Document added",
      description: document.name,
      sourceType: "document",
      sourceId: document.id,
    });
  }

  return events.sort((a, b) => a.eventAt.localeCompare(b.eventAt));
}
