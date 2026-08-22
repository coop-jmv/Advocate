import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, Tag, type Tone } from "@/components/app/primitives";

export const Route = createFileRoute("/_admin/admin/contact-requests")({
  head: () => ({ meta: [{ title: "Contact requests — Platform admin" }] }),
  component: AdminContactRequests,
});

type ContactRequest = {
  id: string;
  full_name: string;
  enrolment_no: string | null;
  email: string;
  phone: string;
  court: string | null;
  note: string | null;
  status: "new" | "contacted" | "closed";
  created_at: string;
};

const statusTone: Record<ContactRequest["status"], Tone> = {
  new: "warning",
  contacted: "accent",
  closed: "success",
};

async function fetchRequests(): Promise<ContactRequest[]> {
  const { data, error } = await supabase
    .from("contact_requests")
    .select("id, full_name, enrolment_no, email, phone, court, note, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContactRequest[];
}

function AdminContactRequests() {
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setRequests(await fetchRequests());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load contact requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleStatusChange(request: ContactRequest, status: ContactRequest["status"]) {
    setError(null);
    const { error: updateError } = await supabase
      .from("contact_requests")
      .update({ status })
      .eq("id", request.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await reload();
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Inbox className="size-5 text-primary" />
        <h1 className="font-display text-xl font-bold">Contact requests</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every "Request access" submission from the public site's <code>/contact</code> page, across
        every prospective chamber — this is the only place these land, so this is where follow-up
        happens.
      </p>

      {error ? (
        <p className="mt-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <DataTable headers={["Received", "Name", "Contact", "Court", "Note", "Status"]}>
            {requests.map((request) => (
              <tr key={request.id} className="hover:bg-secondary/40">
                <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(request.created_at).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 font-medium">
                  {request.full_name}
                  {request.enrolment_no ? (
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {request.enrolment_no}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">
                  <p>{request.email}</p>
                  <p className="text-muted-foreground">{request.phone}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{request.court ?? "—"}</td>
                <td className="px-4 py-3 max-w-xs text-xs text-muted-foreground">
                  {request.note ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={request.status}
                    onChange={(event) =>
                      void handleStatusChange(
                        request,
                        event.target.value as ContactRequest["status"],
                      )
                    }
                    className="rounded border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="closed">Closed</option>
                  </select>
                  <div className="mt-1">
                    <Tag tone={statusTone[request.status]}>{request.status}</Tag>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
