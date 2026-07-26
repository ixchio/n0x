import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChromeAI } from "@/lib/providers/useChromeAI";

const promptStreaming = vi.fn();
const destroy = vi.fn();
const runtimeSession = { promptStreaming, destroy };
const languageModel = {
    availability: vi.fn(async () => "available"),
    create: vi.fn(async () => runtimeSession),
};

describe("Chrome AI provider generation", () => {
    beforeEach(() => {
        useChromeAI.getState().stop();
        promptStreaming.mockReset();
        destroy.mockReset();
        languageModel.availability.mockReset().mockResolvedValue("available");
        languageModel.create.mockReset().mockResolvedValue(runtimeSession);
        vi.stubGlobal("LanguageModel", languageModel);
        useChromeAI.setState({ status: "ready", isSupported: true, error: null });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("streams cumulative Prompt API chunks as response deltas", async () => {
        promptStreaming.mockResolvedValue(
            (async function* () {
                yield "Hel";
                yield "Hello";
                yield "Hello world";
            })()
        );
        const onToken = vi.fn();

        const response = await useChromeAI.getState().generate([{ role: "user", content: "Say hello" }], onToken);

        expect(response).toBe("Hello world");
        expect(onToken.mock.calls.map(([token]) => token)).toEqual(["Hel", "lo", " world"]);
        expect(promptStreaming).toHaveBeenCalledWith(
            "User: Say hello\nAssistant:",
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
        expect(destroy).toHaveBeenCalledOnce();
        expect(useChromeAI.getState().status).toBe("ready");
    });

    it("uses and destroys a fresh Prompt API session for every conversation", async () => {
        const firstPrompt = vi.fn().mockResolvedValue(
            (async function* () {
                yield "first response";
            })()
        );
        const secondPrompt = vi.fn().mockResolvedValue(
            (async function* () {
                yield "second response";
            })()
        );
        const firstDestroy = vi.fn();
        const secondDestroy = vi.fn();
        languageModel.create
            .mockResolvedValueOnce({ promptStreaming: firstPrompt, destroy: firstDestroy })
            .mockResolvedValueOnce({ promptStreaming: secondPrompt, destroy: secondDestroy });

        await useChromeAI.getState().generate([{ role: "user", content: "Conversation one" }]);
        await useChromeAI.getState().generate([{ role: "user", content: "Conversation two" }]);

        expect(languageModel.create).toHaveBeenCalledTimes(2);
        expect(firstPrompt).toHaveBeenCalledWith(
            "User: Conversation one\nAssistant:",
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
        expect(secondPrompt).toHaveBeenCalledWith(
            "User: Conversation two\nAssistant:",
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
        expect(firstDestroy).toHaveBeenCalledOnce();
        expect(secondDestroy).toHaveBeenCalledOnce();
    });

    it("aborts the active Prompt API signal and rejects the blocked stream", async () => {
        let promptSignal: AbortSignal | undefined;
        let abortObserved = false;
        let firstChunk!: () => void;
        const firstChunkRead = new Promise<void>(resolve => {
            firstChunk = resolve;
        });

        promptStreaming.mockImplementation(async (_prompt: string, options: { signal: AbortSignal }) => {
            promptSignal = options.signal;
            return (async function* () {
                yield "partial";
                firstChunk();
                await new Promise<never>((_resolve, reject) => {
                    options.signal.addEventListener("abort", () => {
                        abortObserved = true;
                        reject(new DOMException("The operation was aborted", "AbortError"));
                    });
                });
            })();
        });

        const requestController = new AbortController();
        const generation = useChromeAI.getState().generate([{ role: "user", content: "Keep going" }], undefined, {
            requestId: "chrome-active",
            model: "gemini-nano",
            maxTokens: 100,
            signal: requestController.signal,
        });
        await firstChunkRead;
        expect(useChromeAI.getState().status).toBe("generating");
        useChromeAI.getState().stop("different-request");
        expect(promptSignal?.aborted).toBe(false);
        expect(useChromeAI.getState().status).toBe("generating");
        useChromeAI.getState().stop("chrome-active");

        await expect(generation).rejects.toMatchObject({ name: "AbortError" });
        expect(abortObserved).toBe(true);
        expect(promptSignal?.aborted).toBe(true);
        expect(destroy).toHaveBeenCalledOnce();
        expect(useChromeAI.getState().status).toBe("ready");
    });

    it("rejects when an aborted Prompt API stream ends cleanly", async () => {
        let firstChunk!: () => void;
        let finishStream!: () => void;
        const firstChunkRead = new Promise<void>(resolve => {
            firstChunk = resolve;
        });
        const streamCanFinish = new Promise<void>(resolve => {
            finishStream = resolve;
        });
        promptStreaming.mockResolvedValue(
            (async function* () {
                yield "partial";
                firstChunk();
                await streamCanFinish;
            })()
        );

        const generation = useChromeAI.getState().generate([{ role: "user", content: "Stop cleanly" }]);
        await firstChunkRead;
        useChromeAI.getState().stop();
        finishStream();

        await expect(generation).rejects.toMatchObject({ name: "AbortError" });
        expect(destroy).toHaveBeenCalledOnce();
        expect(useChromeAI.getState().status).toBe("ready");
    });

    it("destroys a session that finishes creating after generation was stopped", async () => {
        let resolveSession!: (session: typeof runtimeSession) => void;
        const pendingSession = new Promise<typeof runtimeSession>(resolve => {
            resolveSession = resolve;
        });
        languageModel.create.mockReturnValueOnce(pendingSession);

        const generation = useChromeAI.getState().generate([{ role: "user", content: "Never prompt" }]);
        expect(useChromeAI.getState().status).toBe("generating");

        useChromeAI.getState().stop();
        resolveSession(runtimeSession);

        await expect(generation).rejects.toMatchObject({ name: "AbortError" });
        expect(promptStreaming).not.toHaveBeenCalled();
        expect(destroy).toHaveBeenCalledOnce();
        expect(useChromeAI.getState().status).toBe("ready");
    });

    it("probes a downloadable model without starting a surprise download", async () => {
        vi.stubGlobal("window", {});
        languageModel.availability.mockResolvedValueOnce("downloadable");

        await useChromeAI.getState().init();

        expect(languageModel.create).not.toHaveBeenCalled();
        expect(destroy).not.toHaveBeenCalled();
        expect(useChromeAI.getState()).toMatchObject({ status: "downloadable", isSupported: true, error: null });
    });

    it("downloads only after an explicit Chrome AI load action and destroys the setup session", async () => {
        vi.stubGlobal("window", {});
        languageModel.availability.mockResolvedValueOnce("downloadable");

        await useChromeAI.getState().load();

        expect(languageModel.create).toHaveBeenCalledOnce();
        expect(destroy).toHaveBeenCalledOnce();
        expect(useChromeAI.getState()).toMatchObject({ status: "ready", isSupported: true, error: null });
    });
});
