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
import type { ChatCitation } from "./useChatStore";

interface ProviderRuntime {
    generate: GenerateFunction | null;
    stop: (requestId?: string) => void;
}

export interface ObservedExecutionSources {
    search: boolean;
    documents: boolean;
    memory: boolean;
    python: boolean;
}

export interface ActiveExecutionRuntime {
    readonly plan: ExecutionPlan;
    readonly generate: GenerateFunction | null;
    readonly stop: () => void;
    readonly requestSignal: AbortSignal;
    readonly imageSignal?: AbortSignal;
    observedSources: ObservedExecutionSources;
    networkUsed: boolean;
    partialContent: string;
    assistantMessageId?: string;
    stopped: boolean;
    liveContent?: LiveContentScheduler;
    documentEvidence: ChatCitation[];
}

export interface LiveContentScheduler {
    schedule: (content: string) => void;
    flush: (content?: string) => void;
    cancel: () => void;
}

/** Coalesces token-driven React updates to at most one commit per animation frame. */
export function createLiveContentScheduler(commit: (content: string) => void): LiveContentScheduler {
    let pending = "";
    let frame: number | ReturnType<typeof setTimeout> | null = null;
    const scheduleFrame = (callback: () => void): number | ReturnType<typeof setTimeout> => {
        if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
        return setTimeout(callback, 16);
    };
    const cancelFrame = (handle: number | ReturnType<typeof setTimeout>) => {
        if (typeof cancelAnimationFrame === "function" && typeof handle === "number") cancelAnimationFrame(handle);
        else clearTimeout(handle);
    };
    const commitPending = () => {
        frame = null;
        commit(pending);
    };

    return {
        schedule: content => {
            pending = content;
            if (frame === null) frame = scheduleFrame(commitPending);
        },
        flush: content => {
            if (content !== undefined) pending = content;
            if (frame !== null) cancelFrame(frame);
            frame = null;
            commit(pending);
        },
        cancel: () => {
            if (frame !== null) cancelFrame(frame);
            frame = null;
        },
    };
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
    documentEvidence: ChatCitation[];
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
            contextWindow: browserState.contextWindow,
            maxOutputTokens: browserState.maxOutputTokens,
            revision: browserState.runtimeRevision,
        },
        ollama: {
            configured: Boolean(ollamaState.isSupported && ollamaModel),
            ready: Boolean(ollamaState.isSupported && ollamaModel),
            model: ollamaModel,
            modelLabel: ollamaModel,
            networked: isNetworkedEndpoint(ollamaState.baseUrl),
            contextWindow: ollamaState.contextWindow,
            maxOutputTokens: ollamaState.maxOutputTokens,
            revision: ollamaState.configurationRevision,
            endpoint: ollamaState.baseUrl,
        },
        cloud: {
            configured: Boolean(cloudState.isSupported && cloudState.apiKey && cloudModel),
            ready: Boolean(cloudState.isSupported && cloudState.status === "ready" && cloudState.apiKey && cloudModel),
            model: cloudModel,
            modelLabel: cloudModel,
            networked: true,
            contextWindow: cloudState.contextWindow,
            maxOutputTokens: cloudState.maxOutputTokens,
            revision: cloudState.configurationRevision,
            endpoint: cloudState.baseUrl,
        },
        "chrome-ai": {
            configured: chromeState.isSupported,
            ready: chromeState.status === "ready",
            model: "gemini-nano",
            modelLabel: "Gemini Nano",
            networked: false,
            contextWindow: chromeState.contextWindow,
            maxOutputTokens: chromeState.maxOutputTokens,
            revision: chromeState.runtimeRevision,
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
                          : readiness.reason === "provider-changed"
                            ? "The provider endpoint or credentials changed after this request started. Send again to use the new configuration."
                            : "The planned provider is no longer ready."
                  );
              }
              return providerRuntime.generate!(messages, onToken, {
                  requestId: plan.requestId,
                  model: plan.model,
                  maxTokens: plan.maxOutputTokens,
                  signal: requestController.signal,
              });
          }
        : null;

    return {
        plan,
        generate: guardedGenerate,
        stop: () => {
            requestController.abort();
            providerRuntime.stop(plan.requestId);
        },
        requestSignal: requestController.signal,
        imageSignal: plan.provider === "image" ? requestController.signal : undefined,
        observedSources: { search: false, documents: false, memory: false, python: false },
        networkUsed: false,
        partialContent: "",
        stopped: false,
        documentEvidence: [],
    };
}

export function isAbortError(error: unknown): boolean {
    return error instanceof DOMException
        ? error.name === "AbortError"
        : Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export function isRetryableExecutionError(plan: Pick<ExecutionPlan, "provider">, error: unknown): boolean {
    if (plan.provider !== "cloud" && plan.provider !== "ollama") return false;
    if (isAbortError(error)) return false;
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    const message = error instanceof Error ? error.message : String(error || "");
    if (/contract changed|configuration changed|model changed|no model|api key|endpoint must/i.test(message))
        return false;
    return name === "TimeoutError" || /\b429\b|\b50[0234]\b|fetch|network|timed?\s*out|connection/i.test(message);
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
