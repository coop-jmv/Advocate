import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { DataTable, Tag, type Tone } from "@/components/app/primitives";
import { clients } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/app/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Advocate Companion" },
      {
        name: "description",
        content:
          "Client register with matter counts, outstanding balances, portal access status and conflict-of-interest flags.",
      },
      { property: "og:title", content: "Clients — Advocate Companion" },
      {
        property: "og:description",
        content: "Client register with balances, portal access and conflict-of-interest flags.",
      },
    ],
  }),
  component: Clients,
});

const portalTone: Record<string, Tone> = {
  Active: "success",
  Invited: "warning",
  "Not invited": "neutral",
};

function Clients() {
  return (
    <AppShell
      title="Clients"
      subtitle={`${clients.length} clients · 1 conflict check needs review`}
      action={
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
        >
          New client
        </button>
      }
    >
      <div className="mb-6 rounded border-l-2 border-warning bg-warning/10 p-5">
        <h2 className="font-display text-base font-bold">Conflict check pending</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Nandini Enterprises shares a director with an opposing party in AC-1031. Review before
          filing further pleadings.
        </p>
      </div>

      <DataTable headers={["Client", "City", "Matters", "Outstanding", "Portal", "Conflict"]}>
        {clients.map((client) => (
          <tr key={client.id} className="hover:bg-secondary/40">
            <td className="px-4 py-3">
              <p className="font-medium">{client.name}</p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{client.id}</p>
            </td>
            <td className="px-4 py-3">{client.city}</td>
            <td className="px-4 py-3 tabular-nums">{client.matters}</td>
            <td className="px-4 py-3 font-medium tabular-nums">{client.outstanding}</td>
            <td className="px-4 py-3">
              <Tag tone={portalTone[client.portal]}>{client.portal}</Tag>
            </td>
            <td className="px-4 py-3">
              <Tag tone={client.conflict === "Clear" ? "success" : "danger"}>{client.conflict}</Tag>
            </td>
          </tr>
        ))}
      </DataTable>
    </AppShell>
  );
}
