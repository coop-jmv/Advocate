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
    // bundle src/server.vercel.ts behind a catch-all route. This must run as
    // a Node.js Serverless Function, NOT a Vercel Edge Function: TanStack's
    // SSR streaming code imports real Node builtins (node:stream,
    // node:stream/web) — Cloudflare only resolves those because
    // wrangler.toml sets compatibility_flags = ["nodejs_compat"], and
    // Vercel's Edge Runtime has no equivalent Node builtin support at all.
    // Gated on process.env.VERCEL so the Cloudflare/Wrangler build path is
    // completely unaffected.
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
