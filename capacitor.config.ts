import type { CapacitorConfig } from "@capacitor/cli";

// This app needs a live server behind it (SSR marketing pages, RLS-scoped
// TanStack server functions, Supabase auth) — there's no static bundle it
// could ship inside the native binary instead. So rather than bundling
// webDir into the app, Capacitor's native shell loads the deployed
// Cloudflare Worker directly over HTTPS. webDir is still required by the
// config schema; it's unused at runtime since server.url takes priority,
// but `cap sync` needs it to exist.
const config: CapacitorConfig = {
  appId: "com.advocatecompanion.app",
  appName: "Advocate Companion",
  webDir: "dist/client",
  server: {
    url: "https://advocate.dhanapalan-advocate.workers.dev",
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;
