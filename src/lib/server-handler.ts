// The app's request handling, kept separate from the Cloudflare Workers entry
// that wraps it (src/server.ts). Deliberately Web-standard Request -> Response
// with no env/ctx params: configured values are read from process.env (via
// wrangler.toml's [vars], which nodejs_compat exposes), so nothing
// platform-specific is threaded through here and this stays portable.
import { consumeLastCapturedError } from "./error-capture";
import { renderErrorPage } from "./error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  request: Request,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return catastrophicResponse(request);
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function isServerFnRequest(request: Request): boolean {
  return new URL(request.url).pathname.startsWith("/_serverFn/");
}

// A page navigation that hits this gets the decorative HTML error page. A
// server function call (TanStack's client reads the response body straight
// into its thrown Error's .message) must never get that page — every screen
// that calls a server function displays cause.message directly, so an HTML
// document ends up dumped verbatim into the UI as if it were an error
// string. Server function callers get a short, plain-text message instead.
function catastrophicResponse(request: Request): Response {
  // X-Error-Kind is a deliberately permanent diagnostic: it names which of
  // the two branches below served this specific error, straight from the
  // deployed code — the fastest way to confirm what's actually live without
  // needing platform log access, on any host.
  if (isServerFnRequest(request)) {
    return new Response("Something went wrong loading that data. Please try again.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "x-error-kind": "server-fn" },
    });
  }
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8", "x-error-kind": "page" },
  });
}

// Baseline hardening headers on every response the Worker generates.
// Responses served straight from the [assets] binding (dist/client: hashed
// bundles, icons, sw.js) never reach this code — those are headered by
// public/_headers, which has to be kept in sync with this function.
// CSP is scoped to what this
// app actually calls: Supabase (auth/db/functions) and the OpenAI-compatible
// AI gateway for OCR/dictation/assistant requests made from the browser via
// supabase.functions.invoke.
// The Supabase origin comes from the same SUPABASE_URL the app itself connects
// to, rather than being hardcoded. It used to name the production project
// directly, so pointing the app at any other Supabase project - the local
// stack, a staging project, a future migration - left every auth and data call
// blocked by the browser, silently: supabase-js saw a failed fetch and the UI
// just behaved as if there were no session (found testing the reset-password
// flow against the local stack). Read per request, not at import time, so it
// never depends on when the runtime populates process.env. Falls back to the
// production origin if the variable is missing or unparseable, which keeps the
// deployed policy identical to what it was.
const DEFAULT_SUPABASE_ORIGIN = "https://cjcjfdwdlsdgyvshuncn.supabase.co";

function supabaseConnectSources(): string {
  let origin = DEFAULT_SUPABASE_ORIGIN;
  try {
    origin = new URL(process.env["SUPABASE_URL"] || DEFAULT_SUPABASE_ORIGIN).origin;
  } catch {
    origin = DEFAULT_SUPABASE_ORIGIN;
  }
  // http -> ws, https -> wss, same host: Realtime's socket needs the WebSocket
  // scheme listed explicitly.
  return `${origin} ${origin.replace(/^http/, "ws")}`;
}

