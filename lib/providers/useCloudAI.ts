"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
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
    supportedParameters?: string[];
}

export type CloudProviderKind = "groq" | "openrouter" | "openai" | "generic";

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
const DEFAULT_MAX_OUTPUT_TOKENS = 2_048;
export const GROQ_SAFE_REQUEST_TOKENS = 8_000;
export const GROQ_SAFE_MAX_OUTPUT_TOKENS = 1_024;
export const CLOUD_GENERATION_TIMEOUT_MS = 120_000;
export const CLOUD_MODELS_TIMEOUT_MS = 15_000;
export const CLOUD_JSON_MAX_BYTES = 2 * 1024 * 1024;
export const CLOUD_STREAM_MAX_BYTES = 8 * 1024 * 1024;
export const CLOUD_STREAM_LINE_MAX_CHARS = 256 * 1024;
export const CLOUD_MODEL_LIST_MAX_ITEMS = 2_000;

const PROVIDER_REQUEST_LIMITS: Readonly<Record<CloudProviderKind, { contextWindow: number; maxOutputTokens: number }>> =
    Object.freeze({
        // Groq's model context can be 128K while a normal account's per-request/
        // per-minute token allowance is much smaller. Asking for the technical
        // maximum output causes an otherwise tiny request to be rejected with 413.
        groq: { contextWindow: GROQ_SAFE_REQUEST_TOKENS, maxOutputTokens: GROQ_SAFE_MAX_OUTPUT_TOKENS },
        openrouter: { contextWindow: 32_768, maxOutputTokens: 2_048 },
        openai: { contextWindow: 32_768, maxOutputTokens: 2_048 },
        generic: { contextWindow: DEFAULT_CONTEXT_WINDOW, maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS },
    });

function providerLabel(provider: CloudProviderKind): string {
    if (provider === "groq") return "Groq";
    if (provider === "openrouter") return "OpenRouter";
    if (provider === "openai") return "OpenAI";
    return "Cloud API";
}

export function identifyCloudProvider(value: string): CloudProviderKind {
    try {
        const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
        if (hostname === "api.groq.com") return "groq";
        if (hostname === "openrouter.ai") return "openrouter";
        if (hostname === "api.openai.com") return "openai";
    } catch {
        // Invalid endpoints are reported by normalizeCloudBaseUrl. Treating
        // them as generic here avoids ever granting provider-specific behavior
        // based on a substring in an unparsed value.
    }
    return "generic";
}

export function cloudHttpErrorMessage(status: number, baseUrl?: string): string {
    const provider = baseUrl ? identifyCloudProvider(baseUrl) : "generic";
    const label = providerLabel(provider);
    if (status === 401 || status === 403) {
        return `${label} authentication failed (${status}). Check the session key and endpoint.`;
    }
    if (status === 400) {
        if (provider === "openrouter") {
            return "OpenRouter rejected this request (400). Choose a text-chat model; audio, image, embedding, and reranking models are not supported here.";
        }
        if (provider === "groq") {
            return "Groq rejected this request (400). Check that the selected model supports chat completions.";
        }
        if (provider === "openai") {
            return "OpenAI rejected this request (400). The selected model or its chat-completion parameters are not supported.";
        }
        return "Cloud API rejected this request (400). Check that the selected model supports streamed text chat.";
    }
    if (status === 413) {
        if (provider === "groq") {
            return "Groq rejected the request as too large (413). Start a new chat or turn off document, memory, or search context and try again.";
        }
        return `${label} rejected the request as too large (413). Shorten the conversation or attached context and try again.`;
    }
    if (status === 404) return `${label} endpoint or model was not found (404). Check the endpoint and model.`;
    if (status === 429) return `${label} rate limit reached (429). Wait a moment and try again.`;
    if (status >= 500) return `${label} is unavailable (${status}). Try again later.`;
    return `${label} request failed (${status}). Check the model and request settings.`;
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
    const raw = value.trim();
    if (!raw) throw new Error("Cloud endpoint is required.");
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

    const provider = identifyCloudProvider(url.href);
    const normalizedPath = pathname.toLowerCase();
    if (provider === "groq") {
        if (!["", "/v1", "/openai", "/openai/v1"].includes(normalizedPath)) {
            throw new Error("Groq endpoint must use https://api.groq.com/openai/v1.");
        }
        return `${url.origin}/openai/v1`;
    }
    if (provider === "openrouter") {
        if (!["", "/v1", "/api", "/api/v1"].includes(normalizedPath)) {
            throw new Error("OpenRouter endpoint must use https://openrouter.ai/api/v1.");
        }
        return `${url.origin}/api/v1`;
    }
    if (provider === "openai") {
        if (!["", "/v1"].includes(normalizedPath)) {
            throw new Error("OpenAI endpoint must use https://api.openai.com/v1.");
        }
        return `${url.origin}/v1`;
    }
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

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const values = value
        .filter((item): item is string => typeof item === "string")
        .map(item => item.trim().toLowerCase())
        .filter(Boolean);
    return [...new Set(values)];
}

