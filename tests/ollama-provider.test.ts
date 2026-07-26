import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    normalizeOllamaBaseUrl,
    OLLAMA_GENERATION_TIMEOUT_MS,
    OLLAMA_MODEL_LIST_MAX_ITEMS,
    OLLAMA_STREAM_LINE_MAX_CHARS,
    useOllama,
} from "@/lib/providers/useOllama";

describe("Ollama provider generation", () => {
    beforeEach(() => {
        useOllama.setState({
            status: "ready",
            models: [{ name: "test-model", size: 1 }],
            loadedModel: "test-model",
            error: null,
            isSupported: true,
            stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 },
            baseUrl: "http://localhost:11434",
            pollInterval: null,
            contextWindow: 8_192,
            maxOutputTokens: 512,
            configurationRevision: 10,
        });
    });

    afterEach(() => {
        useOllama.getState().stop();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("reassembles NDJSON split across transport chunks", async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode('{"message":{"content":"hel'));
                controller.enqueue(encoder.encode('lo"}}\n{"message":{"content":" world"}}\n'));
                controller.close();
            },
        });
        const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const onToken = vi.fn();
        const controller = new AbortController();

        const response = await useOllama.getState().generate([{ role: "user", content: "hello" }], onToken, {
            requestId: "ollama-stream",
            model: "test-model",
            maxTokens: 91,
            signal: controller.signal,
        });

        expect(response).toBe("hello world");
        expect(onToken.mock.calls.map(([token]) => token)).toEqual(["hello", " world"]);
        expect(useOllama.getState().status).toBe("ready");
        expect(useOllama.getState().stats.totalTokens).toBe(2);
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(JSON.parse(String(init.body))).toMatchObject({ options: { num_predict: 91 } });
    });

    it("aborts an in-flight request and restores ready state", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init?: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        init?.signal?.addEventListener("abort", () =>
                            reject(new DOMException("The operation was aborted", "AbortError"))
                        );
                    })
            )
        );

        const generation = useOllama.getState().generate([{ role: "user", content: "hello" }]);
        expect(useOllama.getState().status).toBe("generating");
        useOllama.getState().stop();

        await expect(generation).rejects.toMatchObject({ name: "AbortError" });
        expect(useOllama.getState().status).toBe("ready");
    });

    it("normalizes endpoint paths and rejects plaintext remote servers", () => {
        expect(normalizeOllamaBaseUrl("http://localhost:11434/api/chat/")).toBe("http://localhost:11434");
        expect(normalizeOllamaBaseUrl("https://ollama.example/team/api/tags")).toBe("https://ollama.example/team");
        expect(() => normalizeOllamaBaseUrl("http://ollama.example:11434")).toThrow(/must use HTTPS/i);
        expect(() => normalizeOllamaBaseUrl("https://user:secret@ollama.example")).toThrow(/credentials/i);
    });

    it("ignores a stale health response after the endpoint changes", async () => {
        let resolveOld!: (response: Response) => void;
        const oldResponse = new Promise<Response>(resolve => (resolveOld = resolve));
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string) => {
                if (url.startsWith("https://old.example")) return oldResponse;
                return Promise.resolve(
                    new Response(JSON.stringify({ models: [{ name: "test-model", size: 22 }] }), { status: 200 })
                );
            })
        );
        useOllama.setState({ baseUrl: "https://old.example", configurationRevision: 20 });
        const stale = useOllama.getState().init();
        await Promise.resolve();

        useOllama.setState({ baseUrl: "https://new.example", configurationRevision: 21 });
        await useOllama.getState().init();
        resolveOld(new Response(JSON.stringify({ models: [{ name: "test-model", size: 11 }] }), { status: 200 }));
        await stale;

        expect(useOllama.getState().baseUrl).toBe("https://new.example");
        expect(useOllama.getState().models).toEqual([{ name: "test-model", size: 22 }]);
    });

    it("aborts and reports a timed-out generation", async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init?: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        init?.signal?.addEventListener(
                            "abort",
                            () => reject(new DOMException("aborted", "AbortError")),
                            { once: true }
                        );
                    })
            )
        );

        const generation = useOllama.getState().generate([{ role: "user", content: "slow" }]);
        const rejection = expect(generation).rejects.toMatchObject({ name: "TimeoutError" });
        await vi.advanceTimersByTimeAsync(OLLAMA_GENERATION_TIMEOUT_MS);
        await rejection;
        expect(useOllama.getState().error).toMatch(/timed out/i);
        expect(useOllama.getState().status).toBe("ready");
    });

    it("rejects a malicious never-newline stream before its buffer can grow unbounded", async () => {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("x".repeat(OLLAMA_STREAM_LINE_MAX_CHARS + 1)));
                controller.close();
            },
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(body, { status: 200 }))
        );

        await expect(useOllama.getState().generate([{ role: "user", content: "hello" }])).rejects.toThrow(
            /stream line exceeded/i
        );
        expect(useOllama.getState().status).toBe("ready");
    });

    it("rejects an oversized discovered model list", async () => {
        const models = Array.from({ length: OLLAMA_MODEL_LIST_MAX_ITEMS + 1 }, (_, index) => ({
            name: `model-${index}`,
            size: index,
        }));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ models }), { status: 200 }))
        );

        await useOllama.getState().init();

        expect(useOllama.getState().error).toMatch(/model limit/i);
        expect(useOllama.getState().isSupported).toBe(false);
    });
});
