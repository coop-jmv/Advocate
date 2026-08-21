import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-secondary text-secondary-foreground",
  accent: "bg-accent/12 text-accent",
  success: "bg-success/12 text-success",
  warning: "bg-warning/18 text-warning-foreground",
  danger: "bg-destructive/10 text-destructive",
} as const;

export type Tone = keyof typeof tones;

export function Tag({
  tone = "neutral",
  children,
}: {
  tone?: Tone | undefined;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="surface-panel overflow-x-auto rounded">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/50 text-left">
            {headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase whitespace-nowrap"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

// Accent for the Dashboard's stat tiles: a colored top rule and tinted
// label, reusing the docket-* jewel tones at every screen size. Every other
// page that renders a StatCard (cause-list, billing, CourtMorningBrief)
// never passes `tone`, so they keep the plain Navy Trust look.
const statCardTones = {
  sapphire: { rule: "bg-docket-sapphire", label: "text-docket-sapphire" },
  amber: { rule: "bg-docket-amber", label: "text-docket-amber" },
  teal: { rule: "bg-docket-teal", label: "text-docket-teal" },
  rose: { rule: "bg-docket-rose", label: "text-docket-rose" },
} as const;

export function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: keyof typeof statCardTones;
}) {
  const toneClasses = tone ? statCardTones[tone] : null;
  return (
    <div className="surface-panel relative overflow-hidden rounded p-5">
      {toneClasses ? (
        <span className={cn("absolute inset-x-0 top-0 h-1", toneClasses.rule)} />
      ) : null}
      <p className={cn("text-eyebrow", toneClasses ? toneClasses.label : "text-muted-foreground")}>
        {label}
      </p>
      <p className="mt-3 font-display text-2xl font-bold">{value}</p>
      {note ? (
        <p
          className={cn(
            "mt-1 text-xs",
            toneClasses ? "text-foreground/70" : "text-muted-foreground",
          )}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
