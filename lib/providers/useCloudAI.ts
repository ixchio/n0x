"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GenerationOptions } from "@/lib/chat/executionPrompt";
import { addTokens } from "@/lib/providers/useWebLLM";
import { logger } from "@/lib/core/logger";

export type CloudStatus = "ready" | "generating" | "error";

interface ChatMessage {
    role: string;
    content: string;
}

interface CloudStats {
    tps: number;
    totalTokens: number;
    lastTokenTime: number;
}

interface CloudModelLimits {
    contextWindow?: number;
    maxOutputTokens?: number;
}

interface CloudState {
    status: CloudStatus;
    models: string[];
    loadedModel: string | null;
    error: string | null;
    isSupported: boolean;
    stats: CloudStats;
    baseUrl: string;
    apiKey: string;
    fetchingModels: boolean;
    contextWindow: number;
    maxOutputTokens: number;
    configurationRevision: number;
    modelLimits: Record<string, CloudModelLimits>;

    init: () => void;
    loadModel: (modelId: string) => Promise<void>;
    generate: (
        messages: ChatMessage[],
        onToken?: (token: string) => void,
        options?: GenerationOptions
    ) => Promise<string>;
    stop: (requestId?: string) => void;
    setCredentials: (baseUrl: string, apiKey: string) => void;
    fetchModels: () => Promise<void>;
}

interface ActiveRequest {
    requestId: string;
    controller: AbortController;
    timeout: ReturnType<typeof setTimeout>;
    timedOut: boolean;
    detachParent?: () => void;
}

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_CONTEXT_WINDOW = 32_768;
const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;
export const CLOUD_GENERATION_TIMEOUT_MS = 120_000;
export const CLOUD_MODELS_TIMEOUT_MS = 15_000;
export const CLOUD_JSON_MAX_BYTES = 2 * 1024 * 1024;
export const CLOUD_STREAM_MAX_BYTES = 8 * 1024 * 1024;
export const CLOUD_STREAM_LINE_MAX_CHARS = 256 * 1024;
export const CLOUD_MODEL_LIST_MAX_ITEMS = 2_000;

export function cloudHttpErrorMessage(status: number): string {
    if (status === 401 || status === 403) {
        return `Cloud API authentication failed (${status}). Check the session key and endpoint.`;
    }
    if (status === 404) return "Cloud API endpoint or model was not found (404). Check the endpoint and model.";
    if (status === 429) return "Cloud API rate limit reached (429). Wait a moment and try again.";
    if (status >= 500) return `Cloud API provider is unavailable (${status}). Try again later.`;
    return `Cloud API request failed (${status}). Check the endpoint, model, and request settings.`;
}

const GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
    "deepseek-r1-distill-llama-70b",
];

let activeGeneration: ActiveRequest | null = null;
let activeModelFetch: ActiveRequest | null = null;
let credentialDebounce: ReturnType<typeof setTimeout> | null = null;
let requestCounter = 0;

function isLoopback(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || host === "0.0.0.0" || host.startsWith("127.");
}

export function normalizeCloudBaseUrl(value: string): string {
    const raw = value.trim() || DEFAULT_BASE_URL;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error("Cloud endpoint must be a complete HTTPS URL, for example https://api.example.com/v1.");
    }
    if (url.username || url.password) throw new Error("Cloud endpoint must not contain embedded credentials.");
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
        throw new Error("Remote Cloud API endpoints must use HTTPS. HTTP is allowed only for localhost.");
    }
    if (url.search || url.hash) throw new Error("Cloud endpoint must not contain a query string or fragment.");

    let pathname = url.pathname.replace(/\/+$/, "");
    pathname = pathname.replace(/\/(?:chat\/completions|models)$/i, "");
    return `${url.origin}${pathname}`;
}

function knownModelLimits(model: string): CloudModelLimits {
    const normalized = model.toLowerCase();
    if (normalized.includes("llama-3.3") || normalized.includes("llama-3.1") || normalized.includes("deepseek")) {
        return { contextWindow: 131_072, maxOutputTokens: 8_192 };
    }
    if (normalized.includes("mixtral") || normalized.includes("32768")) {
        return { contextWindow: 32_768, maxOutputTokens: 4_096 };
    }
    if (normalized.includes("gemma2")) return { contextWindow: 8_192, maxOutputTokens: 2_048 };
    return {};
}

function readPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

async function readBoundedJson(response: Response, maxBytes: number, label: string): Promise<any> {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new Error(`${label} exceeded the ${maxBytes}-byte response limit`);
    }
    if (!response.body) return {};

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel().catch(() => undefined);
                throw new Error(`${label} exceeded the ${maxBytes}-byte response limit`);
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return text ? JSON.parse(text) : {};
    } finally {
        reader.releaseLock();
    }
}

function limitsFromModelPayload(model: Record<string, unknown>): CloudModelLimits {
    return {
        contextWindow:
            readPositiveNumber(model.context_window) ||
            readPositiveNumber(model.context_length) ||
            readPositiveNumber(model.max_context_length) ||
            readPositiveNumber(model.input_token_limit),
        maxOutputTokens:
            readPositiveNumber(model.max_output_tokens) ||
            readPositiveNumber(model.output_token_limit) ||
            readPositiveNumber(model.max_completion_tokens),
    };
}

function limitsFor(model: string, stored: Record<string, CloudModelLimits>): Required<CloudModelLimits> {
    const known = knownModelLimits(model);
    const fetched = stored[model] || {};
    return {
        contextWindow: fetched.contextWindow || known.contextWindow || DEFAULT_CONTEXT_WINDOW,
        maxOutputTokens: fetched.maxOutputTokens || known.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
    };
}

function createRequest(requestId: string, timeoutMs: number, parentSignal?: AbortSignal): ActiveRequest {
    const request: ActiveRequest = {
        requestId,
        controller: new AbortController(),
        timedOut: false,
        timeout: setTimeout(() => {
            request.timedOut = true;
            request.controller.abort();
        }, timeoutMs),
    };
    if (parentSignal) {
        if (parentSignal.aborted) request.controller.abort();
        else {
            const abortFromParent = () => request.controller.abort();
            parentSignal.addEventListener("abort", abortFromParent, { once: true });
            request.detachParent = () => parentSignal.removeEventListener("abort", abortFromParent);
        }
    }
    return request;
}

function finishRequest(request: ActiveRequest): void {
    clearTimeout(request.timeout);
    request.detachParent?.();
}

function abortActiveGeneration(): void {
    const request = activeGeneration;
    activeGeneration = null;
    if (!request) return;
    finishRequest(request);
    request.controller.abort();
}

const sessionStorageAdapter = {
    getItem: (name: string) => (typeof window === "undefined" ? null : sessionStorage.getItem(name)),
    setItem: (name: string, value: string) => {
        if (typeof window !== "undefined") sessionStorage.setItem(name, value);
    },
    removeItem: (name: string) => {
        if (typeof window !== "undefined") sessionStorage.removeItem(name);
    },
};

