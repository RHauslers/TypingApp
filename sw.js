const CACHE = "writing-practice-v4";
const ASSETS = [
  ".",
  "index.html",
  "style.css",
  "app.js",
  "sync.js",
  "text.js",
  "manifest.json",
  "icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache external fetches (URL text extraction) or the GitHub API
  if (url.hostname.includes("r.jina.ai") ||
      url.hostname.includes("api.allorigins.win") ||
      url.hostname.includes("api.github.com")) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
