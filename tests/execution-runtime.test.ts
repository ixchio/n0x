import { afterEach, describe, expect, it, vi } from "vitest";
import { createExecutionPlan, type ExecutionProviderSnapshot } from "@/lib/chat/executionPlan";
import { createActiveExecutionRuntime } from "@/lib/chat/executionRuntime";
import { useWebLLM } from "@/lib/providers/useWebLLM";

const originalGenerate = useWebLLM.getState().generate;
const originalStop = useWebLLM.getState().stop;

function snapshot(): ExecutionProviderSnapshot {
    return {
        browser: {
            configured: true,
            ready: true,
            model: "pinned-model",
            modelLabel: "Pinned Model",
            contextWindow: 8_192,
            maxOutputTokens: 1_024,
            revision: 7,
            networked: false,
        },
        ollama: { configured: false, ready: false, model: null },
        cloud: { configured: false, ready: false, model: null, networked: true },
        "chrome-ai": { configured: false, ready: false, model: null },
    };
}

describe("active execution runtime pinning", () => {
    afterEach(() => {
        useWebLLM.setState({
            generate: originalGenerate,
            stop: originalStop,
            status: "unloaded",
            loadedModel: null,
            runtimeRevision: 0,
        });
    });

    it("passes only plan-pinned model, request, and output limits to the captured provider runtime", async () => {
        const generate = vi.fn(async () => "pinned response");
        const stop = vi.fn();
        useWebLLM.setState({
            generate,
            stop,
            status: "ready",
            loadedModel: "pinned-model",
            contextWindow: 8_192,
            maxOutputTokens: 1_024,
            runtimeRevision: 7,
        });
        const plan = createExecutionPlan({
            requestId: "req-pinned",
            conversationId: "conv-pinned",
            message: "hello",
            selectedProvider: "browser",
            providers: snapshot(),
            sourceFlags: { search: false, documents: false, memory: false, agent: false, python: false },
            conversationLength: 0,
            autoRouteEnabled: false,
            mode: "direct",
        });
        const runtime = createActiveExecutionRuntime(plan);

        await expect(runtime.generate?.([{ role: "user", content: "hello" }])).resolves.toBe("pinned response");
        expect(generate).toHaveBeenCalledWith(
            [{ role: "user", content: "hello" }],
            undefined,
            expect.objectContaining({
                requestId: "req-pinned",
                model: "pinned-model",
                maxTokens: 1_024,
                signal: runtime.requestSignal,
            })
        );
        expect(runtime.plan.conversationId).toBe("conv-pinned");

        useWebLLM.setState({ loadedModel: "replacement-model" });
        await expect(runtime.generate?.([{ role: "user", content: "do not reroute" }])).rejects.toThrow(
            "selected model changed"
        );
        expect(generate).toHaveBeenCalledOnce();

        runtime.stop();
        expect(stop).toHaveBeenCalledExactlyOnceWith("req-pinned");
        expect(runtime.requestSignal.aborted).toBe(true);
    });
});
