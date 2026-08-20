import { defineConfig, loadEnv, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import vercel from "vite-plugin-vercel/vite";

// VITE_* variables are substituted into the client bundle at build time —
// there is no way to read them at runtime in a browser. A missing one used
// to fail silently: the build succeeded, shipped a bundle with `undefined`
// baked in, and it only crashed for a real user in their browser, with no
// signal at deploy time. This fails the build itself instead, on whichever
// platform is building — Vercel, Cloudflare, or a local machine — so a
// missing/misconfigured variable is caught before anything ships.
function requireBuildEnv(): Plugin {
  return {
    name: "require-build-env",
    apply: "build",
    config(_config, { mode }) {
      // loadEnv, not process.env directly: this must see .env-file values the
      // same way Vite's own client substitution will, not just real OS-level
      // environment variables (which is all bare process.env would show).
      const env = loadEnv(mode, process.cwd(), "VITE_");
      const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"].filter(
        (key) => !env[key],
      );
      if (missing.length > 0) {
        throw new Error(
          `Build aborted: missing required environment variable(s): ${missing.join(", ")}. ` +
            "These are inlined into the client bundle at build time, so a missing value here " +
            "ships silently and only fails in a real user's browser. Set them wherever this " +
            "build is running (Vercel/Cloudflare project settings, or .env locally) and rebuild.",
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [
    requireBuildEnv(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
    // TanStack Start's build only knows how to emit a Cloudflare-Workers-shaped
    // handler (src/server.ts, 3-arg fetch). Vercel needs a plain Web-standard
    // single-arg fetch handler instead, so on Vercel builds we additionally
    // bundle src/server.vercel.ts behind a catch-all route, as a Node.js
    // function (not Edge — TanStack's SSR streaming code needs real
    // node:stream/node:stream/web, which only Cloudflare resolves via
    // wrangler.toml's nodejs_compat, and Vercel's Edge Runtime has no
    // equivalent for). Gated on process.env.VERCEL so the Cloudflare/Wrangler
    // path is completely unaffected.
    //
    // vite-plugin-vercel's own bundling pass has a real bug: re-processing
    // the already-built SSR chunk through its separate Rolldown build
    // re-triggers TanStack's virtual `tanstack-start-manifest:v` module in a
    // context that resolves to dev mode, silently replacing the correct
    // production route manifest with one whose only script is the dev-only
    // `/@id/virtual:tanstack-start-dev-client-entry` entry — which 404s at
    // runtime, so the client bundle never loads and the page never
    // hydrates. `scripts/patch-vercel-manifest.mjs` (run via the
    // `vercel-build` script) repairs this after the fact by substituting
    // back in the correct manifest that's already sitting in dist/server's
    // output from the very same `vite build` invocation.
    Boolean(process.env["VERCEL"]) &&
      vercel({
        entries: [
          {
            id: "src/server.vercel.ts",
            route: "/**",
          },
        ],
      }),
  ],
});
