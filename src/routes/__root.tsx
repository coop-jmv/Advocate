import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/edge-functions";
import { OG_IMAGE_URL, SITE_NAME } from "@/lib/seo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LexDiary — Practice Management for Indian Advocates" },
      {
        name: "description",
        content:
          "Cases, court diary, documents with OCR, clients and GST billing in one mobile-first workspace built for Indian advocates and law firms.",
      },
      { name: "author", content: "LexDiary" },
      {
        property: "og:title",
        content: "LexDiary — Practice Management for Indian Advocates",
      },
      {
        property: "og:description",
        content:
          "Cases, court diary, documents with OCR, clients and GST billing in one mobile-first workspace built for Indian advocates.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:locale", content: "en_IN" },
      // twitter:card was already summary_large_image, but no image existed to show.
      { property: "og:image", content: OG_IMAGE_URL },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "LexDiary — practice management for Indian advocates" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE_URL },
      { name: "theme-color", content: "#0f1e42" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "LexDiary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Module-scope (not component state) so it survives the effect
// re-running across re-renders/HMR without needing a ref.
let lastLoggedLoginToken: string | undefined;

// A password-recovery link can land somewhere other than /reset-password: when
// the redirect a reset asked for isn't accepted, Supabase Auth silently sends the
// person to the Site URL instead (reproduced on the local stack — the link landed
// on the home page). They then hold a valid recovery session but never see the
// "set a new password" form, which reads exactly like "reset doesn't work".
//
// Captured here, at module evaluation, rather than inside an effect: the session
// travels in the URL fragment, and the Supabase client consumes and strips that
// fragment as soon as anything first touches it — which can happen in a child
// route's effect before RootComponent's own effects run. Reading it now is before
// any of that. Only a genuine session-bearing recovery callback qualifies.
const initialRecoveryHash =
  typeof window !== "undefined" &&
  /(?:^#|&)type=recovery(?:&|$)/.test(window.location.hash) &&
  /(?:^#|&)access_token=/.test(window.location.hash)
    ? window.location.hash
    : null;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Full-page replace rather than a client-side navigate: the reset page
    // establishes the session from the fragment on load, and a router navigation
    // could drop the fragment before the Supabase client has read it. The target
    // is fixed, so this can't be turned into an open redirect, and replace keeps
    // the token-bearing URL out of the back-button history.
    if (!initialRecoveryHash || window.location.pathname === "/reset-password") return;
    window.location.replace(`/reset-password${initialRecoveryHash}`);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((cause) => {
      reportError(cause, { source: "service_worker_register" });
    });
  }, []);

  useEffect(() => {
    // SIGNED_IN covers both password and OAuth sign-ins in one place.
    // INITIAL_SESSION (session restored from localStorage on page load) is
    // deliberately excluded — that's not a new login.
    //
    // supabase-js can re-fire SIGNED_IN for the *same* session (repeated
    // effect re-subscriptions across HMR/StrictMode re-renders, cross-tab
    // BroadcastChannel sync, etc.) — dedupe on the access token so one
    // real sign-in produces exactly one log entry.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN") return;
      const token = session?.access_token;
      if (!token || token === lastLoggedLoginToken) return;
      lastLoggedLoginToken = token;
      void logAuthEvent({ event: "login_success" });
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
