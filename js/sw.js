const CACHE_NAME = "ebook-cache-v1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/base.css",
  "./css/components.css",
  "./js/app.js",
  "./js/ui.js",
  "./content/toc.json",
  "./content/refs.json",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (req.destination === "document" || url.pathname.includes("/content/")) {
      try{
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      }catch{
        const cached = await cache.match(req);
        if (cached) return cached;
        return new Response("Offline e conteúdo não está em cache ainda.", { status: 503 });
      }
    }

    const cached = await cache.match(req);
    if (cached) return cached;

    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  })());
});
