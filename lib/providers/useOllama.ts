"use client";

import { create } from "zustand";
import type { GenerationOptions } from "@/lib/chat/executionPrompt";
import { addTokens } from "@/lib/providers/useWebLLM";
import { logger } from "@/lib/core/logger";

export type OllamaStatus = "unloaded" | "ready" | "generating" | "error";

export function statusAfterOllamaHealthCheck(current: OllamaStatus, reachable: boolean): OllamaStatus {
    if (current === "generating") return current;
    return reachable ? "ready" : "error";
}

interface ChatMessage {
    role: string;
    content: string;
}

interface OllamaStats {
    tps: number;
    totalTokens: number;
    lastTokenTime: number;
}

interface OllamaModel {
    name: string;
    size: number;
}

interface OllamaState {
    status: OllamaStatus;
    models: OllamaModel[];
    loadedModel: string | null;
    error: string | null;
    isSupported: boolean;
    stats: OllamaStats;
    baseUrl: string;
    pollInterval: ReturnType<typeof setInterval> | null;
    contextWindow: number;
    maxOutputTokens: number;
    configurationRevision: number;

    init: () => Promise<void>;
    startPolling: () => void;
    stopPolling: () => void;
    loadModel: (modelId: string) => Promise<void>;
    generate: (
        messages: ChatMessage[],
        onToken?: (token: string) => void,
        options?: GenerationOptions
    ) => Promise<string>;
    stop: (requestId?: string) => void;
    setBaseUrl: (url: string) => void;
}

interface ActiveRequest {
    requestId: string;
    controller: AbortController;
    timeout: ReturnType<typeof setTimeout>;
    timedOut: boolean;
    detachParent?: () => void;
}

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_CONTEXT_WINDOW = 16_384;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_048;
export const OLLAMA_HEALTH_TIMEOUT_MS = 5_000;
export const OLLAMA_GENERATION_TIMEOUT_MS = 120_000;
export const OLLAMA_JSON_MAX_BYTES = 2 * 1024 * 1024;
export const OLLAMA_STREAM_MAX_BYTES = 8 * 1024 * 1024;
export const OLLAMA_STREAM_LINE_MAX_CHARS = 256 * 1024;
export const OLLAMA_MODEL_LIST_MAX_ITEMS = 2_000;

let activeGeneration: ActiveRequest | null = null;
let activeHealthCheck: ActiveRequest | null = null;
let activeModelInfo: ActiveRequest | null = null;
let requestCounter = 0;

function isLoopback(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || host === "0.0.0.0" || host.startsWith("127.");
}

export function normalizeOllamaBaseUrl(value: string): string {
    const raw = value.trim() || DEFAULT_BASE_URL;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error("Ollama endpoint must be a complete URL, for example http://localhost:11434.");
    }
    if (url.username || url.password) throw new Error("Ollama endpoint must not contain embedded credentials.");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Ollama endpoint must use HTTP or HTTPS.");
    }
    if (url.protocol === "http:" && !isLoopback(url.hostname)) {
        throw new Error("Remote Ollama endpoints must use HTTPS so prompts are not sent in plaintext.");
    }
    if (url.search || url.hash) throw new Error("Ollama endpoint must not contain a query string or fragment.");
    let pathname = url.pathname.replace(/\/+$/, "");
    pathname = pathname.replace(/\/api(?:\/(?:tags|chat|show))?$/i, "");
    return `${url.origin}${pathname}`;
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

function abortGeneration(): void {
    const request = activeGeneration;
    activeGeneration = null;
    if (!request) return;
    finishRequest(request);
    request.controller.abort();
}

function parseContextWindow(payload: any): number | null {
    const info = payload?.model_info;
    if (!info || typeof info !== "object") return null;
    for (const [key, value] of Object.entries(info)) {
        if (!key.endsWith(".context_length") && key !== "context_length") continue;
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 1) return Math.floor(parsed);
    }
    return null;
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

