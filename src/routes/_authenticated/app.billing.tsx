import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { DataTable, StatCard, Tag, type Tone } from "@/components/app/primitives";
// Calls the Billing microservice (services/billing/) directly from the
// browser — not a TanStack server function, so no useServerFn wrapping.
import {
  createInvoice,
  createTimeEntry,
  listInvoices,
  listTimeEntries,
  updateInvoiceStatus,
} from "@/lib/billing-service";
import { friendlyErrorMessage } from "@/lib/friendly-error";
import { FieldError, invalidClass, Req } from "@/components/app/form-fields";
import { cn } from "@/lib/utils";
import {
  collectErrors,
  hasErrors,
  LIMITS,
  numberError,
  optionalText,
  requiredText,
  type FieldErrors,
} from "@/lib/validation";

type EntryField = "matterTitle" | "task" | "hours" | "rate";
type InvoiceField = "invoiceNumber" | "clientName" | "matterTitle" | "amount" | "gstAmount";

const INPUT = "mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm";
// Sanity ceilings, not business rules: they catch a stray extra zero.
const MAX_RATE_INR = 100000;
const MAX_INVOICE_INR = 10000000;

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({
    meta: [
      { title: "Time & billing — LexDiary" },
      {
        name: "description",
        content: "Billable time entries and invoices for your chamber, tracked manually.",
      },
      { property: "og:title", content: "Time & billing — LexDiary" },
      {
        property: "og:description",
        content: "Billable time entries and invoices for your chamber.",
      },
    ],
  }),
  component: Billing,
});

type TimeEntry = {
  id: string;
  matter_title: string;
  entry_date: string;
  task: string;
  hours: number;
  rate: number;
  billed: boolean;
  created_at: string;
};

type Invoice = {
  id: string;
  invoice_number: string;
  client_name: string;
  matter_title: string | null;
  amount: number;
  gst_amount: number;
  status: string;
  due_date: string | null;
  created_at: string;
};

const invoiceTone: Record<string, Tone> = {
  paid: "success",
  sent: "accent",
  draft: "neutral",
  overdue: "danger",
};

