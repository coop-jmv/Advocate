// Server functions here throw `Error(message)` where the message is usually a
// hand-written sentence — but several real, live-reproduced exceptions leak
// the underlying tool's own error text straight to the user instead:
//
//   1. A Zod `inputValidator` failure (e.g. `z.string().min(2)`) surfaces its
//      `.issues` array serialized to JSON, e.g.
//      `[ { "code": "too_small", "minimum": 2, ..., "path": [ "title" ] } ]`.
//   2. A Postgres column-precision failure (e.g. a `NUMERIC` column overflow)
//      surfaces the driver's own message verbatim, e.g. `numeric field overflow`.
//   3. An RLS policy or GRANT rejection (found live during the Security Test
//      Plan's Pass 2 — a legitimate action reaching a stale RLS/grant edge
//      case, not just an adversarial one) surfaces Postgres's own wording,
//      e.g. `new row violates row-level security policy for table "clients"`
//      or `permission denied for table ai_documents` — which names internal
//      table structure to the user for no benefit (it's never actionable:
//      there's nothing a legitimate user can *do* with "row-level security
//      policy", they just need to know the action isn't allowed).
//
// This turns those into something a user can actually read and act on, and
// otherwise passes through whatever hand-written message was already there
// unchanged.
export function friendlyErrorMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  const message = cause.message;

  const zodIssue = firstZodIssue(message);
  if (zodIssue) {
    const field = Array.isArray(zodIssue.path) ? zodIssue.path.at(-1) : undefined;
    const label = typeof field === "string" ? humanizeFieldName(field) : "This field";
    return `${label}: ${zodIssue.message}`;
  }

  if (message.includes("numeric field overflow")) {
    return "That number is too large — please enter a smaller value.";
  }

  if (
    message.includes("row-level security policy") ||
    message.startsWith("permission denied for")
  ) {
    return "You don't have permission to do that.";
  }

  return message || fallback;
}

function firstZodIssue(message: string): { message: string; path?: unknown[] } | undefined {
  if (!message.startsWith("[")) return undefined;
  try {
    const parsed = JSON.parse(message);
    const issue = Array.isArray(parsed) ? parsed[0] : undefined;
    return issue && typeof issue.message === "string" ? issue : undefined;
  } catch {
    return undefined;
  }
}

function humanizeFieldName(field: string): string {
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
