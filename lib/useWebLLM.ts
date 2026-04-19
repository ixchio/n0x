"use client";

import { create } from "zustand";
import * as webllm from "@mlc-ai/web-llm";

// Complete open-source model list: 360MB → 100GB+
// All models are MLC-compiled and available via Hugging Face / MLC releases.
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
    {
        id: "Mistral-Nemo-Instruct-2407-q4f16_1-MLC",
        label: "Mistral Nemo 12B",
        desc: "Strong multilingual 12B",
        size: "~8GB",
        category: "powerful",
    },
    {
        id: "Qwen2.5-14B-Instruct-q4f16_1-MLC",
        label: "Qwen 2.5 14B",
        desc: "Near GPT-4 at 14B",
        size: "~9GB",
        category: "powerful",
    },
    {
        id: "Qwen2.5-32B-Instruct-q4f16_1-MLC",
        label: "Qwen 2.5 32B",
        desc: "Flagship 32B — very capable",
        size: "~20GB",
        category: "powerful",
    },
    {
        id: "Llama-3.3-70B-Instruct-q3f16_1-MLC",
        label: "Llama 3.3 70B",
        desc: "Meta's latest flagship — 70B",
        size: "~30GB",
        category: "powerful",
    },

    // ── REASONING — R1 distills (CoT trained) ─────────────────────────────────
    {
        id: "DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC",
        label: "R1 Qwen 1.5B",
        desc: "CoT reasoning, tiny",
        size: "~1.1GB",
        category: "reasoning",
    },
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
    {
        id: "DeepSeek-R1-Distill-Qwen-14B-q4f16_1-MLC",
        label: "R1 Qwen 14B",
        desc: "Elite 14B reasoning",
        size: "~9GB",
        category: "reasoning",
    },
    {
        id: "DeepSeek-R1-Distill-Qwen-32B-q4f16_1-MLC",
        label: "R1 Qwen 32B",
        desc: "Near o1-level at 32B",
        size: "~20GB",
        category: "reasoning",
    },
    {
        id: "DeepSeek-R1-Distill-Llama-70B-q3f16_1-MLC",
        label: "R1 Llama 70B",
        desc: "Best open reasoning, 70B",
        size: "~30GB",
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
        id: "DeepSeek-Coder-1.3B-Instruct-q4f16_1-MLC",
        label: "DeepSeek Coder 1.3B",
        desc: "Fast code generation",
        size: "~800MB",
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
        id: "Qwen2.5-Coder-32B-Instruct-q4f16_1-MLC",
        label: "Qwen Coder 32B",
        desc: "Top open-source coder",
        size: "~20GB",
        category: "coding",
    },
    {
        id: "Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC",
        label: "Qwen Math 1.5B",
        desc: "Math specialist",
        size: "~1GB",
        category: "coding",
    },
    {
        id: "Qwen2.5-Math-7B-Instruct-q4f16_1-MLC",
        label: "Qwen Math 7B",
        desc: "Pro math & logic",
        size: "~4GB",
        category: "coding",
    },

    // ── UNCENSORED ────────────────────────────────────────────────────────────
    {
        id: "WizardCoder-15B-V1.0-q4f16_1-MLC",
        label: "WizardCoder 15B",
        desc: "Uncensored coder",
        size: "~8GB",
        category: "uncensored",
    },
];