function rupees(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function Billing() {
  const loadTimeEntries = listTimeEntries;
  const addTimeEntry = createTimeEntry;
  const loadInvoices = listInvoices;
  const addInvoice = createInvoice;
  const setInvoiceStatus = updateInvoiceStatus;

  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entryForm, setEntryForm] = useState({ matterTitle: "", task: "", hours: "", rate: "" });
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryErrors, setEntryErrors] = useState<FieldErrors<EntryField>>({});
  const [invoiceErrors, setInvoiceErrors] = useState<FieldErrors<InvoiceField>>({});

  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: "",
    clientName: "",
    matterTitle: "",
    amount: "",
    gstAmount: "",
    dueDate: "",
  });
  const [invoiceSaving, setInvoiceSaving] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [entries, invoiceRows] = await Promise.all([loadTimeEntries(), loadInvoices()]);
      setTimeEntries(entries as TimeEntry[]);
      setInvoices(invoiceRows as Invoice[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load billing data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // reload is re-created every render; listing it here would re-fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Invoice # looked pre-filled because of its placeholder but was actually
  // empty, so the submit button silently stayed disabled until someone typed
  // into it. Give it a real starting value instead — still editable, just no
  // longer a trap.
  useEffect(() => {
    if (loading || invoiceForm.invoiceNumber) return;
    const year = new Date().getFullYear();
    setInvoiceForm((f) => ({
      ...f,
      invoiceNumber: `INV-${year}-${String(invoices.length + 1).padStart(3, "0")}`,
    }));
    // Only re-run when the invoice count changes (e.g. after adding one) —
    // invoiceForm.invoiceNumber is checked, not depended on, so typing into
    // the field doesn't retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, invoices.length]);

  async function handleAddEntry(event: React.FormEvent) {
    event.preventDefault();
    const errors = collectErrors<EntryField>({
      matterTitle: requiredText(entryForm.matterTitle, "Matter", { min: 2, max: LIMITS.title }),
      task: requiredText(entryForm.task, "Task", { min: 2, max: LIMITS.title }),
      hours: numberError(entryForm.hours, "Hours", { min: 0, max: 24, minExclusive: true }),
      rate: numberError(entryForm.rate, "Rate", { min: 0, max: MAX_RATE_INR, required: false }),
    });
    setEntryErrors(errors);
    if (hasErrors(errors)) return;
    const hours = Number(entryForm.hours);
    setEntrySaving(true);
    setError(null);
    try {
      await addTimeEntry({
        matterTitle: entryForm.matterTitle.trim(),
        task: entryForm.task.trim(),
        hours,
        rate: entryForm.rate ? Number(entryForm.rate) : undefined,
      });
      setEntryForm({ matterTitle: "", task: "", hours: "", rate: "" });
      await reload();
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Failed to add time entry."));
    } finally {
      setEntrySaving(false);
    }
  }

  async function handleAddInvoice(event: React.FormEvent) {
    event.preventDefault();
    const errors = collectErrors<InvoiceField>({
      invoiceNumber: requiredText(invoiceForm.invoiceNumber, "Invoice number", { min: 1, max: 40 }),
      clientName: requiredText(invoiceForm.clientName, "Client", { min: 2 }),
      matterTitle: optionalText(invoiceForm.matterTitle, "Matter", LIMITS.title),
      amount: numberError(invoiceForm.amount, "Amount", { min: 0, max: MAX_INVOICE_INR, minExclusive: true }),
      gstAmount:
        numberError(invoiceForm.gstAmount, "GST", { min: 0, max: MAX_INVOICE_INR, required: false }) ??
        (invoiceForm.gstAmount && Number(invoiceForm.gstAmount) > Number(invoiceForm.amount)
          ? "GST can't be more than the amount."
          : null),
    });
    setInvoiceErrors(errors);
    if (hasErrors(errors)) return;
    const amount = Number(invoiceForm.amount);
    setInvoiceSaving(true);
    setError(null);
    try {
      await addInvoice({
        invoiceNumber: invoiceForm.invoiceNumber.trim(),
        clientName: invoiceForm.clientName.trim(),
        matterTitle: invoiceForm.matterTitle.trim() || undefined,
        amount,
        gstAmount: invoiceForm.gstAmount ? Number(invoiceForm.gstAmount) : undefined,
        dueDate: invoiceForm.dueDate || undefined,
      });
      setInvoiceForm({
        invoiceNumber: "",
        clientName: "",
        matterTitle: "",
        amount: "",
        gstAmount: "",
        dueDate: "",
      });
      await reload();
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Failed to add invoice."));
    } finally {
      setInvoiceSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: Invoice["status"]) {
    setError(null);
    try {
      await setInvoiceStatus({ id, status: status as "draft" | "sent" | "paid" | "overdue" });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update invoice.");
    }
  }

  const stats = useMemo(() => {
    const billed = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    const collected = invoices
      .filter((inv) => inv.status === "paid")
      .reduce((sum, inv) => sum + inv.amount, 0);
    const overdue = invoices
      .filter((inv) => inv.status === "overdue")
      .reduce((sum, inv) => sum + inv.amount, 0);
    const unbilledValue = timeEntries
      .filter((e) => !e.billed)
      .reduce((sum, e) => sum + e.hours * e.rate, 0);
    const unbilledHours = timeEntries.filter((e) => !e.billed).reduce((sum, e) => sum + e.hours, 0);
    return { billed, collected, overdue, unbilledValue, unbilledHours };
  }, [invoices, timeEntries]);

  return (
    <AppShell
      title="Time & billing"
      subtitle={loading ? "Loading…" : "Manually tracked — no payment gateway wired up yet"}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <StatCard
          label="Total invoiced"
          value={rupees(stats.billed)}
          note={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Work in progress"
          value={rupees(stats.unbilledValue)}
          note={`${stats.unbilledHours.toFixed(1)} unbilled hours`}
        />
        <StatCard label="Collected" value={rupees(stats.collected)} note="Marked paid" />
        <StatCard label="Overdue" value={rupees(stats.overdue)} note="Marked overdue" />
      </div>

      {error ? (
        <p className="mt-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <h2 className="mt-8 mb-3 font-display text-lg font-bold">Invoices</h2>
      <form
        onSubmit={handleAddInvoice}
        noValidate
        className="surface-panel mb-4 grid gap-3 rounded p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="text-sm">
          <span className="text-eyebrow">
            Invoice #
            <Req />
          </span>
          <input
            value={invoiceForm.invoiceNumber}
            onChange={(event) =>
              setInvoiceForm((f) => ({ ...f, invoiceNumber: event.target.value }))
            }
            placeholder="INV-2026-001"
            required
            maxLength={40}
            aria-invalid={invoiceErrors.invoiceNumber ? true : undefined}
            className={cn(INPUT, invalidClass(invoiceErrors.invoiceNumber))}
          />
          <FieldError message={invoiceErrors.invoiceNumber} />
        </label>
        <label className="text-sm">
          <span className="text-eyebrow">
            Client
            <Req />
          </span>
          <input
            value={invoiceForm.clientName}
            onChange={(event) => setInvoiceForm((f) => ({ ...f, clientName: event.target.value }))}
            required
            maxLength={LIMITS.shortText}
            aria-invalid={invoiceErrors.clientName ? true : undefined}
            className={cn(INPUT, invalidClass(invoiceErrors.clientName))}
          />
          <FieldError message={invoiceErrors.clientName} />
        </label>
        <label className="text-sm">
          <span className="text-eyebrow">Matter</span>
          <input
            value={invoiceForm.matterTitle}
            onChange={(event) => setInvoiceForm((f) => ({ ...f, matterTitle: event.target.value }))}
            maxLength={LIMITS.title}
            className={cn(INPUT, invalidClass(invoiceErrors.matterTitle))}
          />
          <FieldError message={invoiceErrors.matterTitle} />
        </label>
        <label className="text-sm">
          <span className="text-eyebrow">
            Amount (₹)
            <Req />
          </span>
          <input
            type="number"
            min="1"
            max={MAX_INVOICE_INR}
            step="0.01"
            inputMode="decimal"
            value={invoiceForm.amount}
            onChange={(event) => setInvoiceForm((f) => ({ ...f, amount: event.target.value }))}
            required
            aria-invalid={invoiceErrors.amount ? true : undefined}
            className={cn(INPUT, invalidClass(invoiceErrors.amount))}
          />
          <FieldError message={invoiceErrors.amount} />
        </label>
        <label className="text-sm">
          <span className="text-eyebrow">GST (₹)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={invoiceForm.gstAmount}
            onChange={(event) => setInvoiceForm((f) => ({ ...f, gstAmount: event.target.value }))}
            aria-invalid={invoiceErrors.gstAmount ? true : undefined}
            className={cn(INPUT, invalidClass(invoiceErrors.gstAmount))}
          />
          <FieldError message={invoiceErrors.gstAmount} />
        </label>
        <label className="text-sm">
          <span className="text-eyebrow">Due date</span>
          <input
            type="date"
            value={invoiceForm.dueDate}
            onChange={(event) => setInvoiceForm((f) => ({ ...f, dueDate: event.target.value }))}
            className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-6">
          <button
            type="submit"
            disabled={invoiceSaving}
            className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
          >
            {invoiceSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add invoice
          </button>
          <span className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> required
          </span>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet — add your first one above.</p>
      ) : (
        <DataTable headers={["Invoice", "Client", "Matter", "Amount", "GST", "Status", "Due"]}>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="hover:bg-secondary/40">
              <td className="px-4 py-3 font-mono text-xs">{invoice.invoice_number}</td>
              <td className="px-4 py-3 font-medium">{invoice.client_name}</td>
              <td className="px-4 py-3 font-mono text-xs">{invoice.matter_title ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">{rupees(invoice.amount)}</td>
              <td className="px-4 py-3 text-muted-foreground">{rupees(invoice.gst_amount)}</td>
              <td className="px-4 py-3">
                <select
                  value={invoice.status}
                  onChange={(event) =>
                    handleStatusChange(invoice.id, event.target.value as Invoice["status"])
                  }
                  className="rounded border border-input bg-background px-2 py-1 text-xs"
                >
                  <option value="draft">draft</option>
                  <option value="sent">sent</option>
                  <option value="paid">paid</option>
                  <option value="overdue">overdue</option>
                </select>
                <span className="ml-2">
                  <Tag tone={invoiceTone[invoice.status] ?? "neutral"}>{invoice.status}</Tag>
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{invoice.due_date ?? "—"}</td>
            </tr>
          ))}
        </DataTable>
      )}

      <h2 className="mt-8 mb-3 font-display text-lg font-bold">Time entries</h2>
      <form
        onSubmit={handleAddEntry}
        noValidate
        className="surface-panel mb-4 grid gap-3 rounded p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="text-sm sm:col-span-2">
          <span className="text-eyebrow">
            Matter
            <Req />
          </span>
          <input
            value={entryForm.matterTitle}
            onChange={(event) => setEntryForm((f) => ({ ...f, matterTitle: event.target.value }))}
            required
            maxLength={LIMITS.title}
            aria-invalid={entryErrors.matterTitle ? true : undefined}
            className={cn(INPUT, invalidClass(entryErrors.matterTitle))}
          />
          <FieldError message={entryErrors.matterTitle} />
        </label>
        <label className="text-sm">
          <span className="text-eyebrow">
            Task
            <Req />
          </span>
          <input
            value={entryForm.task}
            onChange={(event) => setEntryForm((f) => ({ ...f, task: event.target.value }))}
            required
            maxLength={LIMITS.title}
            aria-invalid={entryErrors.task ? true : undefined}
            className={cn(INPUT, invalidClass(entryErrors.task))}
          />
          <FieldError message={entryErrors.task} />
        </label>
        <label className="text-sm">
          <span className="text-eyebrow">
            Hours
            <Req />
          </span>
          <input
            type="number"
            min="0.25"
            max="24"
            step="0.25"
            inputMode="decimal"
            value={entryForm.hours}
            onChange={(event) => setEntryForm((f) => ({ ...f, hours: event.target.value }))}
            required
            aria-invalid={entryErrors.hours ? true : undefined}
            className={cn(INPUT, invalidClass(entryErrors.hours))}
          />
          <FieldError message={entryErrors.hours} />
        </label>
        <label className="text-sm">
          <span className="text-eyebrow">Rate (₹/hr)</span>
          <input
            type="number"
            min="0"
            max={MAX_RATE_INR}
            inputMode="decimal"
            value={entryForm.rate}
            onChange={(event) => setEntryForm((f) => ({ ...f, rate: event.target.value }))}
            aria-invalid={entryErrors.rate ? true : undefined}
            className={cn(INPUT, invalidClass(entryErrors.rate))}
          />
          <FieldError message={entryErrors.rate} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
          <button
            type="submit"
            disabled={entrySaving}
            className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
          >
            {entrySaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Log time
          </button>
          <span className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> required
          </span>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading time entries…</p>
      ) : timeEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No time entries yet — log your first one above.
        </p>
      ) : (
        <DataTable headers={["Date", "Matter", "Task", "Hours", "Rate", "Value"]}>
          {timeEntries.map((entry) => (
            <tr key={entry.id} className="hover:bg-secondary/40">
              <td className="px-4 py-3 whitespace-nowrap">{entry.entry_date}</td>
              <td className="px-4 py-3 font-mono text-xs">{entry.matter_title}</td>
              <td className="px-4 py-3">{entry.task}</td>
              <td className="px-4 py-3 tabular-nums">{entry.hours}</td>
              <td className="px-4 py-3 text-muted-foreground">{rupees(entry.rate)}</td>
              <td className="px-4 py-3 font-medium tabular-nums">
                {rupees(entry.hours * entry.rate)}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </AppShell>
  );
}
