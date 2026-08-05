import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, Tag, type Tone } from "@/components/app/primitives";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_admin/admin/")({
  head: () => ({ meta: [{ title: "Tenants — Platform admin" }] }),
  component: AdminTenants,
});

type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
type License = Database["public"]["Tables"]["licenses"]["Row"];
type TenantWithLicense = Tenant & { license: License | null };

const statusTone: Record<string, Tone> = {
  active: "success",
  suspended: "warning",
  cancelled: "danger",
  trialing: "accent",
  past_due: "warning",
};

async function fetchTenants(): Promise<TenantWithLicense[]> {
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: licenses } = await supabase.from("licenses").select("*");
  const licenseByTenant = new Map((licenses ?? []).map((license) => [license.tenant_id, license]));

  return (tenants ?? []).map((tenant) => ({
    ...tenant,
    license: licenseByTenant.get(tenant.id) ?? null,
  }));
}

function AdminTenants() {
  const [tenants, setTenants] = useState<TenantWithLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setTenants(await fetchTenants());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load tenants.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const slug =
        newName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-") +
        "-" +
        Math.random().toString(36).slice(2, 8);
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({ name: newName.trim(), slug })
        .select()
        .single();
      if (tenantError) throw tenantError;
      const { error: licenseError } = await supabase
        .from("licenses")
        .insert({ tenant_id: tenant.id, plan: "trial", status: "trialing" });
      if (licenseError) throw licenseError;
      setNewName("");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create tenant.");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(tenantId: string, status: Tenant["status"]) {
    setError(null);
    const { error: updateError } = await supabase
      .from("tenants")
      .update({ status })
      .eq("id", tenantId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await reload();
  }

  async function handlePlanChange(licenseId: string, plan: License["plan"]) {
    setError(null);
    const { error: updateError } = await supabase
      .from("licenses")
      .update({ plan })
      .eq("id", licenseId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await reload();
  }

  async function handleDelete(tenantId: string) {
    if (!window.confirm("Delete this tenant and its license? This cannot be undone.")) return;
    setError(null);
    const { error: deleteError } = await supabase.from("tenants").delete().eq("id", tenantId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Tenants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage chambers/firms, their license plan and status.
          </p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="surface-panel mt-6 flex items-end gap-3 rounded p-4">
        <label className="flex-1 text-sm">
          <span className="text-eyebrow">New tenant name</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nair & Associates"
            className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create tenant
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading tenants…</p>
        ) : tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tenants yet.</p>
        ) : (
          <DataTable headers={["Tenant", "Slug", "Status", "Plan", "Seats", "License status", ""]}>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="hover:bg-secondary/40">
                <td className="px-4 py-3 font-medium">{tenant.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tenant.slug}</td>
                <td className="px-4 py-3">
                  <select
                    value={tenant.status}
                    onChange={(event) =>
                      handleStatusChange(tenant.id, event.target.value as Tenant["status"])
                    }
                    className="rounded border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  {tenant.license ? (
                    <select
                      value={tenant.license.plan}
                      onChange={(event) =>
                        handlePlanChange(tenant.license!.id, event.target.value as License["plan"])
                      }
                      className="rounded border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="trial">trial</option>
                      <option value="starter">starter</option>
                      <option value="pro">pro</option>
                      <option value="enterprise">enterprise</option>
                    </select>
                  ) : (
                    <span className="text-xs text-muted-foreground">no license</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{tenant.license?.seats ?? "—"}</td>
                <td className="px-4 py-3">
                  {tenant.license ? (
                    <Tag tone={statusTone[tenant.license.status] ?? "neutral"}>
                      {tenant.license.status}
                    </Tag>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(tenant.id)}
                    className="text-xs font-medium text-destructive hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
