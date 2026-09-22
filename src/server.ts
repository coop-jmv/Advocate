// Cloudflare Workers entry point. Wraps the shared, platform-agnostic
// handler in the 3-arg fetch(request, env, ctx) shape Workers requires.
//
// The rate-limit check lives here rather than inside handleRequest() because
// the RATE_LIMITER binding arrives on `env`, and server-handler.ts is
// deliberately a portable Request -> Response function with nothing
// platform-specific threaded through it. This file is already the
// Cloudflare-specific one, so the Cloudflare binding belongs here.
import { rateLimitResponse, type RateLimitEnv } from "./lib/rate-limit";
import { handleRequest, withSecurityHeaders } from "./lib/server-handler";

export default {
  async fetch(request: Request, env: RateLimitEnv | undefined, _ctx: unknown) {
    // Before anything else: shed flood traffic at the front door, so a script
    // cannot spend SSR renders, Supabase round-trips or Resend sends. The 429
    // still gets the standard security headers — every response from this
    // origin carries them, including the ones we generate ourselves.
    const limited = await rateLimitResponse(request, env);
    if (limited) return withSecurityHeaders(limited, request);

    return handleRequest(request);
  },
};
