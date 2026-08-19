// Cloudflare Workers entry point. Wraps the shared, platform-agnostic
// handler in the 3-arg fetch(request, env, ctx) shape Workers requires.
import { handleRequest } from "./lib/server-handler";

export default {
  fetch(request: Request, _env: unknown, _ctx: unknown) {
    return handleRequest(request);
  },
};
