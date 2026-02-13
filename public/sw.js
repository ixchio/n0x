const CACHE = "n0x-v2";
const SHELL = ["/", "/chat", "/manifest.json"];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);

    // don't touch api routes or third-party stuff
    if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) return;

    if (e.request.mode === "navigate") {
        // pages: network first, fall back to cache
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, copy));
                    return res;
                })
                .catch(() => caches.match(e.request).then(r => r || caches.match("/chat")))
        );
        return;
    }

    // assets: cache first
    e.respondWith(
        caches.match(e.request).then(hit => {
            if (hit) return hit;
            return fetch(e.request).then(res => {
                if (res.ok && /\.(js|css|woff2|png|svg)$/.test(url.pathname)) {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, copy));
                }
                return res;
            });
        })
    );
});
