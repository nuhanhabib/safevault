// Offline support: caches the app's own files only. Never touches Google requests or your vault.
const CACHE = "safevault-v4";
const FILES = ["./", "index.html", "style.css", "manifest.webmanifest", "js/app.js", "js/crypto.js",
  "js/drive.js", "js/config.js", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
// Network first (so updates arrive quickly), cache as offline fallback.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
    }).catch(() => caches.match(e.request))
  );
});