const NON_TEXT_CHAT_MODEL_ID =
    /(?:^|[/:._-])(?:audio|babbage|davinci|dall-e|embed|embedding|flux|image|moderation|orpheus|rerank|speech|transcribe|transcription|tts|whisper)(?:$|[/:._-])/i;

function isTextChatModel(entry: Record<string, unknown>): boolean {
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || NON_TEXT_CHAT_MODEL_ID.test(id)) return false;

    const architecture = asRecord(entry.architecture);
    const inputModalities = readStringArray(architecture.input_modalities);
    const outputModalities = readStringArray(architecture.output_modalities);
    if (inputModalities && !inputModalities.includes("text")) return false;
    if (outputModalities && !outputModalities.includes("text")) return false;

    const modality = typeof architecture.modality === "string" ? architecture.modality.toLowerCase() : "";
    if (modality.includes("->")) {
        const [input = "", output = ""] = modality.split("->", 2);
        if (!input.includes("text") || !output.includes("text")) return false;
    }
    return true;
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
    const topProvider = asRecord(model.top_provider);
    return {
        contextWindow:
            readPositiveNumber(model.context_window) ||
            readPositiveNumber(model.context_length) ||
            readPositiveNumber(model.max_context_length) ||
            readPositiveNumber(model.input_token_limit) ||
            readPositiveNumber(topProvider.context_window) ||
            readPositiveNumber(topProvider.context_length),
        maxOutputTokens:
            readPositiveNumber(model.max_output_tokens) ||
            readPositiveNumber(model.output_token_limit) ||
            readPositiveNumber(model.max_completion_tokens) ||
            readPositiveNumber(topProvider.max_output_tokens) ||
            readPositiveNumber(topProvider.max_completion_tokens),
        supportedParameters: readStringArray(model.supported_parameters),
    };
}

function limitsFor(
    model: string,
    stored: Record<string, CloudModelLimits>,
    baseUrl: string
): { contextWindow: number; maxOutputTokens: number } {
    const known = knownModelLimits(model);
    const fetched = stored[model] || {};
    const providerLimits = PROVIDER_REQUEST_LIMITS[identifyCloudProvider(baseUrl)];
    const contextWindow = Math.max(
        2,
        Math.min(fetched.contextWindow || known.contextWindow || DEFAULT_CONTEXT_WINDOW, providerLimits.contextWindow)
    );
    return {
        contextWindow,
        maxOutputTokens: Math.max(
            1,
            Math.min(
                fetched.maxOutputTokens || known.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
                providerLimits.maxOutputTokens,
                contextWindow - 1
            )
        ),
    };
}

