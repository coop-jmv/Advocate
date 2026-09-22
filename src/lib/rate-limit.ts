// Per-IP request throttle for the main app, using Cloudflare's native Rate
// Limiting binding ([[ratelimits]] in wrangler.toml — no KV, Durable Object or
// external dependency). Twin of services/*/src/rate-limit.ts; kept as its own
// copy because each Worker is deployed independently.
//
// The seven services/* Workers have had this since Pass 5's P5-3, but the main
// app never did, so the SSR routes and every TanStack server function were the
// one unmetered way in. That included submitContactRequest(), which is
// unauthenticated and sends a Resend email per call — see the note in
// src/lib/contact.functions.ts, which asks for exactly this.
//
// Applied in src/server.ts rather than in handleRequest(): the binding lives on
// the Workers `env` argument, and server-handler.ts is deliberately a portable
// Request -> Response function with no platform objects threaded through it.
// The Cloudflare entry point is the right place for a Cloudflare binding.

interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface RateLimitEnv {
  // Both optional: `vite dev` and `wrangler dev` without the bindings, and any
  // environment where they have not been provisioned, simply skip the check
  // rather than fail.
  RATE_LIMITER?: Limiter;
  CONTACT_RATE_LIMITER?: Limiter;
}

// A server function call carries an Authorization header only when there is a
// session (see src/integrations/supabase/auth-attacher.ts). submitContactRequest
// is the only server function a signed-out visitor can reach, so "POST to
// /_serverFn/ with no Authorization header" identifies the contact form without
// depending on TanStack's opaque, build-generated function ids — which are not
// stable enough to match on by path.
function isUnauthenticatedServerFn(request: Request): boolean {
  if (request.method !== "POST") return false;
  if (request.headers.get("authorization")) return false;
  return new URL(request.url).pathname.startsWith("/_serverFn/");
}

/**
 * Returns a 429 Response when the caller has exceeded the limit, or null to
 * let the request proceed.
 *
 * Fails OPEN when the binding is absent or throws. That is deliberate: a rate
 * limiter is an availability control, and a missing binding must never take the
 * whole site down. Cloudflare's limiter is also best-effort and per-colo, so
 * treat it as a flood damper rather than exact accounting.
 */
export async function rateLimitResponse(
  request: Request,
  env: RateLimitEnv | undefined,
): Promise<Response | null> {
  // The contact form sends a Resend email per call and needs no session, so it
  // gets a far tighter ceiling than general traffic. Checked first: the tighter
  // limit is the one that should decide.
  const limiter = isUnauthenticatedServerFn(request)
    ? (env?.CONTACT_RATE_LIMITER ?? env?.RATE_LIMITER)
    : env?.RATE_LIMITER;
  if (!limiter) return null;

  // cf-connecting-ip is set by Cloudflare's edge and cannot be spoofed by the
  // client, unlike x-forwarded-for.
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";

  let success = true;
  try {
    ({ success } = await limiter.limit({ key }));
  } catch {
    return null;
  }
  if (success) return null;

  // Plain text, not the decorative HTML error page: a client being throttled is
  // usually a script, and a page navigation that hits this gets something
  // readable either way.
  return new Response("Too many requests — please slow down and try again in a minute.", {
    status: 429,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "Retry-After": "60",
    },
  });
}
