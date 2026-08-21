import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/AppShell";
import { SettingsTabs } from "@/components/app/SettingsTabs";
import { DataTable, Tag, type Tone } from "@/components/app/primitives";
import { listAuditLog } from "@/lib/audit.functions";

export const Route = createFileRoute("/_authenticated/app/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit log — LexDiary" },
      {
        name: "description",
        content:
          "Security-relevant activity for your chamber: logins, and every create, update and delete.",
      },
    ],
  }),
  component: AuditLog,
});

type Entry = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  actor_email: string | null;
  result: string;
  ip_address: string | null;
  created_at: string;
};

const actionTone: Record<string, Tone> = {
  insert: "success",
  update: "accent",
  delete: "danger",
  login_success: "success",
  login_failed: "danger",
  logout: "neutral",
  signup: "success",
  admin_grant: "warning",
  admin_revoke: "warning",
};

function AuditLog() {
  const loadLog = useServerFn(listAuditLog);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadLog()
      .then((rows) => setEntries(rows as Entry[]))
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Failed to load audit log."),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell
      title="Audit log"
      subtitle="Logins and every create, update or delete across your chamber — visible to owners and admins"
    >
      <SettingsTabs />
      {error ? (
        <p className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No audit events yet, or you don't have permission to view this chamber's log (owners and
          admins only).
        </p>
      ) : (
        <DataTable headers={["When", "Action", "Resource", "Actor", "Result", "IP"]}>
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-secondary/40">
              <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3">
                <Tag tone={actionTone[entry.action] ?? "neutral"}>{entry.action}</Tag>
              </td>
              <td className="px-4 py-3 font-mono text-xs">
                {entry.resource_type}
                {entry.resource_id ? ` · ${entry.resource_id.slice(0, 8)}` : ""}
              </td>
              <td className="px-4 py-3 text-sm">{entry.actor_email ?? "—"}</td>
              <td className="px-4 py-3">
                <Tag tone={entry.result === "failure" ? "danger" : "success"}>{entry.result}</Tag>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {entry.ip_address ?? "—"}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </AppShell>
  );
}
