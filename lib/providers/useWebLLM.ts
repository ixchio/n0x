"use client";

import { create } from "zustand";
import type { MLCEngine, WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { trackFunnelEvent } from "@/lib/core/analytics";
import { logger } from "@/lib/core/logger";
import type { GenerationOptions } from "@/lib/chat/executionPrompt";

// Curated from the model IDs in the installed WebLLM prebuilt app config.
// Keep this static so rendering the selector does not load the WebLLM runtime.
export const WEBLLM_MODELS = [
    // ── FAST / TINY (< 1GB) \u2014 works on anything ──────────────────────────────
    {
        id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
        label: "SmolLM2 360M",
        desc: "Ultra-fast, 360MB — any device",
        size: "~360MB",
        category: "fast",
    },
    {
        id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
        label: "Qwen 2.5 0.5B",
        desc: "Tiny & surprisingly capable",
        size: "~420MB",
        category: "fast",
    },
    {
        id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
        label: "TinyLlama 1.1B",
        desc: "Blazing fast chat",
        size: "~600MB",
        category: "fast",
    },
    {
        id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
        label: "SmolLM2 1.7B",
        desc: "Punches above its weight",
        size: "~900MB",
        category: "fast",
    },

    // ── BALANCED (1\u20133GB) \u2014 1\u20132GB VRAM ────────────────────────────────────────
    {
        id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
        label: "Llama 3.2 1B",
        desc: "Meta's small — excellent",
        size: "~700MB",
        category: "balanced",
    },
    {
        id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
        label: "Qwen 2.5 1.5B",
        desc: "Great coding + reasoning",
        size: "~1GB",
        category: "balanced",
    },
    {
        id: "gemma-2-2b-it-q4f16_1-MLC",
        label: "Gemma 2 2B",
        desc: "Google's updated 2B",
        size: "~1.4GB",
        category: "balanced",
    },
    {
        id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
        label: "Phi-3 Mini",
        desc: "Microsoft — strong reasoning",
        size: "~2GB",
        category: "balanced",
    },
    {
        id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
        label: "Phi-3.5 Mini",
        desc: "Smarter than Phi-3",
        size: "~2.2GB",
        category: "balanced",
    },
    {
        id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
        label: "Llama 3.2 3B",
        desc: "Strong all-rounder",
        size: "~2GB",
        category: "balanced",
    },

    // ── POWERFUL (4\u201310GB) \u2014 4\u201310GB VRAM ──────────────────────────────────────
    {
        id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
        label: "Qwen 2.5 3B",
        desc: "Excellent coder",
        size: "~2GB",
        category: "powerful",
    },
    {
        id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
        label: "Mistral 7B v0.3",
        desc: "Best 7B instruction model",
        size: "~4GB",
        category: "powerful",
    },
    {
        id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
        label: "Llama 3.1 8B",
        desc: "Meta's flagship 8B",
        size: "~4.6GB",
        category: "powerful",
    },
    {
        id: "Qwen2.5-7B-Instruct-q4f16_1-MLC",
        label: "Qwen 2.5 7B",
        desc: "Top-tier open 7B",
        size: "~4.2GB",
        category: "powerful",
    },
    {
        id: "gemma-2-9b-it-q4f16_1-MLC",
        label: "Gemma 2 9B",
        desc: "Google's best 9B",
        size: "~5.5GB",
        category: "powerful",
    },
    {
        id: "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
        label: "Hermes 2 Pro 8B",
        desc: "Tool calling specialist",
        size: "~4.5GB",
        category: "powerful",
    },

    // ── REASONING — R1 distills (CoT trained) ─────────────────────────────────
    {
        id: "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC",
        label: "R1 Qwen 7B",
        desc: "SOTA 7B reasoning",
        size: "~4.5GB",
        category: "reasoning",
    },
    {
        id: "DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC",
        label: "R1 Llama 8B",
        desc: "SOTA 8B reasoning",
        size: "~4.8GB",
        category: "reasoning",
    },

    // ── CODING ────────────────────────────────────────────────────────────────
    {
        id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
        label: "Qwen Coder 1.5B",
        desc: "Code — ultra fast",
        size: "~1GB",
        category: "coding",
    },
    {
        id: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",
        label: "Qwen Coder 7B",
        desc: "Pro code assistant",
        size: "~4GB",
        category: "coding",
    },
    {
        id: "Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC",
        label: "Qwen Math 1.5B",
        desc: "Math specialist",
        size: "~1GB",
        category: "coding",
    },
];

// Group models by category for the model selector UI
export const MODEL_CATEGORIES = {
    fast: { label: "⚡ Tiny (< 1GB)", desc: "Any device, instant responses" },
    balanced: { label: "⚖️ Balanced (1–3GB)", desc: "Good speed & quality" },
    powerful: { label: "🚀 Powerful (2–6GB)", desc: "High quality — needs VRAM" },
    reasoning: { label: "🧠 Reasoning (R1 CoT)", desc: "Chain-of-thought specialist" },
    coding: { label: "💻 Coding", desc: "Optimised for code & math" },
};

export type WebLLMStatus = "unloaded" | "loading" | "ready" | "generating" | "error";

interface ChatMessage {
    role: string;
    content: string;
}

interface WebLLMStats {
    tps: number;
    totalTokens: number;
    lastTokenTime: number;
}

interface LoadingStats {
    startTime: number;
    estimatedTimeRemaining: number | null;
    downloadSpeed: number | null;
}

// GPU capability tiers based on detected VRAM
export type GpuTier = "none" | "low" | "medium" | "high" | "unknown";

interface WebLLMState {
    status: WebLLMStatus;
    loadProgress: number;
    loadedModel: string | null;
    loadingModel: string | null;
    error: string | null;
    isSupported: boolean;
    gpuTier: GpuTier;
    gpuLabel: string;
    isMobile: boolean;
    stats: WebLLMStats;
    loadingStats: LoadingStats;
    contextWindow: number;
    maxOutputTokens: number;
    runtimeRevision: number;

    // Actions
    init: () => Promise<void>;
    loadModel: (modelId: string, force?: boolean) => Promise<void>;
    generate: (
        messages: ChatMessage[],
        onToken?: (token: string) => void,
        options?: GenerationOptions
    ) => Promise<string>;
    stop: (requestId?: string) => void;
    unload: () => Promise<void>;
}

type WebLLMRuntime = typeof import("@mlc-ai/web-llm");

// Module-level variables to hold non-reactive instances. The runtime itself is
// loaded only when a model is requested so the chat shell stays lightweight.
let engine: MLCEngine | WebWorkerMLCEngine | null = null;
let runtimePromise: Promise<WebLLMRuntime> | null = null;
let abortController: AbortController | null = null;
let activeRequestId: string | null = null;
let isLoadingModel = false;
let engineWorker: Worker | null = null;
let loadAttemptId = 0;

export const MODEL_LOAD_STALL_MS = 30_000;
const WORKER_INIT_TIMEOUT_MS = 5_000;

function loadWebLLMRuntime(): Promise<WebLLMRuntime> {
    if (!runtimePromise) {
        runtimePromise = import("@mlc-ai/web-llm").catch(error => {
            // A transient chunk/network error should be retryable.
            runtimePromise = null;
            throw error;
        });
    }
    return runtimePromise;
}

function createAbortError(): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException("Generation stopped", "AbortError");
    }
    const error = new Error("Generation stopped");
    error.name = "AbortError";
    return error;
}

