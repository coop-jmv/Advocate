// Port of src/lib/date-ist.ts's todayIsoIST() for the Deno edge-function
// runtime. Kept as a separate copy (rather than a shared import across the
// Vite/Deno boundary) because these two runtimes don't share a build step —
// but the logic must stay identical: always ask what the date is *in*
// Asia/Kolkata explicitly, never infer it from the runtime's own clock. See
// the comment at the top of src/lib/date-ist.ts for the full "why."

const IST_TIME_ZONE = "Asia/Kolkata";

/** "Today" as an advocate in India sees it, regardless of the edge function
 * runtime's own clock/timezone. */
export function todayIsoIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * "Tomorrow" as an advocate in India sees it. Pure calendar arithmetic
 * anchored at UTC midnight on todayIsoIST()'s result — mirrors
 * src/lib/date-ist.ts's addDaysIso() — never re-derives "now" or reapplies a
 * timezone conversion, so this can't drift across the IST/UTC boundary the
 * way constructing a local Date and re-serializing with toISOString() does.
 */
export function tomorrowIsoIST(): string {
  const d = new Date(`${todayIsoIST()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