function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Puts this app's pages in their own browsing-context group, so a window
    // it opens (or that opens it) cross-origin gets no window.opener handle
    // back — closing off the cross-window scripting and XS-Leak surface that
    // frame-ancestors/X-Frame-Options do not cover, since those only govern
    // framing, not popups.
    //
    // Safe here because nothing opens a cross-origin popup that needs to talk
    // back: there is no window.open anywhere in src/, auth is Supabase's
    // full-page redirect flow rather than an OAuth popup, and Razorpay is an
    // emailed payment link (see src/lib/subscription-invoice.ts), not an
    // embedded checkout. The only target="_blank" links are same-origin
    // (/privacy) and already carry rel="noreferrer". Recheck this if an
    // embedded payment checkout or a popup-based SSO is ever added.
    "Cross-Origin-Opener-Policy": "same-origin",
    // Stops other origins loading this app's responses as a no-cors
    // subresource (<img>, <script>, <link>), which is the main defence against
    // cross-site leaks like Spectre-style probing of authenticated responses.
    //
    // 'same-origin' rather than 'same-site' is safe even though the native
    // apps are in play: capacitor.config.ts points the WebView at
    // https://lexdiary.online itself rather than bundling webDir, so Android
    // and iOS run *as* that origin and load nothing cross-origin. Genuinely
    // cross-origin consumers are unaffected — social crawlers fetch og-image
    // server-side, and CORP is only enforced by browsers on subresource loads.
    //
    // Deliberately no Cross-Origin-Embedder-Policy to go with these: COEP
    // require-corp would demand a CORP header (or CORS) on every cross-origin
    // subresource this app pulls, which means Supabase storage and the
    // lexdiary-* microservice origins would all have to opt in first. Nothing
    // here needs cross-origin isolation, so the breakage buys nothing.
    "Cross-Origin-Resource-Policy": "same-origin",
    // Deprecated, and deliberately 0 rather than the "1; mode=block" older
    // hardening guides still recommend. OWASP's Secure Headers Project warns
    // that the XSS Auditor this enables "can introduce additional security
    // issues on the client side", and says to send 0 to switch it off outright
    // rather than leave the browser on its default. Chrome dropped the auditor
    // in 2019 and Firefox never shipped one, so on current browsers this is a
    // no-op; it is here to pin the behaviour on anything older. The CSP below
    // is the real XSS control.
    "X-XSS-Protection": "0",
    // Deny every powerful feature, then re-grant only the two this app
    // actually uses. Worth being explicit about why this is so much longer
    // than the three entries it replaces: an *omitted* feature is not denied —
    // it falls back to the browser's default allowlist, which for most
    // features is 'self'. So the short policy left payment, usb, serial,
    // display-capture, clipboard and the rest quietly available to our own
    // origin, and any injected same-origin script could reach them. The list
    // is OWASP's Secure Headers Project recommendation verbatim, with two
    // entries relaxed from () to (self):
    //   microphone - src/lib/wav-recorder.ts calls getUserMedia({ audio: true })
    //     for dictation.
    //   camera - DocumentIntelligence.tsx's capture="environment" file input
    //     for document scanning.
    // Everything else was grepped for before being denied: nothing under src/
    // touches clipboard, web-share, wake-lock, fullscreen, WebAuthn or unload.
    // Browsers ignore feature names they do not know, so the entries for dead
    // features (interest-cohort) are inert rather than harmful.
    "Permissions-Policy": [
      "accelerometer=()",
      "autoplay=()",
      "camera=(self)",
      "clipboard-read=()",
      "clipboard-write=()",
      "cross-origin-isolated=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=()",
      "gamepad=()",
      "geolocation=()",
      "gyroscope=()",
      "hid=()",
      "idle-detection=()",
      "interest-cohort=()",
      "keyboard-map=()",
      "magnetometer=()",
      "microphone=(self)",
      "midi=()",
      "payment=()",
      "picture-in-picture=()",
      "publickey-credentials-get=()",
      "screen-wake-lock=()",
      "serial=()",
      "sync-xhr=(self)",
      "unload=()",
      "usb=()",
      // Chrome has not implemented this policy name (WebKit has), so it logs
      // "Unrecognized feature: 'web-share'" once per page load there. Kept
      // anyway: it is a real spec feature and it does deny web-share on
      // WebKit. Nothing calls navigator.share, so drop it if the console
      // noise ever matters more than the coverage.
      "web-share=()",
      "xr-spatial-tracking=()",
    ].join(", "),
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Content-Security-Policy": [
      "default-src 'self'",
      // 'unsafe-inline' is still here for one reason: TanStack Start's SSR
      // streams inline <script> blocks to hand the dehydrated router state to
      // the client, and it has no nonce/hash hook to attach a per-request nonce
      // to them. Removing it without that support breaks hydration outright.
      // The app's own code no longer depends on it — the last inline handler
      // (the error page's onclick) was removed — so this becomes a one-line
      // change the moment TanStack Start exposes a nonce. Tracked as the S17
      // finding in docs/security-test-plan.md; note that a browser ignores
      // 'unsafe-inline' entirely once a nonce is present, so the two can't be
      // shipped as a half-measure together.
      //
      // static.cloudflareinsights.com is Cloudflare Web Analytics: Cloudflare's
      // edge injects its beacon script into every page on lexdiary.online, and
      // without this entry the browser blocked it, so no visits were recorded.
      // Cookie-free; the beacon reports to cloudflareinsights.com (connect-src).
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
      // Plugin content is a script-execution vector of its own and nothing here
      // uses <object>/<embed>. default-src would fall back to 'self'; 'none' is
      // strictly tighter.
      "object-src 'none'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      // Fonts are self-hosted (see styles.css), so no third-party font origin.
      "font-src 'self' data:",
      // supabase-js's Realtime client keeps its heartbeat accurate in
      // backgrounded tabs via a same-origin blob: Worker — without worker-src,
      // that falls back to script-src, which doesn't permit blob: and the
      // worker gets silently blocked.
      "worker-src 'self' blob:",
      // wss:// alongside https:// for the same host: Realtime's socket
      // connection needs the WebSocket scheme explicitly: connect-src doesn't
      // treat https:// as also covering wss:// on the same origin.
      // lexdiary-clients.* / lexdiary-matters.* / lexdiary-diary.* /
      // lexdiary-documents.* / lexdiary-billing.* / lexdiary-drafting.* /
      // lexdiary-assistant.* are the microservices (services/clients/,
      // services/matters/, services/diary/, services/documents/,
      // services/billing/, services/drafting/, services/assistant/) —
      // called directly from the browser, see src/lib/clients-service.ts,
      // src/lib/matters-service.ts, src/lib/diary-service.ts,
      // src/lib/documents-service.ts, src/lib/billing-service.ts,
      // src/lib/drafting-service.ts and src/lib/assistant-service.ts.
      `connect-src 'self' ${supabaseConnectSources()} https://api.openai.com https://lexdiary-clients.dhanapalan-advocate.workers.dev https://lexdiary-matters.dhanapalan-advocate.workers.dev https://lexdiary-diary.dhanapalan-advocate.workers.dev https://lexdiary-documents.dhanapalan-advocate.workers.dev https://lexdiary-billing.dhanapalan-advocate.workers.dev https://lexdiary-drafting.dhanapalan-advocate.workers.dev https://lexdiary-assistant.dhanapalan-advocate.workers.dev https://cloudflareinsights.com`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  };
}