function throwIfAborted(signal: AbortSignal) {
    if (signal.aborted) throw createAbortError();
}

function estimatePromptTokens(messages: ChatMessage[]): number {
    return messages.reduce((total, message) => total + Math.ceil(message.content.length / 4) + 4, 2);
}
// Keep total usage for backwards-compatible stats, but track local inference
// separately so the UI never calls Cloud/remote-provider tokens "local".
const TOKENS_KEY = "n0x_total_tokens";
const LOCAL_TOKENS_KEY = "n0x_local_tokens";
function readTokenCounter(key: string): number {
    try {
        return parseInt(localStorage.getItem(key) || "0", 10) || 0;
    } catch {
        return 0;
    }
}
export function getTotalTokens(): number {
    return readTokenCounter(TOKENS_KEY);
}
export function getLocalTokens(): number {
    return readTokenCounter(LOCAL_TOKENS_KEY);
}
export function addTokens(n: number, local = true) {
    try {
        localStorage.setItem(TOKENS_KEY, String(getTotalTokens() + n));
        if (local) localStorage.setItem(LOCAL_TOKENS_KEY, String(getLocalTokens() + n));
    } catch {}
}

/**
 * The context window budget in characters for the currently loaded model.
 * Exported so useAgent can read it without a circular dependency or window pollution.
 * Defaults to 12 000 chars (~3 000 tokens) until a model is loaded.
 */
