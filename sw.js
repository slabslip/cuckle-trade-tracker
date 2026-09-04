/* Chuckle Fantasy — installable shell.
 * Bump CACHE on every UI ship. Never cache HTML — stale documents were flashing an
 * old league home (older SW buckets used to store index.html and serve it back).
 * Deploys: merge to main → GitHub Pages. Clients reg.update() on load/focus; skipWaiting
 * + claim then controllerchange reloads once.
 */
const CACHE = "chuckle-shell-v195-history-back";
/* Icons + manifest only. brand-mark / gate-logo are loaded with ?DATA_V from the page. */
const SHELL = [
  "./manifest.webmanifest",
  "./data/ui/icon-192.png",
  "./data/ui/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      // Drop every prior bucket, including ones that once stored index.html.
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isAppDocument(url) {
  const path = url.pathname;
  return path.endsWith("/")
    || path.endsWith("/index.html")
    || path.endsWith("/preview.html")
    || path.endsWith("/design-league-home.html")
    || path.endsWith("/design-league-home-frame.html")
    || path.endsWith("/iphone-preview.html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.hostname.includes("supabase.co")) return;

  // HTML: network only. Never read or write document responses in Cache Storage.
  if (req.destination === "document" || isAppDocument(url)) {
    event.respondWith(
      fetch(req).catch(() => new Response(
        "<!doctype html><meta charset=utf-8><title>Offline</title>"
          + "<p>Chuckle Fantasy needs a network connection. "
          + "<a href='./'>Retry</a></p>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
      )),
    );
    return;
  }

  // Manifest / app icons: cache-first (versioned by CACHE name on activate).
  const isShell = url.pathname.endsWith("manifest.webmanifest")
    || /\/icon-\d+\.png$/.test(url.pathname);
  if (isShell) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  // JSON + other assets: network-first. Do not fall back to a cached index.html stand-in.
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok && url.pathname.includes("/data/") && !url.pathname.includes(".html")) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || Response.error())),
  );
});