async function refreshModelLimits(model: string, baseUrl: string, revision: number): Promise<void> {
    activeModelInfo?.controller.abort();
    const request = createRequest(`ollama_info_${++requestCounter}`, OLLAMA_HEALTH_TIMEOUT_MS);
    activeModelInfo = request;
    try {
        const response = await fetch(`${baseUrl}/api/show`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model }),
            signal: request.controller.signal,
        });
        if (!response.ok) return;
        const contextWindow = parseContextWindow(await readBoundedJson(response, 512 * 1024, "Ollama model details"));
        if (
            !contextWindow ||
            activeModelInfo !== request ||
            useOllama.getState().configurationRevision !== revision ||
            useOllama.getState().loadedModel !== model
        ) {
            return;
        }
        useOllama.setState({
            contextWindow,
            maxOutputTokens: Math.max(1, Math.min(DEFAULT_MAX_OUTPUT_TOKENS, contextWindow - 1)),
        });
    } catch {
        // Model details are optional; keep conservative defaults.
    } finally {
        finishRequest(request);
        if (activeModelInfo === request) activeModelInfo = null;
    }
}

export const useOllama = create<OllamaState>((set, get) => ({
    status: "unloaded",
    models: [],
    loadedModel: null,
    error: null,
    isSupported: false,
    stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 },
    baseUrl: DEFAULT_BASE_URL,
    pollInterval: null,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    configurationRevision: 0,

    setBaseUrl: value => {
        let baseUrl: string;
        try {
            baseUrl = normalizeOllamaBaseUrl(value);
        } catch (error) {
            abortGeneration();
            activeHealthCheck?.controller.abort();
            set(state => ({
                error: error instanceof Error ? error.message : String(error),
                isSupported: false,
                status: "error",
                configurationRevision: state.configurationRevision + 1,
            }));
            return;
        }

        const changed = get().baseUrl !== baseUrl;
        if (changed) {
            abortGeneration();
            activeHealthCheck?.controller.abort();
            activeModelInfo?.controller.abort();
        }
        set(state => ({
            baseUrl,
            error: null,
            configurationRevision: state.configurationRevision + (changed ? 1 : 0),
        }));
        void get().init();
    },

    init: async () => {
        const { baseUrl, configurationRevision } = get();
        activeHealthCheck?.controller.abort();
        const request = createRequest(`ollama_health_${++requestCounter}`, OLLAMA_HEALTH_TIMEOUT_MS);
        activeHealthCheck = request;

        try {
            const response = await fetch(`${baseUrl}/api/tags`, { signal: request.controller.signal });
            if (!response.ok) throw new Error(`Ollama health check failed (${response.status})`);
            const payload = await readBoundedJson(response, OLLAMA_JSON_MAX_BYTES, "Ollama model list");
            if (Array.isArray(payload?.models) && payload.models.length > OLLAMA_MODEL_LIST_MAX_ITEMS) {
                throw new Error(`Ollama model list exceeded the ${OLLAMA_MODEL_LIST_MAX_ITEMS}-model limit`);
            }
            const models: OllamaModel[] = Array.isArray(payload?.models)
                ? payload.models
                      .map((model: any) => ({ name: String(model.name || ""), size: Number(model.size) || 0 }))
                      .filter((model: OllamaModel) => model.name)
                : [];
            if (
                activeHealthCheck !== request ||
                get().configurationRevision !== configurationRevision ||
                get().baseUrl !== baseUrl
            ) {
                return;
            }

            const previousModel = get().loadedModel;
            const loadedModel =
                previousModel && models.some(model => model.name === previousModel)
                    ? previousModel
                    : models[0]?.name || null;
            set(state => ({
                isSupported: true,
                models,
                loadedModel,
                status: statusAfterOllamaHealthCheck(state.status, true),
                error: null,
            }));
            if (loadedModel && loadedModel !== previousModel) {
                void refreshModelLimits(loadedModel, baseUrl, configurationRevision);
            }
        } catch (error) {
            if (activeHealthCheck !== request || (request.controller.signal.aborted && !request.timedOut)) return;
            const message = request.timedOut
                ? `Ollama health check timed out at ${baseUrl}. Confirm the server is running and reachable.`
                : error instanceof TypeError
                  ? `Cannot connect to Ollama at ${baseUrl}. For localhost, configure OLLAMA_ORIGINS for this app.`
                  : error instanceof Error
                    ? error.message
                    : `Ollama is not reachable at ${baseUrl}`;
            set(state => ({
                isSupported: false,
                error: message,
                status: statusAfterOllamaHealthCheck(state.status, false),
            }));
        } finally {
            finishRequest(request);
            if (activeHealthCheck === request) activeHealthCheck = null;
        }
    },

    startPolling: () => {
        get().stopPolling();
        void get().init();
        const pollInterval = setInterval(() => void get().init(), 3_000);
        set({ pollInterval });
    },

    stopPolling: () => {
        const { pollInterval } = get();
        if (pollInterval) clearInterval(pollInterval);
        activeHealthCheck?.controller.abort();
        activeHealthCheck = null;
        set({ pollInterval: null });
    },

    loadModel: async modelId => {
        const { baseUrl, configurationRevision } = get();
        set({
            loadedModel: modelId,
            error: null,
            contextWindow: DEFAULT_CONTEXT_WINDOW,
            maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
        });
        await refreshModelLimits(modelId, baseUrl, configurationRevision);
    },

    generate: async (messages, onToken, options) => {
        const { baseUrl, loadedModel, configurationRevision, maxOutputTokens } = get();
        if (!loadedModel) throw new Error("No Ollama model selected");
        if (options?.model && options.model !== loadedModel) {
            throw new Error("Ollama provider contract changed: the planned model is no longer selected");
        }

        abortGeneration();
        const request = createRequest(
            options?.requestId || `ollama_generation_${++requestCounter}`,
            OLLAMA_GENERATION_TIMEOUT_MS,
            options?.signal
        );
        activeGeneration = request;
        set({ status: "generating", error: null, stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 } });

        let tokenCount = 0;
        const startTime = performance.now();
        try {
            const response = await fetch(`${baseUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: loadedModel,
                    messages,
                    stream: true,
                    options: {
                        temperature: 0.25,
                        top_p: 0.9,
                        num_predict: Math.max(1, Math.min(options?.maxTokens || maxOutputTokens, maxOutputTokens)),
                    },
                }),
                signal: request.controller.signal,
            });
            if (!response.ok) throw new Error(`Ollama request failed (${response.status})`);
            if (!response.body) throw new Error("Ollama returned no response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = "";
            let buffer = "";
            let totalResponseBytes = 0;
            const consume = (line: string) => {
                if (!line) return;
                try {
                    const token = JSON.parse(line).message?.content;
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
                    logger.warn(`Failed to parse an Ollama JSON line (${line.length} characters)`);
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalResponseBytes += value.byteLength;
                if (totalResponseBytes > OLLAMA_STREAM_MAX_BYTES) {
                    request.controller.abort();
                    throw new Error(`Ollama stream exceeded the ${OLLAMA_STREAM_MAX_BYTES}-byte response limit`);
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || "";
                if (buffer.length > OLLAMA_STREAM_LINE_MAX_CHARS) {
                    request.controller.abort();
                    throw new Error(`Ollama stream line exceeded the ${OLLAMA_STREAM_LINE_MAX_CHARS}-character limit`);
                }
                for (const line of lines) {
                    if (line.length > OLLAMA_STREAM_LINE_MAX_CHARS) {
                        request.controller.abort();
                        throw new Error(
                            `Ollama stream line exceeded the ${OLLAMA_STREAM_LINE_MAX_CHARS}-character limit`
                        );
                    }
                    consume(line.trim());
                }
            }
            if (buffer.trim()) consume(buffer.trim());
            if (request.controller.signal.aborted) throw new DOMException("Generation stopped", "AbortError");
            if (get().configurationRevision !== configurationRevision) {
                throw new Error("Ollama endpoint changed during generation");
            }
            addTokens(tokenCount, isLoopback(new URL(baseUrl).hostname));
            return fullResponse;
        } catch (error) {
            const resolved = request.timedOut
                ? Object.assign(new Error("Ollama generation timed out. Try a smaller output limit."), {
                      name: "TimeoutError",
                  })
                : error;
            if (activeGeneration === request && (resolved as Error)?.name !== "AbortError") {
                logger.error("Ollama generation failed", {
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
                    stats: { tps: Math.round(tokenCount / seconds), totalTokens: tokenCount, lastTokenTime: now },
                });
            }
        }
    },

    stop: requestId => {
        if (!activeGeneration || (requestId && activeGeneration.requestId !== requestId)) return;
        abortGeneration();
        set({ status: "ready" });
    },
}));
