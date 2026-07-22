import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChromeAI } from "@/lib/providers/useChromeAI";

const promptStreaming = vi.fn();
const runtimeSession = { promptStreaming };
const languageModel = {
    availability: vi.fn(async () => "available"),
    create: vi.fn(async () => runtimeSession),
};

describe("Chrome AI provider generation", () => {
    beforeEach(() => {
        promptStreaming.mockReset();
        languageModel.create.mockClear();
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
        expect(useChromeAI.getState().status).toBe("ready");
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

        const generation = useChromeAI.getState().generate([{ role: "user", content: "Keep going" }]);
        await firstChunkRead;
        expect(useChromeAI.getState().status).toBe("generating");
        useChromeAI.getState().stop();

        await expect(generation).rejects.toMatchObject({ name: "AbortError" });
        expect(abortObserved).toBe(true);
        expect(promptSignal?.aborted).toBe(true);
        expect(useChromeAI.getState().status).toBe("ready");
    });
});
