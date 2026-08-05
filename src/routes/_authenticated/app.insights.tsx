import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Markdown } from "@/components/app/Markdown";
import { Tag } from "@/components/app/primitives";
import { generateBriefing } from "@/lib/edge-functions";
import { limitationAlerts, matters, todaysDiary, weeklyLoad } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/app/insights")({
  head: () => ({
    meta: [
      { title: "Diary & risk insights — Advocate Companion" },
      {
        name: "description",
        content:
          "AI briefings on hearing readiness, limitation risk, conflicts and priority actions across your matters and court diary.",
      },
      { property: "og:title", content: "Diary & risk insights — Advocate Companion" },
      {
        property: "og:description",
        content: "Daily AI briefing on hearings, limitation deadlines and chamber workload risk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Insights,
});

function buildContext() {
  return [
    "Today's hearings:",
    ...todaysDiary.map(
      (hearing) =>
        `- ${hearing.time} · ${hearing.court} · ${hearing.matter} · ${hearing.item} · ${hearing.purpose} · status ${hearing.status}`,
    ),
    "",
    "Active matters:",
    ...matters.map(
      (matter) =>
        `- ${matter.id} (${matter.cnr}) ${matter.title} · ${matter.court} · stage ${matter.stage} · next hearing ${matter.nextHearing} · ${matter.practice} · opposing ${matter.opposing}`,
    ),
    "",
    "Limitation and deadline alerts:",
    ...limitationAlerts.map((alert) => `- ${alert.matter}: ${alert.note} (${alert.severity})`),
    "",
    "Weekly load (hearings / billed hours):",
    ...weeklyLoad.map((day) => `- ${day.day}: ${day.hearings} hearings, ${day.billed}h billed`),
  ].join("\n");
}

function Insights() {
  const [briefing, setBriefing] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const result = await generateBriefing({ context: buildContext() });
      setBriefing(result.briefing);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The briefing could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AppShell
      title="Diary &amp; risk insights"
      subtitle="An AI briefing on hearing readiness, limitation risk and today's priorities"
      action={
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh briefing
        </button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="surface-panel rounded p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-display text-base font-bold">Today's chamber briefing</h2>
          </div>

          {error ? (
            <p className="mt-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {busy && !briefing ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Reviewing your diary, matters and deadlines…
            </p>
          ) : (
            <Markdown content={briefing} className="mt-4" />
          )}
        </section>

        <aside className="space-y-6">
          <section className="surface-panel rounded p-5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-destructive" />
              <h2 className="font-display text-sm font-bold">Deadline watch</h2>
            </div>
            <ul className="mt-3 space-y-3">
              {limitationAlerts.map((alert) => (
                <li key={alert.matter} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{alert.matter}</span>
                    <Tag
                      tone={
                        alert.severity === "high"
                          ? "danger"
                          : alert.severity === "medium"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {alert.severity}
                    </Tag>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{alert.note}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="surface-panel rounded p-5">
            <h2 className="font-display text-sm font-bold">Today in court</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {todaysDiary.map((hearing) => (
                <li key={hearing.id}>
                  <p className="font-semibold">
                    {hearing.time} · {hearing.matter}
                  </p>
                  <p className="text-muted-foreground">
                    {hearing.court} · {hearing.purpose}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
