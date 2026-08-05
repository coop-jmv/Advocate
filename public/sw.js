// Hand-written service worker (no build-step precache manifest — this app's
// hashed asset filenames change every deploy, so we cache opportunistically
// as the user browses rather than baking in a static file list).
//
// Bump CACHE_VERSION whenever this file's caching strategy changes, so old
// clients pick up the new logic instead of running stale cached code forever.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `advocate-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `advocate-assets-${CACHE_VERSION}`;

// Paths that must always hit the network — live data, auth and file storage
// should never be served from cache.
const NEVER_CACHE = [/^\/rest\//, /^\/auth\//, /^\/storage\//, /^\/functions\//, /^\/graphql\//];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/manifest.webmanifest", "/favicon.ico"]))
      .catch(() => {
        /* best-effort — don't fail install over a missing asset */
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) return;

  // Page navigations: network-first, falling back to the cached shell when
  // offline so the app still opens instead of showing a browser error page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () => caches.match(request) || caches.match("/app") || caches.match("/"),
      ),
    );
    return;
  }

  // Static build assets (hashed JS/CSS/fonts/images): stale-while-revalidate.
  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
  }
});