// The same Worker answers on the custom domain and on its *.workers.dev
// address, which would otherwise be indexed as a byte-identical duplicate of
// every page. Pages already carry a canonical link to the custom domain; this
// tells crawlers outright not to index the other host. Only the custom domain
// (and local development) is left indexable. Static files (robots.txt,
// sitemap.xml, images) are served by the assets binding before the Worker
// runs, so they are unaffected either way.
const INDEXABLE_HOSTS = new Set(["lexdiary.online", "localhost", "127.0.0.1"]);

// Paths whose responses must never be written to a cache. Deliberately a
// prefix list rather than "everything": the marketing pages, guides and
// sitemap are public, identical for everyone, and want to stay cacheable for
// SEO and speed — blanketing the origin with no-store would cost that for no
// security gain.
//
// /_serverFn/ is the one that actually matters. The SSR shell for /app is only
// a few KB of nav chrome (auth is client-side, so no user content is rendered
// server-side), but the server functions and the services/* Workers return the
// real thing: client lists, matters, diary entries, invoices. Nothing in this
// codebase set Cache-Control at all, so those responses fell to heuristic
// caching and could be written to a shared machine's on-disk cache.
const PRIVATE_PATH_PREFIXES = ["/app", "/admin", "/_serverFn/", "/invite/", "/reset-password"];

function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

