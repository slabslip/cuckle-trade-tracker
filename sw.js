/* Chuckle Fantasy — installable shell. Cache the app shell; network-first for JSON. */
/* Bump CACHE whenever index.html layout changes so Design Mode is not stuck on an old shell. */
const CACHE = "chuckle-shell-v9-news-feed";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./data/ui/icon-192.png", "./data/ui/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Live API / Edge always network.
  if (url.hostname.includes("supabase.co")) return;
  // index.html / app root: network-first so Design Mode and deploys are not stuck on a
  // cache-first shell (that is how the pre-PSA home kept showing after a redesign).
  const isAppHtml = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
  if (isAppHtml) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html"))),
    );
    return;
  }
  const isShell = url.pathname.endsWith("manifest.webmanifest") || url.pathname.includes("/icon-");
  if (isShell) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match("./index.html"))),
    );
    return;
  }
  // data/*.json — network first, cache fallback for offline meter paint.
  if (url.pathname.includes("/data/")) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req)),
    );
  }
});
