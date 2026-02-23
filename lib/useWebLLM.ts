"use client";

import { create } from "zustand";
import * as webllm from "@mlc-ai/web-llm";

// Comprehensive list of WebLLM models - 2024/2025
export const WEBLLM_MODELS = [
    // === FAST / SMALL (< 1GB) ===
    {
        id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
        label: "SmolLM2 360M",
        desc: "Ultra fast, lightweight",
        size: "~250MB",
        category: "fast",
    },
    {
        id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
        label: "Qwen 2.5 0.5B",
        desc: "Tiny but capable",
        size: "~350MB",
        category: "fast",
    },
    {
        id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
        label: "TinyLlama 1.1B",
        desc: "Fast general chat",
        size: "~600MB",
        category: "fast",
    },

    // === BALANCED (1-2GB) ===
    {
        id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
        label: "Llama 3.2 1B",
        desc: "Meta's latest small",
        size: "~700MB",
        category: "balanced",
    },
    {
        id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
        label: "Qwen 2.5 1.5B",
        desc: "Great for coding",
        size: "~1GB",
        category: "balanced",
    },
    {
        id: "gemma-2b-it-q4f16_1-MLC",
        label: "Gemma 2B",
        desc: "Google's efficient",
        size: "~1.2GB",
        category: "balanced",
    },
    {
        id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
        label: "Phi-3 Mini 4K",
        desc: "Microsoft reasoning",
        size: "~2GB",
        category: "balanced",
    },
    {
        id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
        label: "Phi-3.5 Mini",
        desc: "Smarter reasoning",
        size: "~2GB",
        category: "balanced",
    },

    // === POWERFUL (2-4GB) ===
    {
        id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
        label: "Llama 3.2 3B",
        desc: "Strong all-rounder",
        size: "~2GB",
        category: "powerful",
    },
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
        desc: "Top quality",
        size: "~4GB",
        category: "powerful",
    },
    {
        id: "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
        label: "Hermes 2 Pro 8B",
        desc: "Function calling",
        size: "~4.5GB",
        category: "powerful",
    },

    // === CODING FOCUSED ===
    {
        id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
        label: "Qwen Coder 1.5B",
        desc: "Code specialist",
        size: "~1GB",
        category: "coding",
    },
    {
        id: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",
        label: "Qwen Coder 7B",
        desc: "Pro coder",
        size: "~4GB",
        category: "coding",
    },
    {
        id: "DeepSeek-Coder-1.3B-Instruct-q4f16_1-MLC",
        label: "DeepSeek Coder 1.3B",
        desc: "Fast code gen",
        size: "~800MB",
        category: "coding",
    },

    // === UNCENSORED ===
    {
        id: "WizardCoder-15B-V1.0-q4f16_1-MLC",
        label: "WizardCoder 15B",
        desc: "Uncensored coder",
        size: "~8GB",
        category: "uncensored",
    },
];

// Group models by category
export const MODEL_CATEGORIES = {
    fast: { label: "⚡ Fast (< 1GB)", desc: "Quick responses, lower quality" },
    balanced: { label: "⚖️ Balanced (1-2GB)", desc: "Good speed and quality" },
    powerful: { label: "🚀 Powerful (2-4GB+)", desc: "Best quality, slower" },
    coding: { label: "💻 Coding", desc: "Optimized for code" },
    uncensored: { label: "🔓 Uncensored", desc: "No filters" },
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
    loadModel: (modelId: string) => Promise<void>;
    generate: (messages: ChatMessage[], onToken?: (token: string) => void) => Promise<string>;
    stop: () => void;
    unload: () => Promise<void>;
}

// Module-level variables to hold non-reactive instances
let engine: webllm.MLCEngine | null = null;
let abortController: AbortController | null = null;
let isLoadingModel = false;

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

    loadModel: async (modelId: string) => {
        const { isSupported } = get();
        if (!isSupported || isLoadingModel) return;

        // OOM Protection: Check navigator.deviceMemory and block heavy models on constrained devices
        const deviceMemory = (navigator as any).deviceMemory;
        if (deviceMemory) {
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

            set({ loadedModel: modelId, loadingModel: null, status: "ready" });
        } catch (e: any) {
            console.error("Model load error:", e);
            engine = null;
            set({ error: e.message || "Failed to load model", loadingModel: null, status: "error" });
        } finally {
            isLoadingModel = false;
        }
    },

    generate: async (messages: ChatMessage[], onToken?: (token: string) => void) => {
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

            const asyncGenerator = await engine.chat.completions.create({
                messages: messages as any,
                stream: true,
                temperature: 0.7,
                max_tokens: 2048,
            });

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
