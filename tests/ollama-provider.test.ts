import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOllama } from "@/lib/providers/useOllama";

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
        });
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
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(body, { status: 200 }))
        );
        const onToken = vi.fn();

        const response = await useOllama.getState().generate([{ role: "user", content: "hello" }], onToken);

        expect(response).toBe("hello world");
        expect(onToken.mock.calls.map(([token]) => token)).toEqual(["hello", " world"]);
        expect(useOllama.getState().status).toBe("ready");
        expect(useOllama.getState().stats.totalTokens).toBe(2);
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
});
