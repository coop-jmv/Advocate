import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, ScrollText } from "lucide-react";
import { DataTable, Tag, type Tone } from "@/components/app/primitives";
import { listPlatformAuditLog } from "@/lib/audit.functions";

export const Route = createFileRoute("/_admin/admin/audit-log")({
  head: () => ({ meta: [{ title: "Audit log — Platform admin" }] }),
  component: PlatformAuditLog,
});

type Metadata = {
  plan?: string;
  old_plan?: string;
  status?: string;
  old_status?: string;
  billing_cadence?: string;
  current_period_end?: string;
  name?: string;
};

type Entry = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  actor_email: string | null;
  metadata: Metadata | null;
  created_at: string;
  tenants: { name: string } | null;
};

const actionTone: Record<string, Tone> = {
  insert: "success",
  update: "accent",
  delete: "danger",
};

// What actually changed, in one line — falls back to just the new value
// when there's no old value to diff against (row creation, or an older
// entry from before diffs were captured).
function changeSummary(entry: Entry): string {
  const meta = entry.metadata;
  if (!meta) return "—";
  if (entry.resource_type === "licenses") {
    const parts: string[] = [];
    if (meta.plan) {
      parts.push(
        meta.old_plan && meta.old_plan !== meta.plan
          ? `${meta.old_plan} → ${meta.plan}`
          : meta.plan,
      );
    }
    if (meta.status) {
      parts.push(
        meta.old_status && meta.old_status !== meta.status
          ? `${meta.old_status} → ${meta.status}`
          : meta.status,
      );
    }
    if (meta.billing_cadence) parts.push(meta.billing_cadence);
    return parts.join(" · ") || "—";
  }
  if (entry.resource_type === "tenants") {
    return meta.old_status && meta.old_status !== meta.status
      ? `${meta.old_status} → ${meta.status}`
      : (meta.status ?? "—");
  }
  return "—";
}

function PlatformAuditLog() {
  const loadLog = useServerFn(listPlatformAuditLog);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void loadLog()
      .then((rows) => setEntries(rows as unknown as Entry[]))
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Failed to load the audit log."),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client-side filter over the already-loaded 200 rows (same approach as
  // the cases/clients list filters) — matches tenant, actor, action,
  // resource type or the rendered change summary, so "cancelled" or an
  // advocate's email both find what you'd expect.
  const needle = query.trim().toLowerCase();
  const filteredEntries = useMemo(() => {
    if (!needle) return entries;
    return entries.filter((entry) => {
      const haystack = [
        entry.tenants?.name,
        entry.metadata?.name,
        entry.actor_email,
        entry.action,
        entry.resource_type,
        changeSummary(entry),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [entries, needle]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <ScrollText className="size-5 text-primary" />
        <h1 className="font-display text-xl font-bold">Audit log</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every tenant status and plan change across every chamber — who did it, when, and what it
        changed from/to.
      </p>

      <label className="relative mt-5 block max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tenant, actor, action, change…"
          className="w-full rounded border border-input bg-background py-2 pr-3 pl-9 text-sm"
        />
      </label>

      {error ? (
        <p className="mt-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tenant or plan changes recorded yet.</p>
        ) : filteredEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries match "{query.trim()}".</p>
        ) : (
          <DataTable headers={["When", "Tenant", "Action", "Resource", "Change", "Actor"]}>
            {filteredEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-secondary/40">
                <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 font-medium">
                  {entry.tenants?.name ?? entry.metadata?.name ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <Tag tone={actionTone[entry.action] ?? "neutral"}>{entry.action}</Tag>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {entry.resource_type}
                </td>
                <td className="px-4 py-3 text-sm">{changeSummary(entry)}</td>
                <td className="px-4 py-3 text-sm">{entry.actor_email ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