// Exported so src/server.ts can decorate the responses it generates before
// handleRequest() runs (currently the rate-limit 429).
export function withSecurityHeaders(response: Response, request: Request): Response {
  for (const [key, value] of Object.entries(securityHeaders())) {
    if (!response.headers.has(key)) response.headers.set(key, value);
  }
  const url = new URL(request.url);
  const privatePath = isPrivatePath(url.pathname);

  // HSTS is meaningless on a cleartext response — browsers ignore the header
  // when it arrives over HTTP, by design, since an attacker could otherwise
  // forge it. hstspreload.org flags sending it anyway as
  // `redirects.http.useless_header` and asks for it to be removed, so it is
  // stripped here rather than left as bytes on every http:// request.
  //
  // In practice this is the http -> https redirect above, which is the only
  // http:// response this Worker still produces on a public host, plus local
  // development over http://localhost. Done here rather than in httpsRedirect()
  // so the rule is "never send HSTS over cleartext" in one place, instead of a
  // special case one caller has to remember.
  if (url.protocol === "http:") {
    response.headers.delete("Strict-Transport-Security");
  }

  if (!INDEXABLE_HOSTS.has(url.hostname)) {
    response.headers.set("X-Robots-Tag", "noindex");
  } else if (privatePath) {
    // The signed-in area answered 200 to anonymous crawlers with nothing
    // telling them to stay out: /admin, /admin/users, /admin/audit-log, /app,
    // /app/diary and the rest all returned an indexable SSR shell. No data
    // leaks that way — auth is client-side, so the shell is a few KB of nav
    // chrome with no user content in it — but it does publish the shape of the
    // private surface, and an indexed /admin URL is precisely what a passive
    // scanner or a search query surfaces to someone looking for a way in.
    //
    // Deliberately NOT done by listing these paths in robots.txt: that file is
    // public, so a Disallow entry advertises the path it is meant to protect.
    // A response header tells the crawler and nobody else.
    //
    // nofollow as well as noindex, because there is no reason for a crawler to
    // walk deeper into /admin/* from a page it must not index.
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  // set(), not "only if absent": a route that has thought about its own caching
  // is not expected here, and a stale/permissive value on a private path is
  // exactly what this is for.
  if (privatePath) {
    response.headers.set("Cache-Control", "no-store, max-age=0");
  }
  return response;
}

// Hosts that legitimately speak plain HTTP, so the redirect below must leave
// them alone. The dev server runs this same handler over http://localhost, and
// redirecting it to an https:// port nothing is listening on breaks local
// development outright.
const CLEARTEXT_OK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Cloudflare's "Always Use HTTPS" was found switched off on lexdiary.online:
// http:// served the whole app with a 200 rather than redirecting, which also
// meant the Strict-Transport-Security header above was inert for anyone
// arriving over http (browsers ignore HSTS on a cleartext response, by design
// — an attacker could have forged it otherwise). Turning that setting on is
// still the right primary fix: it redirects at the edge, before a Worker
// invocation is spent. This is the belt-and-braces copy, so the guarantee
// lives in code that ships with the app and survives a dashboard change.
//
// 301 rather than 308 to match what Cloudflare's own edge redirect emits. The
// method-preserving nicety of 308 is not wanted here: a cleartext POST has
// already leaked its body, so quietly replaying it over TLS would hide that
// rather than fix it.
function httpsRedirect(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.protocol !== "http:") return undefined;
  if (CLEARTEXT_OK_HOSTS.has(url.hostname)) return undefined;
  url.protocol = "https:";
  return new Response(null, { status: 301, headers: { Location: url.toString() } });
}

export async function handleRequest(request: Request): Promise<Response> {
  const redirect = httpsRedirect(request);
  if (redirect) return withSecurityHeaders(redirect, request);
  try {
    const handler = await getServerEntry();
    const response = await handler.fetch(request, undefined, undefined);
    return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response, request), request);
  } catch (error) {
    console.error(error);
    return withSecurityHeaders(catastrophicResponse(request), request);
  }
}
