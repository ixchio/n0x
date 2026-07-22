import { describe, expect, it } from "vitest";
import {
    createExecutionPlan,
    executionPlanToMessageMeta,
    getExecutionReadiness,
    type ExecutionProviderSnapshot,
} from "@/lib/chat/executionPlan";
import { getExecutionRequestOptions } from "@/lib/chat/executionRequest";

function providers(browserModel = "browser-model"): ExecutionProviderSnapshot {
    return {
        browser: { configured: true, ready: true, model: browserModel, modelLabel: "Browser Model" },
        ollama: { configured: false, ready: false, model: null },
        cloud: { configured: false, ready: false, model: null, networked: true },
        "chrome-ai": { configured: false, ready: false, model: null },
    };
}

describe("execution plan readiness and message metadata", () => {
    it("captures explicit tool paths before the immutable plan is created", () => {
        expect(
            getExecutionRequestOptions({
                message: "Research this with my notes",
                agentEnabled: true,
                deepSearchEnabled: false,
                hasDocuments: true,
                memoryEnabled: false,
            })
        ).toEqual({
            mode: "agent",
            sourceFlags: { search: false, documents: true, memory: false, agent: true },
        });

        expect(
            getExecutionRequestOptions({
                message: "Generate an image of a private workstation",
                agentEnabled: true,
                deepSearchEnabled: true,
                hasDocuments: true,
                memoryEnabled: true,
            })
        ).toEqual({
            mode: "image",
            sourceFlags: { search: false, documents: false, memory: false, agent: false },
        });
    });

    it("pins readiness to the planned model and derives observed metadata from that immutable plan", () => {
        const plan = createExecutionPlan({
            requestId: "req-1",
            conversationId: "conv-1",
            message: "Summarize my document",
            selectedProvider: "browser",
            providers: providers(),
            sourceFlags: { search: false, documents: true, memory: false, agent: false },
            conversationLength: 1,
            autoRouteEnabled: false,
            mode: "direct",
        });

        expect(getExecutionReadiness(plan, providers())).toEqual({ ready: true });
        expect(getExecutionReadiness(plan, providers("replacement-model"))).toEqual({
            ready: false,
            reason: "model-changed",
        });
        expect(
            getExecutionReadiness(plan, {
                ...providers(),
                browser: { ...providers().browser, ready: false },
            })
        ).toEqual({ ready: false, reason: "provider-not-ready" });

        expect(executionPlanToMessageMeta(plan, { search: true, memory: true })).toEqual({
            requestId: "req-1",
            conversationId: "conv-1",
            provider: "browser",
            providerLabel: "WebGPU",
            modelName: "Browser Model",
            privacy: "mixed",
            route: "default",
            routeReason: "automatic routing disabled",
            contextBudget: 3_500,
            usedSearch: true,
            usedDocs: true,
            usedMemory: true,
            agent: false,
        });
        expect(Object.isFrozen(plan)).toBe(true);
        expect(Object.isFrozen(plan.sourceFlags)).toBe(true);
    });
});
