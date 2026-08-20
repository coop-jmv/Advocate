import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { confirmDestructive } from "@/lib/confirm";
import { DataTable, Tag, type Tone } from "@/components/app/primitives";

export const Route = createFileRoute("/_admin/admin/cause-list-sources")({
  head: () => ({ meta: [{ title: "Cause list sources — Platform admin" }] }),
  component: AdminCauseListSources,
});

type Source = {
  id: string;
  court: string;
  bench: string | null;
  list_type: string;
  source_type: string;
  enabled: boolean;
  last_sync_at: string | null;
  sync_status: string;
  error_message: string | null;
  tenants: { name: string } | null;
};

const syncStatusTone: Record<string, Tone> = {
  never_run: "neutral",
  success: "success",
  failed: "danger",
  partial: "warning",
};

async function fetchSources(): Promise<Source[]> {
  const { data, error } = await supabase
    .from("cause_list_sources")
    .select(
      "id, court, bench, list_type, source_type, enabled, last_sync_at, sync_status, error_message, tenants(name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Source[];
}

function AdminCauseListSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setSources(await fetchSources());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load cause-list sources.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  // Enabling is safe to do without a prompt; disabling actively blocks a
  // chamber from importing that source going forward, so it gets the same
  // confirmation-gate every other capability-removing admin action uses.
  async function handleToggle(source: Source) {
    if (source.enabled) {
      if (
        !confirmDestructive(
          `Disable "${source.court}${source.bench ? ` · ${source.bench}` : ""}" for ${source.tenants?.name ?? "this tenant"}? They won't be able to import this cause list until it's re-enabled. Listings already imported stay as they are.`,
        )
      )
        return;
    }
    setError(null);
    const { error: updateError } = await supabase
      .from("cause_list_sources")
      .update({ enabled: !source.enabled })
      .eq("id", source.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await reload();
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <ListChecks className="size-5 text-primary" />
        <h1 className="font-display text-xl font-bold">Cause list sources</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every court/bench any chamber tracks, across every tenant. No live court integration is
        connected — every source here is <code>manual_import</code>: a tenant pastes in a list they
        already have. "Last import" is always the last successful paste, never a claim of live
        synchronization.
      </p>

      {error ? (
        <p className="mt-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cause-list sources have been added yet.
          </p>
        ) : (
          <DataTable
            headers={["Tenant", "Court / bench", "Type", "Last import", "Status", "Enabled"]}
          >
            {sources.map((source) => (
              <tr key={source.id} className="hover:bg-secondary/40">
                <td className="px-4 py-3 font-medium">{source.tenants?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  {source.court}
                  {source.bench ? ` · ${source.bench}` : ""}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {source.source_type}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {source.last_sync_at
                    ? new Date(source.last_sync_at).toLocaleString("en-IN")
                    : "Never"}
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <Tag tone={syncStatusTone[source.sync_status] ?? "neutral"}>
                      {source.sync_status.replace("_", " ")}
                    </Tag>
                    {source.error_message ? (
                      <p className="max-w-xs text-xs text-muted-foreground">
                        {source.error_message}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={() => void handleToggle(source)}
                      className="size-4 rounded border-input"
                    />
                    {source.enabled ? "Enabled" : "Disabled"}
                  </label>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
