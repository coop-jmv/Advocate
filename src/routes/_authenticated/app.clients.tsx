import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { DataTable } from "@/components/app/primitives";
import { FieldError, invalidClass, MobileInput, Req } from "@/components/app/form-fields";
// Calls the Clients microservice (services/clients/) directly from the
// browser — not a TanStack server function, so no useServerFn wrapping.
// See src/lib/clients-service.ts for why.
import { createClient, deleteClient, listClients, updateClient } from "@/lib/clients-service";
import { getMyMembership } from "@/lib/team.functions";
import { confirmPermanentRemoval } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import {
  collectErrors,
  emailError,
  hasErrors,
  joinName,
  LIMITS,
  mobileError,
  mobileForInput,
  namePartError,
  optionalText,
  splitName,
  toE164Mobile,
  type FieldErrors,
} from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/app/clients")({
  head: () => ({
    meta: [
      { title: "Clients — LexDiary" },
      { name: "description", content: "Client register for your chamber." },
      { property: "og:title", content: "Clients — LexDiary" },
      { property: "og:description", content: "Client register for your chamber." },
    ],
  }),
  component: Clients,
});

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
};

type ClientField = "firstName" | "lastName" | "phone" | "email" | "notes";
type ClientForm = Record<ClientField, string>;

const EMPTY_FORM: ClientForm = { firstName: "", lastName: "", phone: "", email: "", notes: "" };

function validateClient(form: ClientForm): FieldErrors<ClientField> {
  return collectErrors<ClientField>({
    firstName: namePartError(form.firstName, "First name"),
    lastName: namePartError(form.lastName, "Surname"),
    phone: mobileError(form.phone),
    email: emailError(form.email),
    notes: optionalText(form.notes, "Notes", LIMITS.notes),
  });
}

function toPayload(form: ClientForm) {
  return {
    name: joinName(form.firstName, form.lastName),
    phone: toE164Mobile(form.phone),
    email: form.email.trim(),
    notes: form.notes.trim() || undefined,
  };
}

function formFromRow(client: ClientRow): ClientForm {
  const { first, last } = splitName(client.name);
  return {
    firstName: first,
    lastName: last,
    phone: mobileForInput(client.phone),
    email: client.email ?? "",
    notes: client.notes ?? "",
  };
}

const INPUT = "mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm";

