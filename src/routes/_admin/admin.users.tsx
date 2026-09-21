import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { DataTable, Tag } from "@/components/app/primitives";
import { confirmDestructive } from "@/lib/confirm";
import { listAllUsers, resetUserMfa, type AdminUserRow } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_admin/admin/users")({
  head: () => ({ meta: [{ title: "Users — Platform admin" }] }),
  component: AdminUsers,
});

function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "Never";
}

function AdminUsers() {
  const loadUsers = useServerFn(listAllUsers);
  const resetMfa = useServerFn(resetUserMfa);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [resetting, setResetting] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await loadUsers());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReset(user: AdminUserRow) {
    if (
      !confirmDestructive(
        `Reset two-factor login for ${user.email ?? user.id}?\n\nOnly do this after confirming who is asking — e.g. a call back on the number you have on file. They will sign in with just their password and can set 2FA up again.`,
      )
    )
      return;
    setResetting(user.id);
    setError(null);
    setNotice(null);
    try {
      await resetMfa({ data: { userId: user.id } });
      setNotice(`Two-factor login reset for ${user.email ?? user.id}. Recorded in the audit log.`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset two-factor login.");
    } finally {
      setResetting(null);
    }
  }

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? users.filter((u) =>
        [u.email, u.fullName, u.chamber].some((f) => f?.toLowerCase().includes(needle)),
      )
    : users;
  const withMfa = users.filter((u) => u.mfaEnabled).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading…" : `${users.length} users · ${withMfa} with two-factor login on`}
          </p>
        </div>
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by email, name or chamber"
          className="w-full max-w-xs rounded border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {notice ? <p className="mt-4 text-sm text-success">{notice}</p> : null}
      {error ? (
        <p className="mt-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading users…
        </p>
      ) : (
        <div className="mt-6">
          <DataTable headers={["User", "Chamber", "Two-factor", "Last sign-in", ""]}>
            {shown.map((user) => (
              <tr key={user.id} className="hover:bg-secondary/40">
                <td className="px-4 py-3">
                  <p className="font-medium">{user.email ?? "—"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {user.fullName ?? "No name"}
                    {user.isPlatformAdmin ? " · platform admin" : ""}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p>{user.chamber ?? "—"}</p>
                  {user.role ? (
                    <p className="mt-0.5 text-xs text-muted-foreground capitalize">{user.role}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Tag tone={user.mfaEnabled ? "success" : "neutral"}>
                    {user.mfaEnabled ? "On" : "Off"}
                  </Tag>
                </td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">
                  {formatDate(user.lastSignInAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  {user.mfaEnabled ? (
                    <button
                      type="button"
                      onClick={() => void handleReset(user)}
                      disabled={resetting === user.id}
                      className="rounded border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                    >
                      {resetting === user.id ? "Resetting…" : "Reset 2FA"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
    </div>
  );
}