// Group models by category for the model selector UI
export const MODEL_CATEGORIES = {
    fast:      { label: "⚡ Tiny (< 1GB)",       desc: "Any device, instant responses" },
    balanced:  { label: "⚖️ Balanced (1–3GB)",   desc: "Good speed & quality" },
    powerful:  { label: "🚀 Powerful (4–30GB+)",  desc: "High quality — needs VRAM" },
    reasoning: { label: "🧠 Reasoning (R1 CoT)",  desc: "Chain-of-thought specialist" },
    coding:    { label: "💻 Coding",               desc: "Optimised for code & math" },
    uncensored:{ label: "🔓 Uncensored",           desc: "No safety filters" },
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

interface WebLLMState {
    status: WebLLMStatus;
    loadProgress: number;
    loadedModel: string | null;
    loadingModel: string | null;
    error: string | null;
    isSupported: boolean;
    stats: WebLLMStats;

    // Actions
    init: () => Promise<void>;
    loadModel: (modelId: string, force?: boolean) => Promise<void>;
    generate: (messages: ChatMessage[], onToken?: (token: string) => void, responseFormat?: { type: string; schema?: object }) => Promise<string>;
    stop: () => void;
    unload: () => Promise<void>;
}

// Module-level variables to hold non-reactive instances
let engine: webllm.MLCEngine | null = null;
let abortController: AbortController | null = null;
let isLoadingModel = false;

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
    stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 },

    init: async () => {
        if (typeof navigator === "undefined") return;
        const { status } = get();
        if (status !== "unloaded") return; // Already initialized or loading

        if (!("gpu" in navigator)) {
            set({ isSupported: false, error: "WebGPU not supported. Use Chrome 113+ or Edge 113+." });
            return;
        }

        try {
            const adapter = await (navigator as any).gpu.requestAdapter();
            if (!adapter) {
                set({ isSupported: false, error: "No WebGPU adapter found. Try updating your browser/drivers." });
            }
        } catch (e) {
            set({ isSupported: false, error: "WebGPU initialization failed." });
        }
    },

    loadModel: async (modelId: string, force: boolean = false) => {
        const { isSupported, status } = get();
        if (!isSupported || isLoadingModel) return;

        // Allow retry from error state
        if (status !== "unloaded" && status !== "ready" && status !== "error") return;

        // OOM Protection: Check navigator.deviceMemory and block heavy models on constrained devices
        const deviceMemory = (navigator as any).deviceMemory;
        if (deviceMemory && !force) {
            const model = WEBLLM_MODELS.find(m => m.id === modelId);
            if (model) {
                // If device has 4GB or less, block anything larger than 'fast' (which are > 1GB)
                if (deviceMemory <= 4 && model.category !== "fast") {
                    set({ error: `Hardware Restricted: Device reports ${deviceMemory}GB RAM. Loading this model will likely crash your browser. Please select a 'Fast' model.`, status: "error" });
                    return;
                }
                // If device has 8GB or less, warn/block massive models
                if (deviceMemory <= 8 && (model.category === "uncensored" || model.category === "powerful")) {
                    set({ error: `Hardware Restricted: Device reports ${deviceMemory}GB RAM. Loading a heavy model requires 16GB+ and may cause an Out-Of-Memory crash.`, status: "error" });
                    return;
                }
            }
        }

        isLoadingModel = true;
        try {
            set({ status: "loading", loadProgress: 0, loadingModel: modelId, error: null });

            // Cleanup previous engine (resilient to failures)
            if (engine) {
                try { await engine.unload(); } catch (e) { console.warn("Engine cleanup failed:", e); }
                engine = null;
            }

            // Create new engine with progress callback
            engine = await webllm.CreateMLCEngine(modelId, {
                initProgressCallback: (progress) => {
                    set({ loadProgress: progress.progress });
                },
            });

            // Extract context window size dynamically for agent budgeting
            const windowSize = (engine.chat as any).config?.context_window_size || 4096;
            // Update the exported module variable so useAgent can read it directly
            contextCharsLimit = Math.floor(windowSize * 4 * 0.85);

            set({ loadedModel: modelId, loadingModel: null, status: "ready" });
        } catch (e: any) {
            console.error("Model load error:", e);
            engine = null;
            set({ error: e.message || "Failed to load model", loadingModel: null, status: "error" });
        } finally {
            isLoadingModel = false;
        }
    },

    generate: async (messages: ChatMessage[], onToken?: (token: string) => void, responseFormat?: { type: string; schema?: object }) => {
        const { status } = get();
        if (!engine || status !== "ready") {
            throw new Error("Model not loaded");
        }

        set({ status: "generating" });
        abortController = new AbortController();

        // Stats tracking
        let tokenCount = 0;
        const startTime = performance.now();
        set({ stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 } });

        try {
            let fullResponse = "";

            const createOpts: any = {
                messages: messages as any,
                stream: true,
                temperature: 0.7,
                max_tokens: 4096,
            };

            // Add structured output if requested
            if (responseFormat) {
                createOpts.response_format = responseFormat;
            }

            const asyncGenerator = await engine.chat.completions.create(createOpts) as any;

            for await (const chunk of asyncGenerator) {
                if (abortController?.signal.aborted) break;

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

            // Final update
            const now = performance.now();
            const duration = (now - startTime) / 1000;
            const tps = duration > 0 ? Math.round(tokenCount / duration) : 0;
            set({ stats: { tps, totalTokens: tokenCount, lastTokenTime: now }, status: "ready" });

            return fullResponse;
        } catch (e: any) {
            if (e.name !== "AbortError") {
                console.error("Generation error:", e);
                set({ error: e.message });
            }
            set({ status: "ready" });
            throw e;
        }
    },

    stop: () => {
        if (abortController) {
            abortController.abort();
        }
    },

    unload: async () => {
        if (engine) {
            await engine.unload();
            engine = null;
        }
        set({ loadedModel: null, status: "unloaded" });
    },
}));
