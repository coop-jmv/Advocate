import { defineConfig, loadEnv, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// VITE_* variables are substituted into the client bundle at build time —
// there is no way to read them at runtime in a browser. A missing one used
// to fail silently: the build succeeded, shipped a bundle with `undefined`
// baked in, and it only crashed for a real user in their browser, with no
// signal at deploy time. This fails the build itself instead, wherever the
// build runs, so a missing/misconfigured variable is caught before shipping.
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
            "build is running (CI/hosting project settings, or .env locally) and rebuild.",
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
  ],
});
