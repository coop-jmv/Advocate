import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Tag, type Tone } from "@/components/app/primitives";
import { todaysDiary } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/app/diary")({
  head: () => ({
    meta: [
      { title: "Court diary — Advocate Companion" },
      {
        name: "description",
        content:
          "Week view of listed hearings with cause-list status, appearance marking and conflict detection.",
      },
      { property: "og:title", content: "Court diary — Advocate Companion" },
      {
        property: "og:description",
        content: "Week view of listed hearings with cause-list status and conflict detection.",
      },
    ],
  }),
  component: Diary,
});

const statusTone: Record<string, Tone> = {
  Confirmed: "success",
  "Cause list awaited": "warning",
  Adjourned: "neutral",
};

type DiaryItem = { time: string; matter: string; court: string; clash?: boolean };
type DiaryDay = { day: string; date: string; today?: boolean; items: DiaryItem[] };

const week: DiaryDay[] = [
  {
    day: "Mon",
    date: "3 Aug",
    items: [{ time: "11:00", matter: "Yadav v. Gram Panchayat", court: "District Court, Lucknow" }],
  },
  {
    day: "Tue",
    date: "4 Aug",
    today: true,
    items: [
      { time: "10:30", matter: "Malhotra v. Sunrise", court: "Delhi HC — Court 12" },
      { time: "11:45", matter: "Iyer v. Coastal Insurance", court: "Consumer Forum, Chennai" },
      { time: "14:15", matter: "State v. Imran Sheikh", court: "Sessions Court, Pune" },
    ],
  },
  {
    day: "Wed",
    date: "5 Aug",
    items: [{ time: "10:00", matter: "Nandini Enterprises v. CGST", court: "Karnataka HC" }],
  },
  {
    day: "Thu",
    date: "6 Aug",
    items: [
      { time: "10:30", matter: "Malhotra v. Sunrise", court: "Delhi HC — Court 12" },
      { time: "10:30", matter: "Kapoor v. Kapoor", court: "Family Court, Saket", clash: true },
    ],
  },
  {
    day: "Fri",
    date: "7 Aug",
    items: [
      { time: "11:30", matter: "Iyer v. Coastal Insurance", court: "Consumer Forum, Chennai" },
    ],
  },
  { day: "Sat", date: "8 Aug", items: [] },
];

function Diary() {
  return (
    <AppShell
      title="Court diary"
      subtitle="Week of 3–8 August 2026 · 1 listing conflict detected"
      action={
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
        >
          Add hearing
        </button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-3">
          {week.map((day) => (
            <div key={day.day} className="min-h-36 bg-card p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-display text-sm font-bold">
                  {day.day} {day.date}
                </p>
                {day.today ? <Tag tone="accent">Today</Tag> : null}
              </div>
              <ul className="mt-3 space-y-2">
                {day.items.length === 0 ? (
                  <li className="text-xs text-muted-foreground">No listings</li>
                ) : (
                  day.items.map((item) => (
                    <li
                      key={`${day.day}-${item.time}-${item.matter}`}
                      className={
                        item.clash
                          ? "rounded border-l-2 border-destructive bg-destructive/5 p-2"
                          : "rounded border-l-2 border-accent bg-secondary/50 p-2"
                      }
                    >
                      <p className="text-xs font-semibold">{item.time}</p>
                      <p className="mt-0.5 text-xs">{item.matter}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{item.court}</p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </section>

        <div className="space-y-4">
          <section className="surface-panel rounded p-5">
            <h2 className="font-display text-lg font-bold">Today's appearances</h2>
            <ul className="mt-4 space-y-4">
              {todaysDiary.map((hearing) => (
                <li
                  key={hearing.id}
                  className="border-b border-border pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{hearing.matter}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {hearing.time} · {hearing.court} · {hearing.item}
                      </p>
                      <p className="mt-1 text-xs">{hearing.purpose}</p>
                    </div>
                    <Tag tone={statusTone[hearing.status]}>{hearing.status}</Tag>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {["Mark appearance", "Adjourned", "Record outcome"].map((label) => (
                      <button
                        key={label}
                        type="button"
                        className="rounded border border-input px-2.5 py-1 text-xs transition-colors hover:bg-secondary"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded border-l-2 border-destructive bg-destructive/5 p-5">
            <h2 className="font-display text-base font-bold">Conflict on 6 August</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Two matters are listed at 10:30 — Delhi High Court Court 12 and Family Court, Saket.
              Brief a junior or move for a pass-over.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
