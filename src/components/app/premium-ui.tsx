import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PREMIUM_MAX_SEATS, PREMIUM_SEAT_PRICE_INR, inr, premiumQuote } from "@/lib/premium";

/** − count + joined into one control. */
export function SeatStepper({
  value,
  onChange,
  min = 1,
  max = PREMIUM_MAX_SEATS,
  disabled = false,
  label = "users",
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
}) {
  const button =
    "flex w-10 items-center justify-center text-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="inline-flex h-10 overflow-hidden rounded border border-input bg-background">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label={`One ${label.replace(/s$/, "")} fewer`}
        className={cn(button, "border-r border-input")}
      >
        <Minus className="size-4" />
      </button>
      <output
        aria-live="polite"
        aria-label={`${value} ${label}`}
        className="flex w-14 items-center justify-center text-sm font-semibold tabular-nums"
      >
        {value}
      </output>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label={`One ${label.replace(/s$/, "")} more`}
        className={cn(button, "border-l border-input")}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

const DOCKET_COLOURS = [
  "bg-docket-sapphire",
  "bg-docket-amber",
  "bg-docket-teal",
  "bg-docket-rose",
  "bg-docket-emerald",
  "bg-docket-violet",
];

/** The six-colour rule across the top of a card. */
export function DocketStripe() {
  return (
    <div aria-hidden="true" className="flex h-1.5">
      {DOCKET_COLOURS.map((colour) => (
        <span key={colour} className={cn("flex-1", colour)} />
      ))}
    </div>
  );
}

/** Seats × ₹1,999, GST 18%, total — in a quiet grey panel. */
export function PriceBreakdown({ seats, compact = false }: { seats: number; compact?: boolean }) {
  const quote = premiumQuote(seats);
  return (
    <dl className={cn("rounded bg-secondary text-sm", compact ? "p-3" : "p-4")}>
      <div className="flex justify-between gap-4">
        <dt>
          {seats} × {inr(PREMIUM_SEAT_PRICE_INR)}
        </dt>
        <dd className="font-semibold tabular-nums">{inr(quote.subtotal)}</dd>
      </div>
      <div className="mt-1 flex justify-between gap-4 text-muted-foreground">
        <dt>GST 18%</dt>
        <dd className="tabular-nums">{inr(quote.gst)}</dd>
      </div>
      <div className="mt-2 flex justify-between gap-4 border-t border-border pt-2 font-bold">
        <dt>Total per month</dt>
        <dd className="tabular-nums">{inr(quote.total)}</dd>
      </div>
    </dl>
  );
}
