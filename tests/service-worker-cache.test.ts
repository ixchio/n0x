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
            "n0x-v2",
            "n0x-shell-v3",
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

        expect(deleteCache.mock.calls.map(([name]) => name)).toEqual(["n0x-shell-v2", "n0x-v2"]);
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
});
