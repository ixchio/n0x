import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCloudAI } from "@/lib/providers/useCloudAI";

describe("Cloud API provider generation", () => {
    beforeEach(() => {
        useCloudAI.setState({
            status: "ready",
            models: ["test-model"],
            loadedModel: "test-model",
            error: null,
            isSupported: true,
            stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 },
            baseUrl: "https://cloud.example/v1",
            apiKey: "session-key",
            fetchingModels: false,
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reassembles SSE split across transport chunks and emits each delta", async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hel'));
                controller.enqueue(
                    encoder.encode('lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n')
                );
                controller.close();
            },
        });
        const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const onToken = vi.fn();

        const response = await useCloudAI.getState().generate([{ role: "user", content: "hello" }], onToken);

        expect(response).toBe("hello world");
        expect(onToken.mock.calls.map(([token]) => token)).toEqual(["hello", " world"]);
        expect(useCloudAI.getState().stats.totalTokens).toBe(2);
        expect(useCloudAI.getState().status).toBe("ready");

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://cloud.example/v1/chat/completions");
        expect(init.headers).toMatchObject({ Authorization: "Bearer session-key" });
        expect(JSON.parse(String(init.body))).toMatchObject({ model: "test-model", stream: true });
    });

    it("aborts the in-flight fetch and restores ready state", async () => {
        let requestSignal: AbortSignal | undefined;
        let abortObserved = false;
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init?: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        requestSignal = init?.signal ?? undefined;
                        requestSignal?.addEventListener("abort", () => {
                            abortObserved = true;
                            reject(new DOMException("The operation was aborted", "AbortError"));
                        });
                    })
            )
        );

        const generation = useCloudAI.getState().generate([{ role: "user", content: "hello" }]);
        expect(useCloudAI.getState().status).toBe("generating");
        useCloudAI.getState().stop();

        await expect(generation).rejects.toMatchObject({ name: "AbortError" });
        expect(abortObserved).toBe(true);
        expect(requestSignal?.aborted).toBe(true);
        expect(useCloudAI.getState().status).toBe("ready");
    });
});
