import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
    const createCompletion = vi.fn();
    const interruptGenerate = vi.fn();
    const unload = vi.fn(async () => undefined);
    const engine = {
        chat: {
            config: { context_window_size: 4096 },
            completions: { create: createCompletion },
        },
        interruptGenerate,
        unload,
    };
    const createEngine = async (_model: string, options: { initProgressCallback?: (value: unknown) => void }) => {
        options.initProgressCallback?.({ progress: 1 });
        return engine;
    };
    const createWorkerEngine = vi.fn(createEngine);
    const createMainThreadEngine = vi.fn(createEngine);
    return { createCompletion, interruptGenerate, unload, engine, createWorkerEngine, createMainThreadEngine };
});

vi.mock("@mlc-ai/web-llm", () => ({
    CreateWebWorkerMLCEngine: runtime.createWorkerEngine,
    CreateMLCEngine: runtime.createMainThreadEngine,
}));

import { MODEL_LOAD_STALL_MS, WEBLLM_MODELS, useWebLLM } from "@/lib/providers/useWebLLM";

describe("browser WebLLM provider generation", () => {
    beforeAll(async () => {
        // GitHub Actions runs this suite in Node versions where browser globals
        // do not exist. Loading should skip optional hardware checks and use the
        // main-thread runtime rather than throwing a ReferenceError.
        vi.stubGlobal("navigator", undefined);
        vi.stubGlobal("Worker", undefined);
        useWebLLM.setState({ status: "unloaded", isSupported: true, error: null });
        await useWebLLM.getState().loadModel(WEBLLM_MODELS[0].id, true);
        expect(useWebLLM.getState().status).toBe("ready");
        expect(runtime.createMainThreadEngine).toHaveBeenCalledOnce();
        expect(runtime.createWorkerEngine).not.toHaveBeenCalled();
    });

    beforeEach(() => {
        runtime.createCompletion.mockReset();
        runtime.interruptGenerate.mockReset();
        useWebLLM.setState({
            status: "ready",
            error: null,
            stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 },
        });
    });

    afterAll(async () => {
        await useWebLLM.getState().unload();
        vi.unstubAllGlobals();
    });

    it("streams completion deltas through the loaded browser engine", async () => {
        runtime.createCompletion.mockResolvedValue(
            (async function* () {
                yield { choices: [{ delta: { content: "hello" } }] };
                yield { choices: [{ delta: { content: " world" } }] };
            })()
        );
        const onToken = vi.fn();

        const response = await useWebLLM.getState().generate([{ role: "user", content: "hello" }], onToken);

        expect(response).toBe("hello world");
        expect(onToken.mock.calls.map(([token]) => token)).toEqual(["hello", " world"]);
        expect(runtime.createCompletion).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: [{ role: "user", content: "hello" }],
                stream: true,
            })
        );
        expect(useWebLLM.getState().stats.totalTokens).toBe(2);
        expect(useWebLLM.getState().status).toBe("ready");
    });

    it("caps max_tokens to the loaded model's remaining context", async () => {
        runtime.createCompletion.mockResolvedValue(
            (async function* () {
                yield { choices: [{ delta: { content: "ok" } }] };
            })()
        );
        useWebLLM.setState({ contextWindow: 4_096, maxOutputTokens: 1_024 });
        const model = useWebLLM.getState().loadedModel!;
        const controller = new AbortController();

        await useWebLLM.getState().generate([{ role: "user", content: "x".repeat(14_000) }], undefined, {
            requestId: "bounded",
            model,
            maxTokens: 5_000,
            signal: controller.signal,
        });

        const options = runtime.createCompletion.mock.calls[0][0];
        expect(options.max_tokens).toBeGreaterThan(0);
        expect(options.max_tokens).toBeLessThanOrEqual(590);
        expect(options.max_tokens).toBeLessThanOrEqual(1_024);
    });

    it("interrupts GPU decoding and rejects an in-flight stream as aborted", async () => {
        let rejectPending!: (reason: unknown) => void;
        let firstChunk!: () => void;
        const firstChunkRead = new Promise<void>(resolve => {
            firstChunk = resolve;
        });
        runtime.createCompletion.mockResolvedValue(
            (async function* () {
                yield { choices: [{ delta: { content: "partial" } }] };
                firstChunk();
                await new Promise<never>((_resolve, reject) => {
                    rejectPending = reject;
                });
            })()
        );
        runtime.interruptGenerate.mockImplementation(() => {
            rejectPending(new DOMException("Generation interrupted", "AbortError"));
        });

        const generation = useWebLLM.getState().generate([{ role: "user", content: "continue" }]);
        await firstChunkRead;
        expect(useWebLLM.getState().status).toBe("generating");
        useWebLLM.getState().stop();

        await expect(generation).rejects.toMatchObject({ name: "AbortError" });
        expect(runtime.interruptGenerate).toHaveBeenCalledOnce();
        expect(useWebLLM.getState().status).toBe("ready");
    });

    it("terminates a stalled worker load and allows a clean retry", async () => {
        await useWebLLM.getState().unload();
        vi.useFakeTimers();
        const workers: Array<{ terminated: boolean; terminate: () => void }> = [];
        class FakeWorker {
            terminated = false;
            constructor() {
                workers.push(this);
            }
            terminate() {
                this.terminated = true;
            }
        }
        vi.stubGlobal("Worker", FakeWorker);
        runtime.createWorkerEngine.mockImplementationOnce((...args: any[]) => {
            args[2].initProgressCallback?.({ progress: 0.2 });
            return new Promise(() => undefined);
        });

        const loading = useWebLLM.getState().loadModel(WEBLLM_MODELS[0].id, true);
        for (let index = 0; index < 10 && runtime.createWorkerEngine.mock.calls.length === 0; index++) {
            await Promise.resolve();
        }
        await vi.advanceTimersByTimeAsync(MODEL_LOAD_STALL_MS + 1_000);
        await loading;

        expect(useWebLLM.getState().status).toBe("error");
        expect(useWebLLM.getState().error).toMatch(/stalled/i);
        expect(workers[0].terminated).toBe(true);

        runtime.createWorkerEngine.mockImplementationOnce(async (...args: any[]) => {
            args[2].initProgressCallback?.({ progress: 1 });
            return runtime.engine;
        });
        await useWebLLM.getState().loadModel(WEBLLM_MODELS[0].id, true);
        expect(useWebLLM.getState().status).toBe("ready");
        vi.useRealTimers();
    });
});
