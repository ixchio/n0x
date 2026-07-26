const SHELL_CACHE_PREFIX = "n0x-shell-";
const CACHE = `${SHELL_CACHE_PREFIX}v4`;
const SHELL = ["/", "/chat", "/manifest.json", "/offline.html"];
const SHELL_PATHS = new Set(SHELL);
const STATIC_ASSET = /\.(?:js|mjs|css|woff2|png|jpe?g|webp|avif|svg)$/;

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

    // don't touch api routes, live Vercel telemetry, or third-party stuff
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_vercel/") || url.origin !== self.location.origin)
        return;
    if (e.request.method !== "GET") return;

    if (e.request.mode === "navigate") {
        // pages: network first, fall back to cache
        e.respondWith(
            (async () => {
                try {
                    const response = await fetch(e.request);
                    const cacheControl = response.headers.get("cache-control") || "";
                    if (response.ok && !cacheControl.includes("no-store") && !url.search && SHELL_PATHS.has(url.pathname)) {
                        try {
                            const cache = await caches.open(CACHE);
                            await cache.put(url.pathname, response.clone());
                        } catch {
                            // A cache quota/permission failure must never hide a
                            // valid network response from the user.
                        }
                    }
                    return response;
                } catch {
                    return (await caches.match(url.pathname)) || (await caches.match("/offline.html")) || Response.error();
                }
            })()
        );
        return;
    }

    // assets: cache first
    e.respondWith(
        (async () => {
            const cacheable = !url.search && STATIC_ASSET.test(url.pathname);
            const hit = cacheable ? await caches.match(url.pathname) : undefined;
            if (hit) return hit;

            const response = await fetch(e.request);
            const cacheControl = response.headers.get("cache-control") || "";
            if (cacheable && response.ok && !cacheControl.includes("no-store")) {
                try {
                    const cache = await caches.open(CACHE);
                    await cache.put(url.pathname, response.clone());
                } catch {
                    // Best-effort acceleration only; the fetched asset is valid.
                }
            }
            return response;
        })()
    );
});
