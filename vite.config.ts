import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import vercel from "vite-plugin-vercel/vite";

export default defineConfig({
  plugins: [
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
