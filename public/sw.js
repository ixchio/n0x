const SHELL_CACHE_PREFIX = "n0x-shell-";
const CACHE = `${SHELL_CACHE_PREFIX}v3`;
const SHELL = ["/", "/chat", "/manifest.json"];

function isOldN0xShellCache(name) {
    const isCurrentPrefix = name.startsWith(SHELL_CACHE_PREFIX);
    const isLegacyShell = /^n0x-v\d+$/.test(name);
    return name !== CACHE && (isCurrentPrefix || isLegacyShell);
}

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(isOldN0xShellCache).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
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
