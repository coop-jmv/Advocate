// This app has one intended audience — Indian advocates — and every "today"
// it shows is a court-practice date, which runs on India Standard Time
// regardless of where the code executing the check happens to be. That
// split matters here: client components run in the advocate's own browser
// (already IST, for this audience), but server functions run on Cloudflare
// Workers, whose runtime clock is UTC. `new Date().toISOString().slice(0, 10)`
// — used to read "today" all over this codebase — takes the UTC calendar
// date, which lags IST by a full day for the ~5.5 hours after midnight IST
// each night. A hearing correctly listed for "today" in the diary could
// silently vanish from the Morning Brief during exactly the hours a lawyer
// is most likely to check it before leaving for court.
//
// The fix is to always ask what the date is *in* Asia/Kolkata explicitly,
// never to infer it from whatever timezone the runtime happens to be in.

const IST_TIME_ZONE = "Asia/Kolkata";

function isoDateInTimeZone(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD — the one built-in locale reliably shaped
  // like an ISO date without manual part-assembly.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "Today" as an advocate in India sees it, regardless of the runtime's own clock/timezone. */
export function todayIsoIST(): string {
  return isoDateInTimeZone(new Date(), IST_TIME_ZONE);
}

/**
 * Add (or, with a negative count, subtract) whole days to an ISO date
 * string via pure calendar arithmetic anchored at UTC midnight — never
 * re-reads "now" or reapplies a timezone conversion, so a chain of these
 * can't drift back across the IST/UTC boundary the way constructing a
 * local Date and re-serializing with toISOString() does.
 */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Day of week (0 = Sunday .. 6 = Saturday) for an ISO date string. */
export function isoWeekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}
