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
        browser: {
            configured: true,
            ready: true,
            model: browserModel,
            modelLabel: "Browser Model",
            contextWindow: 8_192,
            maxOutputTokens: 1_536,
            revision: 4,
        },
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
                pythonEnabled: true,
            })
        ).toEqual({
            mode: "agent",
            sourceFlags: { search: false, documents: true, memory: false, agent: true, python: true },
        });

        expect(
            getExecutionRequestOptions({
                message: "Generate an image of a private workstation",
                agentEnabled: true,
                deepSearchEnabled: true,
                hasDocuments: true,
                memoryEnabled: true,
                pythonEnabled: true,
            })
        ).toEqual({
            mode: "agent",
            sourceFlags: { search: true, documents: true, memory: true, agent: true, python: true },
        });

        expect(
            getExecutionRequestOptions({
                message: "Generate an image of a private workstation",
                agentEnabled: false,
                deepSearchEnabled: false,
                hasDocuments: false,
                memoryEnabled: false,
                pythonEnabled: false,
            })
        ).toEqual({
            mode: "direct",
            sourceFlags: { search: false, documents: false, memory: false, agent: false, python: false },
        });
    });

    it("pins readiness to the planned model and derives observed metadata from that immutable plan", () => {
        const plan = createExecutionPlan({
            requestId: "req-1",
            conversationId: "conv-1",
            message: "Summarize my document",
            selectedProvider: "browser",
            providers: providers(),
            sourceFlags: { search: false, documents: true, memory: false, agent: false, python: false },
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
            contextBudget: 6_656,
            contextWindow: 8_192,
            outputReserve: 1_536,
            maxOutputTokens: 1_536,
            usedSearch: true,
            usedDocs: true,
            usedMemory: true,
            usedPython: false,
            agent: false,
        });
        expect(Object.isFrozen(plan)).toBe(true);
        expect(Object.isFrozen(plan.sourceFlags)).toBe(true);
        expect(plan).toMatchObject({ providerRevision: 4, contextWindow: 8_192, maxOutputTokens: 1_536 });
    });

    it("keeps local Python local while recording observed Python use", () => {
        const snapshot = providers();
        const plan = createExecutionPlan({
            requestId: "req-python",
            conversationId: "conv-python",
            message: "calculate",
            selectedProvider: "browser",
            providers: snapshot,
            sourceFlags: { search: false, documents: false, memory: false, agent: true, python: true },
            conversationLength: 0,
            autoRouteEnabled: false,
            mode: "agent",
        });

        const changedSnapshot: ExecutionProviderSnapshot = {
            ...snapshot,
            browser: { ...snapshot.browser, contextWindow: 1 },
        };
        expect(plan).toMatchObject({ privacy: "local", contextWindow: 8_192, contextBudget: 6_656 });
        expect(changedSnapshot.browser.contextWindow).toBe(1);
        expect(executionPlanToMessageMeta(plan, { python: true })).toMatchObject({
            privacy: "local",
            usedPython: true,
        });
        expect(
            getExecutionReadiness(plan, {
                ...providers(),
                browser: { ...providers().browser, revision: 5 },
            })
        ).toEqual({ ready: false, reason: "provider-changed" });
    });

    it("never satisfies an automatic local route with a remote Ollama endpoint", () => {
        const remoteOnly: ExecutionProviderSnapshot = {
            browser: { configured: false, ready: false, model: null },
            ollama: {
                configured: true,
                ready: true,
                model: "remote-ollama",
                networked: true,
                endpoint: "https://ollama.example",
            },
            cloud: { configured: true, ready: true, model: "cloud-model", networked: true },
            "chrome-ai": { configured: false, ready: false, model: null },
        };
        const input = {
            requestId: "req-remote-ollama",
            conversationId: "conv-remote-ollama",
            message: "What is RAG?",
            selectedProvider: "ollama" as const,
            providers: remoteOnly,
            sourceFlags: { search: false, documents: false, memory: false, agent: false, python: false },
            conversationLength: 0,
            mode: "direct" as const,
        };

        expect(createExecutionPlan({ ...input, autoRouteEnabled: true })).toMatchObject({
            route: "cloud",
            provider: "cloud",
            privacy: "cloud",
        });
        expect(createExecutionPlan({ ...input, autoRouteEnabled: false })).toMatchObject({
            route: "default",
            provider: "ollama",
            privacy: "mixed",
        });
    });
});
