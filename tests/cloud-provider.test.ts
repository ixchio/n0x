import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    CLOUD_GENERATION_TIMEOUT_MS,
    CLOUD_MODEL_LIST_MAX_ITEMS,
    CLOUD_STREAM_LINE_MAX_CHARS,
    GROQ_SAFE_MAX_OUTPUT_TOKENS,
    GROQ_SAFE_REQUEST_TOKENS,
    cloudHttpErrorMessage,
    identifyCloudProvider,
    normalizeCloudBaseUrl,
    useCloudAI,
} from "@/lib/providers/useCloudAI";

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
            contextWindow: 8_192,
            maxOutputTokens: 512,
            configurationRevision: 10,
            modelLimits: {},
        });
    });

    afterEach(() => {
        useCloudAI.getState().stop();
        vi.useRealTimers();
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

        const requestController = new AbortController();
        const response = await useCloudAI.getState().generate([{ role: "user", content: "hello" }], onToken, {
            requestId: "cloud-stream",
            model: "test-model",
            maxTokens: 77,
            signal: requestController.signal,
        });

        expect(response).toBe("hello world");
        expect(onToken.mock.calls.map(([token]) => token)).toEqual(["hello", " world"]);
        expect(useCloudAI.getState().stats.totalTokens).toBe(2);
        expect(useCloudAI.getState().status).toBe("ready");

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://cloud.example/v1/chat/completions");
        expect(init.headers).toMatchObject({ Authorization: "Bearer session-key" });
        expect(JSON.parse(String(init.body))).toMatchObject({ model: "test-model", stream: true, max_tokens: 77 });
    });

    it("caps Groq output requests below account-level token limits", async () => {
        useCloudAI.setState({
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: "groq-key",
            models: ["llama-3.3-70b-versatile"],
            loadedModel: "llama-3.3-70b-versatile",
            contextWindow: 131_072,
            maxOutputTokens: 32_768,
            modelLimits: {
                "llama-3.3-70b-versatile": { contextWindow: 131_072, maxOutputTokens: 32_768 },
            },
        });
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'));
                controller.close();
            },
        });
        const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await useCloudAI.getState().generate([{ role: "user", content: "hello" }], undefined, {
            requestId: "groq-cap",
            model: "llama-3.3-70b-versatile",
            maxTokens: 32_768,
            signal: new AbortController().signal,
        });

        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        const request = JSON.parse(String(init.body));
        expect(request.max_tokens).toBe(GROQ_SAFE_MAX_OUTPUT_TOKENS);
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

    it("canonicalizes known provider endpoints and rejects unsafe or blank values", () => {
        expect(normalizeCloudBaseUrl("https://cloud.example/v1/chat/completions/")).toBe("https://cloud.example/v1");
        expect(normalizeCloudBaseUrl("http://localhost:8080/v1/models")).toBe("http://localhost:8080/v1");
        expect(normalizeCloudBaseUrl("https://api.groq.com/v1/chat/completions")).toBe(
            "https://api.groq.com/openai/v1"
        );
        expect(normalizeCloudBaseUrl("https://openrouter.ai/models")).toBe("https://openrouter.ai/api/v1");
        expect(normalizeCloudBaseUrl("https://api.openai.com")).toBe("https://api.openai.com/v1");
        expect(() => normalizeCloudBaseUrl("   ")).toThrow(/required/i);
        expect(() => normalizeCloudBaseUrl("http://cloud.example/v1")).toThrow(/must use HTTPS/i);
        expect(() => normalizeCloudBaseUrl("https://key:secret@cloud.example/v1")).toThrow(/credentials/i);
        expect(identifyCloudProvider("https://api.groq.com/openai/v1")).toBe("groq");
        expect(identifyCloudProvider("https://api.groq.com.evil.example/v1")).toBe("generic");
    });

    it("clears endpoint-scoped models and limits when switching providers", () => {
        useCloudAI.setState({
            models: ["old-provider-model"],
            loadedModel: "old-provider-model",
            modelLimits: { "old-provider-model": { contextWindow: 99_999, maxOutputTokens: 9_999 } },
            contextWindow: 99_999,
            maxOutputTokens: 9_999,
        });

        useCloudAI.getState().setCredentials("https://openrouter.ai/api/v1", "");

        expect(useCloudAI.getState()).toMatchObject({
            baseUrl: "https://openrouter.ai/api/v1",
            models: [],
            loadedModel: null,
            modelLimits: {},
            contextWindow: 32_768,
            maxOutputTokens: 2_048,
        });

        useCloudAI.getState().setCredentials("https://api.groq.com", "");
        expect(useCloudAI.getState()).toMatchObject({
            baseUrl: "https://api.groq.com/openai/v1",
            loadedModel: "llama-3.3-70b-versatile",
            contextWindow: GROQ_SAFE_REQUEST_TOKENS,
            maxOutputTokens: GROQ_SAFE_MAX_OUTPUT_TOKENS,
        });
    });

    it("filters non-text OpenRouter models and reads nested provider limits", async () => {
        useCloudAI.setState({
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: "openrouter-key",
            models: [],
            loadedModel: null,
            modelLimits: {},
            configurationRevision: 30,
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            data: [
                                {
                                    id: "meta-llama/text-chat",
                                    architecture: {
                                        input_modalities: ["text", "image"],
                                        output_modalities: ["text"],
                                    },
                                    context_length: 16_384,
                                    top_provider: { max_completion_tokens: 768 },
                                    supported_parameters: ["max_tokens"],
                                },
                                {
                                    id: "canopylabs/orpheus-arabic-saudi",
                                    architecture: { input_modalities: ["text"], output_modalities: ["audio"] },
                                },
                                {
                                    id: "openai/text-embedding-3-small",
                                    architecture: { input_modalities: ["text"], output_modalities: ["embedding"] },
                                },
                                {
                                    id: "image/provider-model",
                                    architecture: { modality: "text->image" },
                                },
                            ],
                        }),
                        { status: 200 }
                    )
            )
        );

        await useCloudAI.getState().fetchModels();

        expect(useCloudAI.getState()).toMatchObject({
            models: ["meta-llama/text-chat"],
            loadedModel: "meta-llama/text-chat",
            contextWindow: 16_384,
            maxOutputTokens: 768,
        });
        expect(useCloudAI.getState().modelLimits["meta-llama/text-chat"]).toMatchObject({
            contextWindow: 16_384,
            maxOutputTokens: 768,
            supportedParameters: ["max_tokens"],
        });

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'));
                controller.close();
            },
        });
        const generationFetch = vi.fn(async () => new Response(stream, { status: 200 }));
        vi.stubGlobal("fetch", generationFetch);
        await useCloudAI.getState().generate([{ role: "user", content: "hello" }]);
        const [, generationInit] = generationFetch.mock.calls[0] as unknown as [string, RequestInit];
        const requestBody = JSON.parse(String(generationInit.body));
        expect(requestBody).toMatchObject({ max_tokens: 768 });
        expect(requestBody).not.toHaveProperty("temperature");
        expect(requestBody).not.toHaveProperty("top_p");
    });

    it("ignores a stale model response after endpoint credentials change", async () => {
        let resolveOld!: (response: Response) => void;
        const oldResponse = new Promise<Response>(resolve => (resolveOld = resolve));
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string) => {
                if (url.startsWith("https://old.example")) return oldResponse;
                return Promise.resolve(
                    new Response(JSON.stringify({ data: [{ id: "new-model", context_window: 16_384 }] }), {
                        status: 200,
                    })
                );
            })
        );
        useCloudAI.setState({ baseUrl: "https://old.example/v1", apiKey: "old-key", configurationRevision: 20 });
        const stale = useCloudAI.getState().fetchModels();
        await Promise.resolve();

        useCloudAI.setState({ baseUrl: "https://new.example/v1", apiKey: "new-key", configurationRevision: 21 });
        await useCloudAI.getState().fetchModels();
        resolveOld(new Response(JSON.stringify({ data: [{ id: "stale-model" }] }), { status: 200 }));
        await stale;

        expect(useCloudAI.getState().models).toEqual(["new-model"]);
        expect(useCloudAI.getState().loadedModel).toBe("new-model");
        expect(useCloudAI.getState().contextWindow).toBe(16_384);
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

        const generation = useCloudAI.getState().generate([{ role: "user", content: "slow" }]);
        const rejection = expect(generation).rejects.toMatchObject({ name: "TimeoutError" });
        await vi.advanceTimersByTimeAsync(CLOUD_GENERATION_TIMEOUT_MS);
        await rejection;
        expect(useCloudAI.getState().error).toMatch(/timed out/i);
        expect(useCloudAI.getState().status).toBe("ready");
    });

    it("rejects a malicious never-newline stream before its buffer can grow unbounded", async () => {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("x".repeat(CLOUD_STREAM_LINE_MAX_CHARS + 1)));
                controller.close();
            },
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(body, { status: 200 }))
        );

        await expect(useCloudAI.getState().generate([{ role: "user", content: "hello" }])).rejects.toThrow(
            /stream line exceeded/i
        );
        expect(useCloudAI.getState().status).toBe("ready");
    });

    it("rejects an oversized discovered model list", async () => {
        const data = Array.from({ length: CLOUD_MODEL_LIST_MAX_ITEMS + 1 }, (_, index) => ({ id: `model-${index}` }));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 }))
        );

        await useCloudAI.getState().fetchModels();

        expect(useCloudAI.getState().error).toMatch(/model limit/i);
        expect(useCloudAI.getState().fetchingModels).toBe(false);
    });

    it("reports safe provider-specific 400 and 413 guidance", async () => {
        const reflected = "session-key :: private prompt contents";
        useCloudAI.setState({
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: "session-key",
            models: ["llama-3.3-70b-versatile"],
            loadedModel: "llama-3.3-70b-versatile",
            maxOutputTokens: GROQ_SAFE_MAX_OUTPUT_TOKENS,
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(JSON.stringify({ error: { message: reflected } }), {
                        status: 413,
                        headers: { "content-type": "application/json" },
                    })
            )
        );

        await expect(
            useCloudAI.getState().generate([{ role: "user", content: "private prompt contents" }])
        ).rejects.toThrow(/Groq rejected the request as too large \(413\)/i);
        expect(useCloudAI.getState().error).not.toContain("session-key");
        expect(useCloudAI.getState().error).not.toContain("private prompt");

        expect(cloudHttpErrorMessage(400, "https://openrouter.ai/api/v1")).toMatch(/Choose a text-chat model/i);
        expect(cloudHttpErrorMessage(400, "https://openrouter.ai/api/v1")).not.toMatch(/API key/i);
    });

    it("never persists an upstream-controlled error that reflects secrets or prompts", async () => {
        const reflected = "session-key :: private prompt contents\nset-cookie: stolen";
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(JSON.stringify({ error: { message: reflected } }), {
                        status: 401,
                        headers: { "content-type": "application/json" },
                    })
            )
        );

        await expect(
            useCloudAI.getState().generate([{ role: "user", content: "private prompt contents" }])
        ).rejects.toThrow(cloudHttpErrorMessage(401));
        expect(useCloudAI.getState().error).toBe(cloudHttpErrorMessage(401));
        expect(useCloudAI.getState().error).not.toContain("session-key");
        expect(useCloudAI.getState().error).not.toContain("private prompt");
    });
});
