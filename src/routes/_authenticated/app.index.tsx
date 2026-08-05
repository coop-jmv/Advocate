import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { DataTable, StatCard, Tag, type Tone } from "@/components/app/primitives";
import { todaysDiary, limitationAlerts, timeEntries, weeklyLoad } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Advocate Companion" },
      {
        name: "description",
        content:
          "Today's hearings, limitation alerts, billable hours and workload at a glance for your practice.",
      },
      { property: "og:title", content: "Dashboard — Advocate Companion" },
      {
        property: "og:description",
        content: "Today's hearings, limitation alerts and billable hours at a glance.",
      },
    ],
  }),
  component: Dashboard,
});

const statusTone: Record<string, Tone> = {
  Confirmed: "success",
  "Cause list awaited": "warning",
  Adjourned: "neutral",
};

const severityTone: Record<string, Tone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

function Dashboard() {
  const maxLoad = Math.max(...weeklyLoad.map((d) => d.billed));

  return (
    <AppShell
      title="Tuesday, 4 August 2026"
      subtitle="3 hearings listed · 2 matters need attention before tomorrow"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active matters" value="38" note="5 opened this month" />
        <StatCard label="Hearings this week" value="21" note="Across 6 court complexes" />
        <StatCard label="Unbilled hours" value="42.5" note="≈ ₹2,41,000 in WIP" />
        <StatCard label="Outstanding" value="₹3,49,900" note="1 invoice overdue" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Today's diary</h2>
            <Link to="/app/diary" className="text-sm text-accent hover:underline">
              Full diary
            </Link>
          </div>
          <DataTable headers={["Time", "Court", "Matter", "Purpose", "Status"]}>
            {todaysDiary.map((hearing) => (
              <tr key={hearing.id} className="hover:bg-secondary/40">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{hearing.time}</td>
                <td className="px-4 py-3 whitespace-nowrap">{hearing.court}</td>
                <td className="px-4 py-3">
                  {hearing.matter}
                  <span className="ml-2 text-xs text-muted-foreground">{hearing.item}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{hearing.purpose}</td>
                <td className="px-4 py-3">
                  <Tag tone={statusTone[hearing.status]}>{hearing.status}</Tag>
                </td>
              </tr>
            ))}
          </DataTable>

          <h2 className="mt-8 mb-3 font-display text-lg font-bold">Recent time entries</h2>
          <DataTable headers={["Date", "Matter", "Task", "Hours", "Value"]}>
            {timeEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-secondary/40">
                <td className="px-4 py-3 whitespace-nowrap">{entry.date}</td>
                <td className="px-4 py-3 font-mono text-xs">{entry.matter}</td>
                <td className="px-4 py-3">{entry.task}</td>
                <td className="px-4 py-3">{entry.hours}</td>
                <td className="px-4 py-3 font-medium">{entry.value}</td>
              </tr>
            ))}
          </DataTable>
        </section>

        <div className="space-y-6">
          <section className="surface-panel rounded p-5">
            <h2 className="font-display text-lg font-bold">Limitation & compliance</h2>
            <ul className="mt-4 space-y-4">
              {limitationAlerts.map((alert) => (
                <li key={alert.matter} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm">{alert.note}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{alert.matter}</p>
                  </div>
                  <Tag tone={severityTone[alert.severity]}>{alert.severity}</Tag>
                </li>
              ))}
            </ul>
          </section>

          <section className="surface-panel rounded p-5">
            <h2 className="font-display text-lg font-bold">This week</h2>
            <p className="mt-1 text-xs text-muted-foreground">Billable hours recorded per day</p>
            <ul className="mt-5 space-y-3">
              {weeklyLoad.map((day) => (
                <li key={day.day} className="flex items-center gap-3 text-sm">
                  <span className="w-9 text-muted-foreground">{day.day}</span>
                  <span className="h-2 flex-1 rounded-full bg-secondary">
                    <span
                      className="block h-2 rounded-full bg-accent"
                      style={{ width: `${(day.billed / maxLoad) * 100}%` }}
                    />
                  </span>
                  <span className="w-14 text-right tabular-nums">{day.billed} h</span>
                  <span className="w-16 text-right text-xs text-muted-foreground">
                    {day.hearings} hrgs
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