function ClientFields({
  form,
  errors,
  onChange,
}: {
  form: ClientForm;
  errors: FieldErrors<ClientField>;
  onChange: (patch: Partial<ClientForm>) => void;
}) {
  return (
    <>
      <label className="text-sm">
        <span className="text-eyebrow">
          First name
          <Req />
        </span>
        <input
          value={form.firstName}
          onChange={(event) => onChange({ firstName: event.target.value })}
          required
          maxLength={LIMITS.namePart}
          aria-invalid={errors.firstName ? true : undefined}
          placeholder="Rakesh"
          className={cn(INPUT, invalidClass(errors.firstName))}
        />
        <FieldError message={errors.firstName} />
      </label>
      <label className="text-sm">
        <span className="text-eyebrow">
          Surname
          <Req />
        </span>
        <input
          value={form.lastName}
          onChange={(event) => onChange({ lastName: event.target.value })}
          required
          maxLength={LIMITS.namePart}
          aria-invalid={errors.lastName ? true : undefined}
          placeholder="Malhotra"
          className={cn(INPUT, invalidClass(errors.lastName))}
        />
        <FieldError message={errors.lastName} />
      </label>
      <label className="text-sm">
        <span className="text-eyebrow">
          Mobile
          <Req />
        </span>
        <MobileInput
          value={form.phone}
          onChange={(phone) => onChange({ phone })}
          error={errors.phone}
          className="mt-1.5"
        />
        <FieldError message={errors.phone} />
      </label>
      <label className="text-sm">
        <span className="text-eyebrow">
          Email
          <Req />
        </span>
        <input
          type="email"
          value={form.email}
          onChange={(event) => onChange({ email: event.target.value })}
          required
          maxLength={LIMITS.email}
          aria-invalid={errors.email ? true : undefined}
          placeholder="rakesh@example.com"
          className={cn(INPUT, invalidClass(errors.email))}
        />
        <FieldError message={errors.email} />
      </label>
      <label className="text-sm sm:col-span-2 lg:col-span-4">
        <span className="text-eyebrow">Notes</span>
        <input
          value={form.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          maxLength={LIMITS.notes}
          placeholder="Optional"
          className={cn(INPUT, invalidClass(errors.notes))}
        />
        <FieldError message={errors.notes} />
      </label>
    </>
  );
}

function Clients() {
  // listClients/createClient/updateClient/deleteClient are plain fetch()
  // calls to the Clients service, not TanStack server functions — no
  // useServerFn wrapping for those. getMyMembership still is one.
  const loadClients = listClients;
  const addClient = createClient;
  const saveClient = updateClient;
  const removeClient = deleteClient;
  const loadMembership = useServerFn(getMyMembership);

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FieldErrors<ClientField>>({});
  const [filterText, setFilterText] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") || "",
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ClientForm>(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<FieldErrors<ClientField>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setClients((await loadClients()) as ClientRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load clients.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    void loadMembership().then((membership) => {
      setIsAdmin(membership?.tenant_role === "owner" || membership?.tenant_role === "admin");
    });
    // reload/loadMembership are re-created every render; listing them here
    // would re-fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEditing(client: ClientRow) {
    setEditingId(client.id);
    const next = formFromRow(client);
    setEditForm(next);
    // Older records may lack a surname, mobile or email; show what's missing
    // straight away rather than on the first save attempt.
    setEditErrors(validateClient(next));
    setError(null);
  }

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    const errors = validateClient(editForm);
    setEditErrors(errors);
    if (hasErrors(errors)) return;
    setSavingEdit(true);
    setError(null);
    try {
      await saveClient({ clientId: editingId, ...toPayload(editForm) });
      setEditingId(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save this client.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteClient(client: ClientRow) {
    if (!confirmPermanentRemoval(`"${client.name}"`)) return;
    setError(null);
    try {
      await removeClient({ clientId: client.id });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete this client.");
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const errors = validateClient(form);
    setFormErrors(errors);
    if (hasErrors(errors)) return;
    setCreating(true);
    setError(null);
    try {
      await addClient(toPayload(form));
      setForm(EMPTY_FORM);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create client.");
    } finally {
      setCreating(false);
    }
  }

  const needle = filterText.trim().toLowerCase();
  const filteredClients = needle
    ? clients.filter((c) =>
        [c.name, c.phone, c.email]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(needle)),
      )
    : clients;

  return (
    <AppShell
      title="Clients"
      subtitle={
        loading
          ? "Loading…"
          : `${clients.length} client${clients.length === 1 ? "" : "s"} in your chamber`
      }
    >
      <form
        onSubmit={handleCreate}
        noValidate
        className="surface-panel mb-6 grid gap-3 rounded p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <ClientFields
          form={form}
          errors={formErrors}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        />
        <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add client
          </button>
          <span className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> required
          </span>
        </div>
      </form>

      {error ? (
        <p className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!loading && clients.length > 0 ? (
        <input
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          placeholder="Filter by name, phone or email"
          className="mb-4 w-full max-w-md rounded border border-input bg-background px-3 py-2 text-sm"
        />
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading clients…</p>
      ) : clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients yet — add your first one above.</p>
      ) : filteredClients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients match "{filterText.trim()}".</p>
      ) : (
        <DataTable headers={["Client", "Phone", "Email", "Notes", ""]}>
          {filteredClients.map((client) =>
            editingId === client.id ? (
              <tr key={client.id}>
                <td colSpan={5} className="px-4 py-3">
                  <form
                    onSubmit={handleSaveEdit}
                    noValidate
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <ClientFields
                      form={editForm}
                      errors={editErrors}
                      onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
                    />
                    <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="flex items-center gap-2 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
                      >
                        {savingEdit ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={savingEdit}
                        className="rounded border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={client.id} className="hover:bg-secondary/40">
                <td className="px-4 py-3 font-medium">{client.name}</td>
                <td className="px-4 py-3 whitespace-nowrap">{client.phone ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{client.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{client.notes ?? "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => startEditing(client)}
                    title="Edit"
                    aria-label="Edit"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => void handleDeleteClient(client)}
                      title="Delete"
                      aria-label="Delete"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ),
          )}
        </DataTable>
      )}
    </AppShell>
  );
}
