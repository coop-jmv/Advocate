// Vercel Edge Function entry point, wired in via vite-plugin-vercel
// (see vite.config.ts). Vercel's runtime expects a plain single-arg
// Web-standard fetch(request) — no env/ctx params like Cloudflare Workers.
import { handleRequest } from "./lib/server-handler";

export default {
  fetch: handleRequest,
};
