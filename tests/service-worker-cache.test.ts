import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("service worker activation", () => {
    it("removes old N0X shells without deleting model or third-party caches", async () => {
        const listeners = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
        const deleteCache = vi.fn(async (_name: string) => true);
        const claim = vi.fn(async () => undefined);
        const cacheNames = [
            "n0x-shell-v2",
            "n0x-shell-v3",
            "n0x-v2",
            "n0x-shell-v4",
            "webllm/v0/models",
            "mlc-ai-model-cache",
            "transformers-cache",
        ];

        const workerSource = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
        vm.runInNewContext(workerSource, {
            self: {
                addEventListener: (
                    name: string,
                    listener: (event: { waitUntil(promise: Promise<unknown>): void }) => void
                ) => listeners.set(name, listener),
                skipWaiting: vi.fn(),
                clients: { claim },
                location: { origin: "https://n0x.test" },
            },
            caches: {
                keys: vi.fn(async () => cacheNames),
                delete: deleteCache,
                open: vi.fn(),
                match: vi.fn(),
            },
            Promise,
            URL,
        });

        let activation: Promise<unknown> | undefined;
        listeners.get("activate")?.({
            waitUntil: promise => {
                activation = promise;
            },
        });
        await activation;

        expect(deleteCache.mock.calls.map(([name]) => name)).toEqual(["n0x-shell-v2", "n0x-shell-v3", "n0x-v2"]);
        expect(deleteCache).not.toHaveBeenCalledWith("webllm/v0/models");
        expect(deleteCache).not.toHaveBeenCalledWith("mlc-ai-model-cache");
        expect(claim).toHaveBeenCalledOnce();
    });

    it("does not cache or intercept Vercel Analytics traffic", () => {
        const listeners = new Map<string, (event: unknown) => void>();
        const workerSource = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

        vm.runInNewContext(workerSource, {
            self: {
                addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
                skipWaiting: vi.fn(),
                clients: { claim: vi.fn() },
                location: { origin: "https://n0x.test" },
            },
            caches: { open: vi.fn(), match: vi.fn(), keys: vi.fn(), delete: vi.fn() },
            Promise,
            URL,
        });

        const respondWith = vi.fn();
        listeners.get("fetch")?.({
            request: {
                url: "https://n0x.test/_vercel/insights/script.js",
                mode: "cors",
            },
            respondWith,
        });

        expect(respondWith).not.toHaveBeenCalled();
    });

    it("awaits a successful shell write and never caches a failed navigation", async () => {
        const listeners = new Map<string, (event: any) => void>();
        const put = vi.fn(async () => undefined);
        const open = vi.fn(async () => ({ put }));
        const workerSource = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
        let response = new Response("ok", { status: 200 });
        const fetch = vi.fn(async () => response);

        vm.runInNewContext(workerSource, {
            self: {
                addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener),
                skipWaiting: vi.fn(),
                clients: { claim: vi.fn() },
                location: { origin: "https://n0x.test" },
            },
            caches: { open, match: vi.fn(), keys: vi.fn(), delete: vi.fn() },
            fetch,
            Promise,
            Request,
            Response,
            Set,
            URL,
        });

        let handled: Promise<Response> | undefined;
        const event = {
            request: { url: "https://n0x.test/chat", method: "GET", mode: "navigate" },
            respondWith: (promise: Promise<Response>) => {
                handled = promise;
            },
        };
        listeners.get("fetch")?.(event);
        await handled;

        expect(open).toHaveBeenCalledWith("n0x-shell-v4");
        expect(put).toHaveBeenCalledOnce();

        response = new Response("broken", { status: 500 });
        put.mockClear();
        listeners.get("fetch")?.(event);
        await handled;

        expect(put).not.toHaveBeenCalled();
    });

    it("uses the offline page instead of serving the chat shell under an unrelated URL", async () => {
        const listeners = new Map<string, (event: any) => void>();
        const offline = new Response("offline", { status: 200 });
        const match = vi.fn(async (key: string) => (key === "/offline.html" ? offline : undefined));
        const workerSource = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

        vm.runInNewContext(workerSource, {
            self: {
                addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener),
                skipWaiting: vi.fn(),
                clients: { claim: vi.fn() },
                location: { origin: "https://n0x.test" },
            },
            caches: { open: vi.fn(), match, keys: vi.fn(), delete: vi.fn() },
            fetch: vi.fn(async () => {
                throw new TypeError("offline");
            }),
            Promise,
            Request,
            Response,
            Set,
            URL,
        });

        let handled: Promise<Response> | undefined;
        listeners.get("fetch")?.({
            request: { url: "https://n0x.test/privacy", method: "GET", mode: "navigate" },
            respondWith: (promise: Promise<Response>) => {
                handled = promise;
            },
        });

        await expect(handled).resolves.toBe(offline);
        expect(match.mock.calls.map(([key]) => key)).toEqual(["/privacy", "/offline.html"]);
        expect(match).not.toHaveBeenCalledWith("/chat");
    });

    it("returns fresh pages and assets when a cache write is denied", async () => {
        const listeners = new Map<string, (event: any) => void>();
        const put = vi.fn(async () => {
            throw new DOMException("quota", "QuotaExceededError");
        });
        const freshPage = new Response("fresh page", { status: 200 });
        const freshAsset = new Response("fresh asset", { status: 200 });
        const fetch = vi.fn().mockResolvedValueOnce(freshPage).mockResolvedValueOnce(freshAsset);
        const workerSource = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

        vm.runInNewContext(workerSource, {
            self: {
                addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener),
                skipWaiting: vi.fn(),
                clients: { claim: vi.fn() },
                location: { origin: "https://n0x.test" },
            },
            caches: {
                open: vi.fn(async () => ({ put })),
                match: vi.fn(async () => undefined),
                keys: vi.fn(),
                delete: vi.fn(),
            },
            fetch,
            Promise,
            Request,
            Response,
            Set,
            URL,
        });

        const handle = (request: { url: string; method: string; mode: string }) => {
            let handled: Promise<Response> | undefined;
            listeners.get("fetch")?.({ request, respondWith: (promise: Promise<Response>) => (handled = promise) });
            return handled!;
        };

        await expect(handle({ url: "https://n0x.test/chat", method: "GET", mode: "navigate" })).resolves.toBe(
            freshPage
        );
        await expect(
            handle({ url: "https://n0x.test/_next/static/app.js", method: "GET", mode: "cors" })
        ).resolves.toBe(freshAsset);
        expect(put).toHaveBeenCalledTimes(2);
    });
});
