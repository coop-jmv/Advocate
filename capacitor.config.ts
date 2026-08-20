import type { CapacitorConfig } from "@capacitor/cli";

// This app needs a live server behind it (SSR marketing pages, RLS-scoped
// TanStack server functions, Supabase auth) — there's no static bundle it
// could ship inside the native binary instead. So rather than bundling
// webDir into the app, Capacitor's native shell loads the deployed
// Cloudflare Worker directly over HTTPS. webDir is still required by the
// config schema; it's unused at runtime since server.url takes priority,
// but `cap sync` needs it to exist.
//
// server.url is the custom domain, not the workers.dev address, and that is
// deliberate: this value is compiled into the APK, so changing it later means
// a new build and a fresh Play Store submission. The custom domain is stable
// and ours; the workers.dev hostname is tied to the Worker's name and would
// break the shipped app if the Worker were ever renamed again.
const config: CapacitorConfig = {
  appId: "com.lexdiary.app",
  appName: "LexDiary",
  webDir: "dist/client",
  server: {
    url: "https://lexdiary.online",
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;