export const useCloudAI = create<CloudState>()(
    persist(
        (set, get) => ({
            status: "ready",
            models: GROQ_MODELS,
            loadedModel: DEFAULT_MODEL,
            error: null,
            isSupported: true,
            stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 },
            baseUrl: DEFAULT_BASE_URL,
            apiKey: "",
            fetchingModels: false,
            contextWindow: 131_072,
            maxOutputTokens: 8_192,
            configurationRevision: 0,
            modelLimits: {},

            setCredentials: (baseUrl, apiKey) => {
                if (credentialDebounce) clearTimeout(credentialDebounce);
                credentialDebounce = null;
                activeModelFetch?.controller.abort();
                abortActiveGeneration();

                let normalized: string;
                try {
                    normalized = normalizeCloudBaseUrl(baseUrl);
                } catch (error) {
                    set(state => ({
                        apiKey,
                        error: error instanceof Error ? error.message : String(error),
                        isSupported: false,
                        status: "error",
                        configurationRevision: state.configurationRevision + 1,
                    }));
                    return;
                }

                set(state => {
                    const changed = state.baseUrl !== normalized || state.apiKey !== apiKey;
                    return {
                        baseUrl: normalized,
                        apiKey,
                        error: null,
                        isSupported: Boolean(apiKey),
                        status: "ready",
                        configurationRevision: state.configurationRevision + (changed ? 1 : 0),
                    };
                });

                if (normalized.includes("groq.com")) {
                    const current = get().loadedModel;
                    const loadedModel = current && GROQ_MODELS.includes(current) ? current : DEFAULT_MODEL;
                    const limits = limitsFor(loadedModel, get().modelLimits);
                    set({ models: GROQ_MODELS, loadedModel, ...limits });
                }

                if (apiKey) {
                    const revision = get().configurationRevision;
                    credentialDebounce = setTimeout(() => {
                        if (get().configurationRevision === revision) void get().fetchModels();
                    }, 500);
                }
            },

            fetchModels: async () => {
                const { baseUrl, apiKey, configurationRevision } = get();
                if (!apiKey || !baseUrl) return;

                activeModelFetch?.controller.abort();
                const request = createRequest(`models_${++requestCounter}`, CLOUD_MODELS_TIMEOUT_MS);
                activeModelFetch = request;
                set({ fetchingModels: true });

                try {
                    const response = await fetch(`${baseUrl}/models`, {
                        headers: { Authorization: `Bearer ${apiKey}` },
                        signal: request.controller.signal,
                    });
                    if (!response.ok) throw new Error(`Model list request failed (${response.status})`);
                    const payload = await readBoundedJson(response, CLOUD_JSON_MAX_BYTES, "Cloud model list");
                    const entries: Record<string, unknown>[] = Array.isArray(payload?.data) ? payload.data : [];
                    if (entries.length > CLOUD_MODEL_LIST_MAX_ITEMS) {
                        throw new Error(`Cloud model list exceeded the ${CLOUD_MODEL_LIST_MAX_ITEMS}-model limit`);
                    }
                    const models = entries.map(entry => String(entry.id || "")).filter(Boolean);
                    if (!models.length) return;
                    if (
                        activeModelFetch !== request ||
                        get().configurationRevision !== configurationRevision ||
                        get().baseUrl !== baseUrl ||
                        get().apiKey !== apiKey
                    ) {
                        return;
                    }

                    const modelLimits = { ...get().modelLimits };
                    for (const entry of entries) {
                        const id = String(entry.id || "");
                        if (id) modelLimits[id] = limitsFromModelPayload(entry);
                    }
                    const current = get().loadedModel;
                    const loadedModel = current && models.includes(current) ? current : models[0];
                    set({ models, loadedModel, modelLimits, ...limitsFor(loadedModel, modelLimits), error: null });
                } catch (error) {
                    if (activeModelFetch !== request || (request.controller.signal.aborted && !request.timedOut))
                        return;
                    set({
                        error: request.timedOut
                            ? "Cloud model discovery timed out. Check the endpoint and try again."
                            : error instanceof Error
                              ? error.message
                              : "Cloud model discovery failed",
                    });
                } finally {
                    finishRequest(request);
                    if (activeModelFetch === request) {
                        activeModelFetch = null;
                        set({ fetchingModels: false });
                    }
                }
            },

            init: () => {
                const { apiKey } = get();
                if (!apiKey) set({ error: "API Key required for Cloud AI", isSupported: false, status: "error" });
                else {
                    set({ error: null, isSupported: true, status: "ready" });
                    void get().fetchModels();
                }
            },

            loadModel: async modelId => {
                const limits = limitsFor(modelId, get().modelLimits);
                set({ loadedModel: modelId, error: null, ...limits });
            },

            generate: async (messages, onToken, options) => {
                const { baseUrl, apiKey, loadedModel, configurationRevision, maxOutputTokens } = get();
                if (!apiKey) throw new Error("API Key missing. Please configure Cloud AI settings.");
                if (!loadedModel) throw new Error("No model selected");
                if (options?.model && options.model !== loadedModel) {
                    throw new Error("Cloud provider contract changed: the planned model is no longer selected");
                }

                abortActiveGeneration();
                const requestId = options?.requestId || `cloud_${++requestCounter}`;
                const request = createRequest(requestId, CLOUD_GENERATION_TIMEOUT_MS, options?.signal);
                activeGeneration = request;
                set({ status: "generating", error: null, stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 } });

                let tokenCount = 0;
                const startTime = performance.now();
                try {
                    const response = await fetch(`${baseUrl}/chat/completions`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: loadedModel,
                            messages,
                            stream: true,
                            temperature: 0.25,
                            top_p: 0.9,
                            max_tokens: Math.max(1, Math.min(options?.maxTokens || maxOutputTokens, maxOutputTokens)),
                        }),
                        signal: request.controller.signal,
                    });
                    if (!response.ok) {
                        // Drain only a bounded body, but never trust or persist an
                        // upstream-controlled error string: hostile compatible
                        // endpoints can reflect prompts, keys, or control chars.
                        await readBoundedJson(response, 64 * 1024, "Cloud API error body").catch(() => ({}));
                        throw new Error(cloudHttpErrorMessage(response.status));
                    }
                    if (!response.body) throw new Error("Cloud API returned no response body");

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let fullResponse = "";
                    let buffer = "";
                    let totalResponseBytes = 0;
                    const consume = (line: string) => {
                        if (!line || line === "data: [DONE]" || !line.startsWith("data: ")) return;
                        try {
                            const token = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content;
                            if (!token || activeGeneration !== request) return;
                            fullResponse += token;
                            tokenCount += 1;
                            const now = performance.now();
                            if (tokenCount % 5 === 0) {
                                const seconds = Math.max(0.001, (now - startTime) / 1_000);
                                set({
                                    stats: {
                                        tps: Math.round(tokenCount / seconds),
                                        totalTokens: tokenCount,
                                        lastTokenTime: now,
                                    },
                                });
                            }
                            onToken?.(token);
                        } catch {
                            // Ignore non-standard SSE events without losing the stream.
                        }
                    };

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalResponseBytes += value.byteLength;
                        if (totalResponseBytes > CLOUD_STREAM_MAX_BYTES) {
                            request.controller.abort();
                            throw new Error(
                                `Cloud API stream exceeded the ${CLOUD_STREAM_MAX_BYTES}-byte response limit`
                            );
                        }
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split(/\r?\n/);
                        buffer = lines.pop() || "";
                        if (buffer.length > CLOUD_STREAM_LINE_MAX_CHARS) {
                            request.controller.abort();
                            throw new Error(
                                `Cloud API stream line exceeded the ${CLOUD_STREAM_LINE_MAX_CHARS}-character limit`
                            );
                        }
                        for (const line of lines) {
                            if (line.length > CLOUD_STREAM_LINE_MAX_CHARS) {
                                request.controller.abort();
                                throw new Error(
                                    `Cloud API stream line exceeded the ${CLOUD_STREAM_LINE_MAX_CHARS}-character limit`
                                );
                            }
                            consume(line.trim());
                        }
                    }
                    if (buffer.trim()) consume(buffer.trim());
                    if (request.controller.signal.aborted) throw new DOMException("Generation stopped", "AbortError");
                    if (get().configurationRevision !== configurationRevision) {
                        throw new Error("Cloud provider configuration changed during generation");
                    }
                    addTokens(tokenCount, false);
                    return fullResponse;
                } catch (error) {
                    const resolved = request.timedOut
                        ? Object.assign(
                              new Error("Cloud API generation timed out. Try again or lower the output limit."),
                              {
                                  name: "TimeoutError",
                              }
                          )
                        : error;
                    if (activeGeneration === request && (resolved as Error)?.name !== "AbortError") {
                        logger.error("Cloud API generation failed", {
                            name: (resolved as Error)?.name || "Error",
                            requestId: request.requestId,
                        });
                        set({ error: resolved instanceof Error ? resolved.message : String(resolved) });
                    }
                    throw resolved;
                } finally {
                    finishRequest(request);
                    if (activeGeneration === request) {
                        activeGeneration = null;
                        const now = performance.now();
                        const seconds = Math.max(0.001, (now - startTime) / 1_000);
                        set({
                            status: "ready",
                            stats: {
                                tps: Math.round(tokenCount / seconds),
                                totalTokens: tokenCount,
                                lastTokenTime: now,
                            },
                        });
                    }
                }
            },

            stop: requestId => {
                if (!activeGeneration || (requestId && activeGeneration.requestId !== requestId)) return;
                abortActiveGeneration();
                set({ status: "ready" });
            },
        }),
        {
            name: "n0x-cloud-storage",
            storage: sessionStorageAdapter as any,
            partialize: state => ({ baseUrl: state.baseUrl, apiKey: state.apiKey, loadedModel: state.loadedModel }),
        }
    )
);
