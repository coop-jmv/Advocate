// Confirmation gate for destructive and billing-affecting actions.
//
// Every delete/remove/revoke in the app routes through here rather than
// calling window.confirm directly, so the phrasing stays consistent and there
// is a single place to swap in a proper dialog component later.
//
// Returns false when there is no window (SSR), so a destructive action can
// never proceed unconfirmed on the server.
export function confirmDestructive(message: string): boolean {
  if (typeof window === "undefined") return false;
  return window.confirm(message);
}

// Convenience for the common "remove X permanently" phrasing. `subject` is a
// noun phrase, e.g. `the invite for junior@example.com`.
export function confirmPermanentRemoval(subject: string, consequence?: string): boolean {
  const tail = consequence ? ` ${consequence}` : "";
  return confirmDestructive(`Delete ${subject}?${tail} This cannot be undone.`);
}
