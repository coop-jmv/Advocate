import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { DataTable, StatCard, Tag, type Tone } from "@/components/app/primitives";
import { invoices, timeEntries } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({
    meta: [
      { title: "Time & billing — Advocate Companion" },
      {
        name: "description",
        content:
          "Billable time entries, work in progress and GST-compliant invoices with UPI and Razorpay collection status.",
      },
      { property: "og:title", content: "Time & billing — Advocate Companion" },
      {
        property: "og:description",
        content: "Billable time, work in progress and GST-compliant invoices in rupees.",
      },
    ],
  }),
  component: Billing,
});

const invoiceTone: Record<string, Tone> = {
  Paid: "success",
  Sent: "accent",
  Draft: "neutral",
  Overdue: "danger",
};

function Billing() {
  return (
    <AppShell
      title="Time & billing"
      subtitle="August 2026 · GST-compliant invoicing"
      action={
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
        >
          Start timer
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Billed this month" value="₹3,28,700" note="Across 9 matters" />
        <StatCard label="Work in progress" value="₹2,41,000" note="42.5 unbilled hours" />
        <StatCard label="Collected" value="₹1,45,000" note="UPI and Razorpay" />
        <StatCard label="Overdue" value="₹71,200" note="1 invoice, 8 days late" />
      </div>

      <h2 className="mt-8 mb-3 font-display text-lg font-bold">Invoices</h2>
      <DataTable headers={["Invoice", "Client", "Matter", "Amount", "GST", "Status", "Due"]}>
        {invoices.map((invoice) => (
          <tr key={invoice.id} className="hover:bg-secondary/40">
            <td className="px-4 py-3 font-mono text-xs">{invoice.id}</td>
            <td className="px-4 py-3 font-medium">{invoice.client}</td>
            <td className="px-4 py-3 font-mono text-xs">{invoice.matter}</td>
            <td className="px-4 py-3 tabular-nums">{invoice.amount}</td>
            <td className="px-4 py-3 text-muted-foreground">{invoice.gst}</td>
            <td className="px-4 py-3">
              <Tag tone={invoiceTone[invoice.status]}>{invoice.status}</Tag>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">{invoice.due}</td>
          </tr>
        ))}
      </DataTable>

      <h2 className="mt-8 mb-3 font-display text-lg font-bold">Unbilled time</h2>
      <DataTable headers={["Date", "Matter", "Task", "Hours", "Rate", "Value"]}>
        {timeEntries.map((entry) => (
          <tr key={entry.id} className="hover:bg-secondary/40">
            <td className="px-4 py-3 whitespace-nowrap">{entry.date}</td>
            <td className="px-4 py-3 font-mono text-xs">{entry.matter}</td>
            <td className="px-4 py-3">{entry.task}</td>
            <td className="px-4 py-3 tabular-nums">{entry.hours}</td>
            <td className="px-4 py-3 text-muted-foreground">{entry.rate}</td>
            <td className="px-4 py-3 font-medium tabular-nums">{entry.value}</td>
          </tr>
        ))}
      </DataTable>
    </AppShell>
  );
}
