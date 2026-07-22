"use client";

import { WEBLLM_MODELS, useWebLLM } from "@/lib/providers/useWebLLM";
import { useOllama } from "@/lib/providers/useOllama";
import { useCloudAI } from "@/lib/providers/useCloudAI";
import { useChromeAI } from "@/lib/providers/useChromeAI";
import {
    getExecutionReadiness,
    isNetworkedEndpoint,
    type ExecutionPlan,
    type ExecutionProvider,
    type ExecutionProviderSnapshot,
} from "./executionPlan";
import type { GenerateFunction } from "./executionPrompt";

interface ProviderRuntime {
    generate: GenerateFunction | null;
    stop: () => void;
}

export interface ActiveExecutionRuntime {
    readonly plan: ExecutionPlan;
    readonly generate: GenerateFunction | null;
    readonly stop: () => void;
    readonly requestSignal: AbortSignal;
    readonly imageSignal?: AbortSignal;
    observedSources: {
        search: boolean;
        documents: boolean;
        memory: boolean;
        agent: boolean;
    };
    networkUsed: boolean;
    partialContent: string;
    assistantMessageId?: string;
    stopped: boolean;
}

export interface ImageGenProgress {
    active: boolean;
    provider?: string;
    phase?: string;
}

export interface GatheredContext {
    ragCtx: string;
    memCtx: string;
    searchCtx: string;
    hasDocuments: boolean;
}

/** Captures current provider configuration without relying on a React closure. */
export function getProviderSnapshot(): ExecutionProviderSnapshot {
    const browserState = useWebLLM.getState();
    const ollamaState = useOllama.getState();
    const cloudState = useCloudAI.getState();
    const chromeState = useChromeAI.getState();
    const browserModel = browserState.loadedModel || null;
    const ollamaModel = ollamaState.loadedModel || null;
    const cloudModel = cloudState.loadedModel || null;

    return {
        browser: {
            configured: Boolean(browserModel),
            ready: browserState.status === "ready" && Boolean(browserModel),
            model: browserModel,
            modelLabel: WEBLLM_MODELS.find(model => model.id === browserModel)?.label || browserModel,
            networked: false,
        },
        ollama: {
            configured: Boolean(ollamaState.isSupported && ollamaModel),
            ready: Boolean(ollamaState.isSupported && ollamaModel),
            model: ollamaModel,
            modelLabel: ollamaModel,
            networked: isNetworkedEndpoint(ollamaState.baseUrl),
        },
        cloud: {
            configured: Boolean(cloudState.apiKey && cloudModel),
            ready: Boolean(cloudState.apiKey && cloudModel),
            model: cloudModel,
            modelLabel: cloudModel,
            networked: true,
        },
        "chrome-ai": {
            configured: chromeState.isSupported,
            ready: chromeState.status === "ready",
            model: "gemini-nano",
            modelLabel: "Gemini Nano",
            networked: false,
        },
    };
}

function getProviderRuntime(provider: ExecutionProvider): ProviderRuntime {
    switch (provider) {
        case "browser":
            return { generate: useWebLLM.getState().generate, stop: useWebLLM.getState().stop };
        case "ollama":
            return { generate: useOllama.getState().generate, stop: useOllama.getState().stop };
        case "cloud":
            return { generate: useCloudAI.getState().generate, stop: useCloudAI.getState().stop };
        case "chrome-ai":
            return { generate: useChromeAI.getState().generate, stop: useChromeAI.getState().stop };
        case "image":
            return { generate: null, stop: () => {} };
    }
}

/** Builds the mutable execution handle around an immutable request plan. */
export function createActiveExecutionRuntime(plan: ExecutionPlan): ActiveExecutionRuntime {
    const providerRuntime = getProviderRuntime(plan.provider);
    const requestController = new AbortController();
    const guardedGenerate: GenerateFunction | null = providerRuntime.generate
        ? async (messages, onToken) => {
              const readiness = getExecutionReadiness(plan, getProviderSnapshot());
              if (!readiness.ready) {
                  throw new Error(
                      readiness.reason === "model-changed"
                          ? "The selected model changed after this request started. Send again to use the new model."
                          : "The planned provider is no longer ready."
                  );
              }
              return providerRuntime.generate!(messages, onToken);
          }
        : null;

    return {
        plan,
        generate: guardedGenerate,
        stop: () => {
            requestController.abort();
            providerRuntime.stop();
        },
        requestSignal: requestController.signal,
        imageSignal: plan.provider === "image" ? requestController.signal : undefined,
        observedSources: { ...plan.sourceFlags },
        networkUsed: plan.sourceFlags.search,
        partialContent: "",
        stopped: false,
    };
}

export function isAbortError(error: unknown): boolean {
    return error instanceof DOMException
        ? error.name === "AbortError"
        : Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export function providerUnavailableHint(provider: ExecutionProvider): string {
    switch (provider) {
        case "browser":
            return "Load a model first — pick one from the welcome screen or use the model selector.";
        case "ollama":
            return "Ollama isn't connected or has no model selected. Start Ollama, then pull and select a model.";
        case "cloud":
            return "Cloud API is not ready. Add an API key and select a model in provider settings.";
        case "chrome-ai":
            return "Chrome AI is not ready. Wait for Gemini Nano to finish initializing or select another provider.";
        case "image":
            return "The image provider is not ready.";
    }
}
