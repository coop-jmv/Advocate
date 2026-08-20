import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/app/primitives";

export const Route = createFileRoute("/_admin/admin/settings/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Platform admin" }] }),
  component: AdminIntegrations,
});

type TenantIntegrations = {
  id: string;
  name: string;
  integrations: { whatsapp_enabled?: boolean } | null;
};

async function fetchTenantIntegrations(): Promise<TenantIntegrations[]> {
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;

  const { data: licenses } = await supabase.from("licenses").select("tenant_id, integrations");
  const integrationsByTenant = new Map(
    (licenses ?? []).map((l) => [l.tenant_id, l.integrations as { whatsapp_enabled?: boolean }]),
  );

  return (tenants ?? []).map((t) => ({
    ...t,
    integrations: integrationsByTenant.get(t.id) ?? null,
  }));
}

function AdminIntegrations() {
  const [rows, setRows] = useState<TenantIntegrations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchTenantIntegrations());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load integrations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function toggleWhatsapp(tenantId: string, enabled: boolean) {
    setError(null);
    const { error: updateError } = await supabase
      .from("licenses")
      .update({ integrations: { whatsapp_enabled: enabled } })
      .eq("tenant_id", tenantId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await reload();
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <MessageCircle className="size-5 text-primary" />
        <h1 className="font-display text-xl font-bold">Integrations</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Per-tenant integration entitlements. Toggling WhatsApp on here gates the WhatsApp section in
        that chamber's app — it does not connect a real WhatsApp Business API provider. No message
        can actually be sent until a provider (Meta Cloud API, Twilio, Gupshup, etc.) and its
        credentials are wired in separately.
      </p>

      {error ? (
        <p className="mt-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tenants yet.</p>
        ) : (
          <DataTable headers={["Tenant", "WhatsApp API"]}>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-secondary/40">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.integrations?.whatsapp_enabled ?? false}
                      onChange={(event) => void toggleWhatsapp(row.id, event.target.checked)}
                      className="size-4 rounded border-input"
                    />
                    {row.integrations?.whatsapp_enabled ? "Enabled" : "Disabled"}
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
