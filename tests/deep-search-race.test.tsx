// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeepSearch } from "@/lib/retrieval/useDeepSearch";

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(next => {
        resolve = next;
    });
    return { promise, resolve };
}

function searchPayload(query: string) {
    return {
        results: [{ title: query, url: `https://example.test/${query}`, snippet: query }],
        content: [`content:${query}`],
        sources: [`https://example.test/${query}`],
        summary: `summary:${query}`,
        query,
        refinedQuery: query,
        providerStatus: [],
    };
}

describe("deep-search request pinning", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("does not let an older parsed response overwrite a newer search", async () => {
        const oldBody = deferred<any>();
        const newBody = deferred<any>();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, json: () => oldBody.promise })
            .mockResolvedValueOnce({ ok: true, json: () => newBody.promise });
        vi.stubGlobal("fetch", fetchMock);

        const { result } = renderHook(() => useDeepSearch());
        let oldSearch!: Promise<unknown>;
        let newSearch!: Promise<unknown>;

        await act(async () => {
            oldSearch = result.current.search("old-query");
            await Promise.resolve();
            newSearch = result.current.search("new-query");
            await Promise.resolve();
        });

        await act(async () => {
            newBody.resolve(searchPayload("new-query"));
            await newSearch;
        });
        expect(result.current.query).toBe("new-query");
        expect(result.current.summary).toBe("summary:new-query");

        await act(async () => {
            oldBody.resolve(searchPayload("old-query"));
            await oldSearch;
        });
        expect(result.current.query).toBe("new-query");
        expect(result.current.summary).toBe("summary:new-query");
    });

    it("does not resurrect a result after Stop", async () => {
        const body = deferred<any>();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }));
        const { result } = renderHook(() => useDeepSearch());
        let search!: Promise<unknown>;

        await act(async () => {
            search = result.current.search("stopped-query");
            await Promise.resolve();
        });
        act(() => result.current.stop());
        expect(result.current.phase).toBe("idle");
        expect(result.current.isActive).toBe(false);

        await act(async () => {
            body.resolve(searchPayload("stopped-query"));
            await search;
        });
        expect(result.current.phase).toBe("idle");
        expect(result.current.results).toEqual([]);
    });

    it("threads a parent tool cancellation into the underlying fetch", async () => {
        let fetchSignal: AbortSignal | undefined;
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init?: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        fetchSignal = init?.signal ?? undefined;
                        fetchSignal?.addEventListener(
                            "abort",
                            () => reject(new DOMException("stopped", "AbortError")),
                            { once: true }
                        );
                    })
            )
        );
        const controller = new AbortController();
        const { result } = renderHook(() => useDeepSearch());
        let search!: Promise<unknown>;

        await act(async () => {
            search = result.current.search("cancelled-tool-query", controller.signal);
            await Promise.resolve();
        });
        controller.abort();
        await act(async () => {
            await expect(search).resolves.toBeNull();
        });

        expect(fetchSignal?.aborted).toBe(true);
    });
});
