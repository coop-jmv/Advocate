export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  console.error(`[error] ${message}`, {
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    ...context,
  });
}