function defaultEndpointState(
    baseUrl: string
): Pick<CloudState, "models" | "loadedModel" | "modelLimits" | "contextWindow" | "maxOutputTokens"> {
    if (identifyCloudProvider(baseUrl) === "groq") {
        return {
            models: GROQ_MODELS,
            loadedModel: DEFAULT_MODEL,
            modelLimits: {},
            ...limitsFor(DEFAULT_MODEL, {}, baseUrl),
        };
    }
    const limits = PROVIDER_REQUEST_LIMITS[identifyCloudProvider(baseUrl)];
    return {
        models: [],
        loadedModel: null,
        modelLimits: {},
        contextWindow: limits.contextWindow,
        maxOutputTokens: limits.maxOutputTokens,
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

const sessionStorageAdapter: StateStorage = {
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
            contextWindow: GROQ_SAFE_REQUEST_TOKENS,
            maxOutputTokens: GROQ_SAFE_MAX_OUTPUT_TOKENS,
            configurationRevision: 0,
            modelLimits: {},

            setCredentials: (baseUrl, apiKey) => {
                if (credentialDebounce) clearTimeout(credentialDebounce);
                credentialDebounce = null;

                let normalized: string;
                try {
                    normalized = normalizeCloudBaseUrl(baseUrl);
                } catch (error) {
                    activeModelFetch?.controller.abort();
                    abortActiveGeneration();
                    set(state => ({
                        error: error instanceof Error ? error.message : String(error),
                        isSupported: false,
                        status: "error",
                        configurationRevision: state.configurationRevision + 1,
                    }));
                    return;
                }

                const previous = get();
                const endpointChanged = previous.baseUrl !== normalized;
                const changed = endpointChanged || previous.apiKey !== apiKey;
                if (changed) {
                    activeModelFetch?.controller.abort();
                    abortActiveGeneration();
                }

                set(state => {
                    return {
                        baseUrl: normalized,
                        apiKey,
                        error: null,
                        isSupported: Boolean(apiKey),
                        status: activeGeneration ? "generating" : "ready",
                        configurationRevision: state.configurationRevision + (changed ? 1 : 0),
                        ...(endpointChanged ? defaultEndpointState(normalized) : {}),
                    };
                });

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
                    const rawEntries: unknown[] = Array.isArray(payload?.data) ? payload.data : [];
                    if (rawEntries.length > CLOUD_MODEL_LIST_MAX_ITEMS) {
                        throw new Error(`Cloud model list exceeded the ${CLOUD_MODEL_LIST_MAX_ITEMS}-model limit`);
                    }
                    const entries = rawEntries.filter((entry: unknown): entry is Record<string, unknown> =>
                        Boolean(entry && typeof entry === "object" && !Array.isArray(entry))
                    );
                    const compatibleEntries = entries.filter(isTextChatModel);
                    const models = [
                        ...new Set(
                            compatibleEntries
                                .map(entry => (typeof entry.id === "string" ? entry.id.trim() : ""))
                                .filter(Boolean)
                        ),
                    ];
                    if (!models.length) {
                        throw new Error("Cloud model discovery returned no streamed text-chat models.");
                    }
                    if (
                        activeModelFetch !== request ||
                        get().configurationRevision !== configurationRevision ||
                        get().baseUrl !== baseUrl ||
                        get().apiKey !== apiKey
                    ) {
                        return;
                    }

                    const modelLimits: Record<string, CloudModelLimits> = {};
                    for (const entry of compatibleEntries) {
                        const id = typeof entry.id === "string" ? entry.id.trim() : "";
                        if (id) modelLimits[id] = limitsFromModelPayload(entry);
                    }
                    const current = get().loadedModel;
                    const preferred =
                        identifyCloudProvider(baseUrl) === "groq" && models.includes(DEFAULT_MODEL)
                            ? DEFAULT_MODEL
                            : models[0];
                    const loadedModel = current && models.includes(current) ? current : preferred;
                    set({
                        models,
                        loadedModel,
                        modelLimits,
                        ...limitsFor(loadedModel, modelLimits, baseUrl),
                        error: null,
                    });
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
                const limits = limitsFor(modelId, get().modelLimits, get().baseUrl);
                set({ loadedModel: modelId, error: null, ...limits });
            },

            generate: async (messages, onToken, options) => {
                const { baseUrl, apiKey, loadedModel, configurationRevision, maxOutputTokens, modelLimits } = get();
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
                    const providerLimits = PROVIDER_REQUEST_LIMITS[identifyCloudProvider(baseUrl)];
                    const requestedMaxTokens = Math.max(
                        1,
                        Math.min(options?.maxTokens || maxOutputTokens, maxOutputTokens, providerLimits.maxOutputTokens)
                    );
                    const supportedParameters = modelLimits[loadedModel]?.supportedParameters;
                    const supported = supportedParameters ? new Set(supportedParameters) : null;
                    const body: Record<string, unknown> = {
                        model: loadedModel,
                        messages,
                        stream: true,
                    };
                    if (!supported || supported.has("temperature")) body.temperature = 0.25;
                    if (!supported || supported.has("top_p")) body.top_p = 0.9;
                    if (supported?.has("max_completion_tokens") && !supported.has("max_tokens")) {
                        body.max_completion_tokens = requestedMaxTokens;
                    } else {
                        body.max_tokens = requestedMaxTokens;
                    }

                    const response = await fetch(`${baseUrl}/chat/completions`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                        body: JSON.stringify(body),
                        signal: request.controller.signal,
                    });
                    if (!response.ok) {
                        // Drain only a bounded body, but never trust or persist an
                        // upstream-controlled error string: hostile compatible
                        // endpoints can reflect prompts, keys, or control chars.
                        await readBoundedJson(response, 64 * 1024, "Cloud API error body").catch(() => ({}));
                        throw new Error(cloudHttpErrorMessage(response.status, baseUrl));
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
            storage: createJSONStorage(() => sessionStorageAdapter),
            partialize: state => ({ baseUrl: state.baseUrl, apiKey: state.apiKey, loadedModel: state.loadedModel }),
            merge: (persistedState, currentState) => {
                const persisted = (persistedState || {}) as Partial<CloudState>;
                let baseUrl = currentState.baseUrl;
                if (typeof persisted.baseUrl === "string") {
                    try {
                        baseUrl = normalizeCloudBaseUrl(persisted.baseUrl);
                    } catch {
                        // Discard invalid legacy endpoints instead of silently
                        // sending a saved key to the default provider.
                    }
                }

                const endpointState = defaultEndpointState(baseUrl);
                const apiKey = typeof persisted.apiKey === "string" ? persisted.apiKey : "";
                if (
                    identifyCloudProvider(baseUrl) === "groq" &&
                    typeof persisted.loadedModel === "string" &&
                    GROQ_MODELS.includes(persisted.loadedModel)
                ) {
                    endpointState.loadedModel = persisted.loadedModel;
                    Object.assign(endpointState, limitsFor(persisted.loadedModel, {}, baseUrl));
                }

                return {
                    ...currentState,
                    ...endpointState,
                    baseUrl,
                    apiKey,
                    error: null,
                    isSupported: Boolean(apiKey),
                    status: "ready",
                };
            },
        }
    )
);
