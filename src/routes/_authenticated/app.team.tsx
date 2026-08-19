import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, MessageCircle, Plus, Users, X } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { DataTable, Tag, type Tone } from "@/components/app/primitives";
import {
  createInvite,
  getUsageSummary,
  listInvites,
  listTeamMembers,
  revokeInvite,
} from "@/lib/team.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => ({
    meta: [
      { title: "Team — Wakilio" },
      { name: "description", content: "Manage who has access to your chamber's account." },
    ],
  }),
  component: Team,
});

type Member = { id: string; full_name: string | null; tenant_role: string; created_at: string };
type Invite = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  token?: string;
};
type Usage = {
  plan: string;
  used_storage_mb: number;
  storage_limit_mb: number | null;
  seats_used: number;
  seats_limit: number;
};

const inviteStatusTone: Record<string, Tone> = {
  pending: "warning",
  accepted: "success",
  revoked: "neutral",
  expired: "danger",
};

function Team() {
  const loadMembers = useServerFn(listTeamMembers);
  const loadInvites = useServerFn(listInvites);
  const addInvite = useServerFn(createInvite);
  const cancelInvite = useServerFn(revokeInvite);
  const loadUsage = useServerFn(getUsageSummary);

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [m, i, u] = await Promise.all([loadMembers(), loadInvites(), loadUsage()]);
      setMembers(m as Member[]);
      setInvites(i as Invite[]);
      setUsage(u as Usage | null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load team data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    void supabase
      .from("licenses")
      .select("integrations")
      .maybeSingle()
      .then(({ data }) => {
        const integrations = data?.integrations as { whatsapp_enabled?: boolean } | undefined;
        setWhatsappEnabled(integrations?.whatsapp_enabled ?? false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    setLastInviteLink(null);
    try {
      const invite = (await addInvite({ data: { email: inviteEmail.trim(), role: inviteRole } })) as Invite;
      setInviteEmail("");
      if (invite.token) {
        setLastInviteLink(`${window.location.origin}/invite/${invite.token}`);
      }
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to send invite.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(id: string) {
    setError(null);
    try {
      await cancelInvite({ data: { id } });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to revoke invite.");
    }
  }

  return (
    <AppShell title="Team" subtitle="Manage who has access to your chamber's account">
      {error ? (
        <p className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Users className="size-4" />
            Members
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <DataTable headers={["Name", "Role", "Joined"]}>
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium">{member.full_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Tag tone={member.tenant_role === "member" ? "neutral" : "accent"}>
                      {member.tenant_role}
                    </Tag>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(member.created_at).toLocaleDateString("en-IN")}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}

          <form
            onSubmit={handleInvite}
            className="surface-panel mt-6 mb-4 flex flex-wrap items-end gap-3 rounded p-4"
          >
            <label className="flex-1 text-sm">
              <span className="text-eyebrow">Invite by email</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="junior@example.com"
                className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="text-eyebrow">Role</span>
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}
                className="mt-1.5 rounded border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
            >
              {inviting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Send invite
            </button>
          </form>

          {lastInviteLink ? (
            <p className="mb-4 rounded border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
              Invite created. There's no email delivery set up yet, so share this link directly:{" "}
              <span className="font-mono text-xs break-all">{lastInviteLink}</span>
            </p>
          ) : null}

          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Mail className="size-4" />
            Pending &amp; past invites
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invites sent yet.</p>
          ) : (
            <DataTable headers={["Email", "Role", "Status", "Sent", ""]}>
              {invites.map((invite) => (
                <tr key={invite.id} className="hover:bg-secondary/40">
                  <td className="px-4 py-3">{invite.email}</td>
                  <td className="px-4 py-3">
                    <Tag tone="neutral">{invite.role}</Tag>
                  </td>
                  <td className="px-4 py-3">
                    <Tag tone={inviteStatusTone[invite.status] ?? "neutral"}>{invite.status}</Tag>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(invite.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {invite.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => void handleRevoke(invite.id)}
                        className="flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
                      >
                        <X className="size-3.5" />
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>

        <aside className="space-y-4">
          <section className="surface-panel rounded p-5">
            <h2 className="font-display text-sm font-bold">Plan &amp; usage</h2>
            {usage ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-medium capitalize">{usage.plan}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Seats</dt>
                  <dd className="font-medium">
                    {usage.seats_used} / {usage.seats_limit}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Storage (estimate)</dt>
                  <dd className="font-medium">
                    {usage.used_storage_mb} MB
                    {usage.storage_limit_mb !== null ? ` / ${usage.storage_limit_mb} MB` : " / unlimited"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Storage is an estimate based on stored text (documents and drafts) — this platform
              does not store uploaded files.
            </p>
          </section>

          <section className="surface-panel rounded p-5">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold">
              <MessageCircle className="size-4" />
              WhatsApp integration
            </h2>
            <p className="mt-2 text-sm">
              {whatsappEnabled ? (
                <Tag tone="success">Enabled by your admin</Tag>
              ) : (
                <Tag tone="neutral">Not enabled</Tag>
              )}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {whatsappEnabled
                ? "This is a licensing entitlement only — no WhatsApp Business API provider is connected yet, so no messages can be sent."
                : "Contact the platform admin to enable WhatsApp for your chamber's plan."}
            </p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
