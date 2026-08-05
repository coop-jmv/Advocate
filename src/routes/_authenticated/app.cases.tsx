import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { DataTable, Tag, type Tone } from "@/components/app/primitives";
import { matters, type CaseStage } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/app/cases")({
  head: () => ({
    meta: [
      { title: "Cases & matters — Advocate Companion" },
      {
        name: "description",
        content:
          "Every matter with its CNR, court, stage, next hearing date and opposing counsel in one register.",
      },
      { property: "og:title", content: "Cases & matters — Advocate Companion" },
      {
        property: "og:description",
        content: "Matters with CNR, court, stage and next hearing in one register.",
      },
    ],
  }),
  component: Cases,
});

const stageTone: Record<CaseStage, Tone> = {
  Pending: "warning",
  Hearing: "accent",
  Reserved: "neutral",
  Disposed: "success",
  Appeal: "danger",
};

function Cases() {
  return (
    <AppShell
      title="Cases & matters"
      subtitle={`${matters.length} matters shown · linked to e-Courts by CNR`}
      action={
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
        >
          Link by CNR
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {["All", "Hearing this week", "Pending", "Reserved for orders", "Disposed"].map(
          (filter, index) => (
            <button
              key={filter}
              type="button"
              className={
                index === 0
                  ? "rounded border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  : "rounded border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
              }
            >
              {filter}
            </button>
          ),
        )}
      </div>

      <DataTable headers={["Matter", "CNR", "Court", "Practice area", "Stage", "Next hearing"]}>
        {matters.map((matter) => (
          <tr key={matter.id} className="hover:bg-secondary/40">
            <td className="px-4 py-3">
              <p className="font-medium">{matter.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-mono">{matter.id}</span> · Client {matter.client} · Opposite{" "}
                {matter.opposing}
              </p>
            </td>
            <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{matter.cnr}</td>
            <td className="px-4 py-3 whitespace-nowrap">{matter.court}</td>
            <td className="px-4 py-3 text-muted-foreground">{matter.practice}</td>
            <td className="px-4 py-3">
              <Tag tone={stageTone[matter.stage]}>{matter.stage}</Tag>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">{matter.nextHearing}</td>
          </tr>
        ))}
      </DataTable>
    </AppShell>
  );
}