export let contextCharsLimit = 12_000;

export const useWebLLM = create<WebLLMState>((set, get) => ({
    status: "unloaded",
    loadProgress: 0,
    loadedModel: null,
    loadingModel: null,
    error: null,
    isSupported: true,
    gpuTier: "unknown",
    gpuLabel: "",
    isMobile: false,
    stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 },
    loadingStats: { startTime: 0, estimatedTimeRemaining: null, downloadSpeed: null },
    contextWindow: 4_096,
    maxOutputTokens: 1_024,
    runtimeRevision: 0,

    init: async () => {
        if (typeof navigator === "undefined") return;
        const { status } = get();
        if (status !== "unloaded") return;

        // Mobile detection — cap model selection and warn about memory
        const isMobile =
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
            (navigator as any).userAgentData?.mobile === true ||
            (typeof screen !== "undefined" && screen.width < 768);
        set({ isMobile });

        if (!("gpu" in navigator)) {
            set({ isSupported: false, gpuTier: "none", error: "WebGPU not supported. Use Chrome 113+ or Edge 113+." });
            return;
        }

        try {
            const adapter = await (navigator as any).gpu.requestAdapter();
            if (!adapter) {
                set({
                    isSupported: false,
                    gpuTier: "none",
                    error: "No WebGPU adapter found. Try updating your browser/drivers.",
                });
                return;
            }

            // Detect GPU capabilities from adapter
            let gpuLabel = "";
            let gpuTier: GpuTier = "unknown";
            try {
                const info = (await adapter.requestAdapterInfo?.()) || (adapter as any).info;
                if (info) {
                    const desc = info.description || info.device || "";
                    const vendor = info.vendor || "";
                    gpuLabel = desc || vendor || "Unknown GPU";
                }
            } catch {
                /* adapter info not available */
            }

            // Estimate tier from device memory + GPU heuristics
            const deviceMem = (navigator as any).deviceMemory;
            if (deviceMem) {
                if (deviceMem <= 4) gpuTier = "low";
                else if (deviceMem <= 8) gpuTier = "medium";
                else gpuTier = "high";
            }

            // Mobile always caps at low (Safari Metal has 256MB–993MB per-buffer limit)
            if (isMobile) gpuTier = "low";

            // Try to get max buffer size as a VRAM proxy
            try {
                const device = await adapter.requestDevice();
                const maxBuf = device.limits.maxBufferSize;
                device.destroy();
                if (maxBuf >= 2 * 1024 * 1024 * 1024) gpuTier = isMobile ? "low" : "high";
                else if (maxBuf >= 512 * 1024 * 1024) gpuTier = gpuTier === "low" ? "low" : "medium";
                else gpuTier = "low";
            } catch {
                /* fine, use deviceMemory estimate */
            }

            set({ gpuTier, gpuLabel });
        } catch (e) {
            set({ isSupported: false, gpuTier: "none", error: "WebGPU initialization failed." });
        }
    },

    loadModel: async (modelId: string, force: boolean = false) => {
        const { isSupported, status } = get();
        if (!isSupported || isLoadingModel) return;

        // Allow retry from error state
        if (status !== "unloaded" && status !== "ready" && status !== "error") return;

        // OOM protection is an optional browser hint. Keep model loading usable
        // in SSR, tests, and browsers that do not expose deviceMemory.
        const deviceMemory =
            typeof navigator !== "undefined"
                ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
                : undefined;
        if (deviceMemory && !force) {
            const model = WEBLLM_MODELS.find(m => m.id === modelId);
            if (model) {
                // If device has 4GB or less, block anything larger than 'fast' (which are > 1GB)
                if (deviceMemory <= 4 && model.category !== "fast") {
                    set({
                        error: `Hardware Restricted: Device reports ${deviceMemory}GB RAM. Loading this model will likely crash your browser. Please select a 'Fast' model.`,
                        status: "error",
                    });
                    return;
                }
                // If device has 8GB or less, warn/block massive models
                if (deviceMemory <= 8 && model.category === "powerful") {
                    set({
                        error: `Hardware Restricted: Device reports ${deviceMemory}GB RAM. Loading a heavy model requires 16GB+ and may cause an Out-Of-Memory crash.`,
                        status: "error",
                    });
                    return;
                }
            }
        }

        isLoadingModel = true;
        const attemptId = ++loadAttemptId;
        let stallWatchdog: ReturnType<typeof setInterval> | null = null;
        let workerInitTimeout: ReturnType<typeof setTimeout> | null = null;
        let candidateWorker: Worker | null = null;
        try {
            const selectedModel = WEBLLM_MODELS.find(m => m.id === modelId);
            trackFunnelEvent("model_load_started", {
                provider: "browser",
                modelCategory: selectedModel?.category || "unknown",
                force,
            });
            const startTime = Date.now();
            set({
                status: "loading",
                loadProgress: 0,
                loadingModel: modelId,
                error: null,
                loadingStats: { startTime, estimatedTimeRemaining: null, downloadSpeed: null },
            });

            // Cleanup previous engine (resilient to failures)
            if (engine) {
                try {
                    await engine.unload();
                } catch (e) {
                    logger.warn("Engine cleanup failed:", e);
                }
                engine = null;
            }
            engineWorker?.terminate();
            engineWorker = null;

            const webllm = await loadWebLLMRuntime();

            let lastProgress = 0;
            let lastProgressTime = startTime;
            let stallRejected = false;
            let rejectStall!: (error: Error) => void;
            const stallFailure = new Promise<never>((_, reject) => {
                rejectStall = reject;
            });
            stallWatchdog = setInterval(() => {
                if (stallRejected || attemptId !== loadAttemptId) return;
                if (Date.now() - lastProgressTime < MODEL_LOAD_STALL_MS) return;

                stallRejected = true;
                candidateWorker?.terminate();
                const error = new Error(
                    `Model download stalled at ${Math.round(lastProgress * 100)}%. Try a smaller model or check your connection.`
                );
                error.name = "ModelLoadStalledError";
                rejectStall(error);
            }, 1_000);

            const initOpts = {
                initProgressCallback: (progress: any) => {
                    if (attemptId !== loadAttemptId) return;
                    const current = Number(progress.progress) || 0;
                    const now = Date.now();
                    if (current > lastProgress) {
                        const elapsedSec = Math.max(0.001, (now - lastProgressTime) / 1_000);
                        const progressDelta = current - lastProgress;
                        set({
                            loadingStats: {
                                startTime,
                                estimatedTimeRemaining:
                                    current < 1 ? Math.round(((1 - current) / progressDelta) * elapsedSec) : 0,
                                downloadSpeed: progressDelta / elapsedSec,
                            },
                        });
                        lastProgress = current;
                        lastProgressTime = now;
                    }
                    set({ loadProgress: current });
                },
            };

            let nextEngine: MLCEngine | WebWorkerMLCEngine;
            if (typeof Worker === "undefined") {
                const mainEnginePromise = webllm.CreateMLCEngine(modelId, initOpts);
                void mainEnginePromise
                    .then(lateEngine => {
                        if (stallRejected || attemptId !== loadAttemptId) {
                            return lateEngine.unload().catch(() => undefined);
                        }
                    })
                    .catch(() => undefined);
                nextEngine = await Promise.race([mainEnginePromise, stallFailure]);
            } else {
                candidateWorker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });
                engineWorker = candidateWorker;
                let workerSuperseded = false;
                try {
                    const initialWorkerTimeout = new Promise<never>((_, reject) => {
                        workerInitTimeout = setTimeout(() => {
                            if (lastProgress > 0) return;
                            const error = new Error("Worker init timeout");
                            error.name = "WorkerInitTimeoutError";
                            reject(error);
                        }, WORKER_INIT_TIMEOUT_MS);
                    });
                    const workerEnginePromise = webllm.CreateWebWorkerMLCEngine(candidateWorker, modelId, initOpts);
                    void workerEnginePromise
                        .then(lateEngine => {
                            if (workerSuperseded || stallRejected || attemptId !== loadAttemptId) {
                                return lateEngine.unload().catch(() => undefined);
                            }
                        })
                        .catch(() => undefined);
                    nextEngine = await Promise.race([workerEnginePromise, initialWorkerTimeout, stallFailure]);
                } catch (error) {
                    workerSuperseded = true;
                    candidateWorker.terminate();
                    if (engineWorker === candidateWorker) engineWorker = null;
                    candidateWorker = null;
                    if (!(error instanceof Error) || error.name !== "WorkerInitTimeoutError") throw error;

                    // A worker that never starts can fall back. A worker that
                    // starts and later stalls is terminated and reported.
                    lastProgress = 0;
                    lastProgressTime = Date.now();
                    set({ loadProgress: 0 });
                    const mainEnginePromise = webllm.CreateMLCEngine(modelId, initOpts);
                    void mainEnginePromise
                        .then(lateEngine => {
                            if (stallRejected || attemptId !== loadAttemptId) {
                                return lateEngine.unload().catch(() => undefined);
                            }
                        })
                        .catch(() => undefined);
                    nextEngine = await Promise.race([mainEnginePromise, stallFailure]);
                } finally {
                    if (workerInitTimeout) clearTimeout(workerInitTimeout);
                    workerInitTimeout = null;
                }
            }

            if (attemptId !== loadAttemptId) {
                await nextEngine.unload().catch(() => undefined);
                throw createAbortError();
            }
            engine = nextEngine;
            if (!candidateWorker) engineWorker = null;

            // Extract context window size dynamically for agent budgeting
            const windowSize = (engine.chat as any).config?.context_window_size || 4096;
            // Update the exported module variable so useAgent can read it directly
            contextCharsLimit = Math.floor(windowSize * 4 * 0.85);

            const configuredMaxOutput = Number((engine.chat as any).config?.max_output_tokens);
            const maxOutputTokens =
                configuredMaxOutput > 0
                    ? Math.min(configuredMaxOutput, windowSize - 1)
                    : Math.min(4_096, windowSize / 4);
            set(state => ({
                loadedModel: modelId,
                loadingModel: null,
                status: "ready",
                contextWindow: windowSize,
                maxOutputTokens: Math.max(1, Math.floor(maxOutputTokens)),
                runtimeRevision: state.runtimeRevision + 1,
            }));
            trackFunnelEvent("model_load_succeeded", {
                provider: "browser",
                modelCategory: selectedModel?.category || "unknown",
            });
        } catch (e: any) {
            if (attemptId !== loadAttemptId || e?.name === "AbortError") return;
            logger.error("Model load error:", e);
            engine = null;
            engineWorker?.terminate();
            engineWorker = null;
            // Make error messages human-readable
            const raw = e.message || "Failed to load model";
            const friendly =
                raw.includes("memory") || raw.includes("OOM")
                    ? "Out of memory — this model is too large for your GPU. Try a smaller model or switch to Cloud API."
                    : raw.includes("timeout") || raw.includes("Worker")
                      ? "Model failed to initialize. Your browser may need a restart, or try a smaller model."
                      : raw.includes("network") || raw.includes("fetch")
                        ? "Download failed — check your internet connection and try again."
                        : raw;
            set({ error: friendly, loadingModel: null, status: "error" });
            trackFunnelEvent("model_load_failed", {
                provider: "browser",
                reason: friendly.slice(0, 80),
            });
        } finally {
            if (stallWatchdog) clearInterval(stallWatchdog);
            if (workerInitTimeout) clearTimeout(workerInitTimeout);
            isLoadingModel = false;
        }
    },

    generate: async (messages: ChatMessage[], onToken?: (token: string) => void, options?: GenerationOptions) => {
        const { status, loadedModel, contextWindow, maxOutputTokens } = get();
        if (!engine || status !== "ready") {
            throw new Error("Model not loaded");
        }
        if (options?.model && options.model !== loadedModel) {
            throw new Error("WebLLM provider contract changed: the planned model is no longer loaded");
        }
        if (options?.signal.aborted) throw createAbortError();

        const promptTokens = estimatePromptTokens(messages);
        const availableOutputTokens = contextWindow - promptTokens;
        if (availableOutputTokens < 1) {
            throw new Error("Prompt exceeds the loaded WebLLM model context window");
        }
        const requestedMaxTokens = options?.maxTokens || maxOutputTokens;
        const safeMaxTokens = Math.max(1, Math.min(requestedMaxTokens, maxOutputTokens, availableOutputTokens));

        if (abortController) {
            abortController.abort();
            void Promise.resolve(engine.interruptGenerate()).catch(() => undefined);
        }

        const activeEngine = engine;
        const controller = new AbortController();
        abortController = controller;
        const requestId = options?.requestId || `webllm_${Date.now()}`;
        activeRequestId = requestId;
        const abortFromPlan = () => {
            controller.abort();
            void Promise.resolve(activeEngine.interruptGenerate()).catch(error => {
                logger.warn("Failed to interrupt WebLLM generation:", error);
            });
        };
        options?.signal.addEventListener("abort", abortFromPlan, { once: true });
        throwIfAborted(controller.signal);
        set({ status: "generating", error: null });

        // Stats tracking
        let tokenCount = 0;
        const startTime = performance.now();
        set({ stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 } });

        try {
            let fullResponse = "";

            const createOpts: any = {
                messages: messages as any,
                stream: true,
                temperature: 0.25,
                top_p: 0.9,
                max_tokens: safeMaxTokens,
            };

            // Add structured output if requested
            if (options?.responseFormat) {
                createOpts.response_format = options.responseFormat;
            }

            const asyncGenerator = (await activeEngine.chat.completions.create(createOpts)) as any;
            throwIfAborted(controller.signal);

            for await (const chunk of asyncGenerator) {
                // The engine interrupt ends decoding; the local signal makes a
                // stopped stream reject instead of looking like a successful,
                // second copy of the partial response to the chat orchestrator.
                throwIfAborted(controller.signal);

                const token = chunk.choices[0]?.delta?.content || "";
                fullResponse += token;

                // Update stats
                tokenCount++;
                const now = performance.now();
                const duration = (now - startTime) / 1000;
                const tps = duration > 0 ? Math.round(tokenCount / duration) : 0;

                // Update state every 5 tokens to prevent react scheduler overload
                if (tokenCount % 5 === 0) {
                    set({ stats: { tps, totalTokens: tokenCount, lastTokenTime: now } });
                }

                onToken?.(token);
            }

            throwIfAborted(controller.signal);

            return fullResponse;
        } catch (e: any) {
            if (controller.signal.aborted) {
                throw createAbortError();
            }
            if (e.name !== "AbortError") {
                logger.error("Generation error:", e);
                set({ error: e.message });
            }
            throw e;
        } finally {
            options?.signal.removeEventListener("abort", abortFromPlan);
            const now = performance.now();
            const duration = (now - startTime) / 1000;
            const tps = duration > 0 ? Math.round(tokenCount / duration) : 0;
            if (abortController === controller) {
                set({
                    stats: { tps, totalTokens: tokenCount, lastTokenTime: now },
                    status: "ready",
                });
            }
            if (tokenCount > 0) addTokens(tokenCount);
            if (abortController === controller) {
                abortController = null;
                activeRequestId = null;
            }
        }
    },

    stop: (requestId?: string) => {
        const controller = abortController;
        if (!controller || (requestId && requestId !== activeRequestId)) return;

        controller.abort();
        try {
            // AbortController only guards N0X's stream consumer. WebLLM also
            // needs its own interrupt signal to stop GPU decoding immediately.
            void Promise.resolve(engine?.interruptGenerate()).catch(error => {
                logger.warn("Failed to interrupt WebLLM generation:", error);
            });
        } catch (error) {
            logger.warn("Failed to interrupt WebLLM generation:", error);
        }
    },

    unload: async () => {
        loadAttemptId += 1;
        isLoadingModel = false;
        engineWorker?.terminate();
        engineWorker = null;
        if (engine) {
            await engine.unload();
            engine = null;
        }
        set(state => ({ loadedModel: null, status: "unloaded", runtimeRevision: state.runtimeRevision + 1 }));
    },
}));
