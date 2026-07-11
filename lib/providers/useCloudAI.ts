"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
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

    // Actions
    init: () => void;
    loadModel: (modelId: string) => Promise<void>;
    generate: (messages: ChatMessage[], onToken?: (token: string) => void) => Promise<string>;
    stop: () => void;
    setCredentials: (baseUrl: string, apiKey: string) => void;
    fetchModels: () => Promise<void>;
}

let abortController: AbortController | null = null;

// Default to Groq for insanely fast free inference, but fully customizable
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
    "deepseek-r1-distill-llama-70b",
];

// Custom sessionStorage adapter — API keys should NOT persist in localStorage
// across browser sessions (XSS risk). sessionStorage clears on tab close.
const sessionStorageAdapter = {
    getItem: (name: string) => {
        if (typeof window === "undefined") return null;
        return sessionStorage.getItem(name);
    },
    setItem: (name: string, value: string) => {
        if (typeof window === "undefined") return;
        sessionStorage.setItem(name, value);
    },
    removeItem: (name: string) => {
        if (typeof window === "undefined") return;
        sessionStorage.removeItem(name);
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

            setCredentials: (baseUrl: string, apiKey: string) => {
                const url = baseUrl || DEFAULT_BASE_URL;
                set({ baseUrl: url, apiKey });
                if (url.includes("groq.com")) {
                    set({ models: GROQ_MODELS, loadedModel: get().loadedModel || DEFAULT_MODEL });
                } else if (url.includes("openrouter.ai")) {
                    const orModels = ["liquid/lfm-40b", "google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct"];
                    set({
                        models: orModels,
                        loadedModel:
                            get().loadedModel && orModels.includes(get().loadedModel!)
                                ? get().loadedModel
                                : orModels[0],
                    });
                }
                // Auto-fetch models when both credentials are set
                if (apiKey && url) {
                    // Debounce — small delay to avoid fetching on every keystroke
                    setTimeout(() => {
                        const current = get();
                        if (current.apiKey === apiKey && current.baseUrl === url) {
                            current.fetchModels();
                        }
                    }, 500);
                }
            },

            fetchModels: async () => {
                const { baseUrl, apiKey } = get();
                if (!apiKey || !baseUrl) return;
                set({ fetchingModels: true });
                try {
                    const res = await fetch(`${baseUrl}/models`, {
                        headers: { Authorization: `Bearer ${apiKey}` },
                    });
                    if (!res.ok) {
                        // Not all providers support /models — fall back silently
                        set({ fetchingModels: false });
                        return;
                    }
                    const data = await res.json();
                    const fetched: string[] = (data.data || []).map((m: any) => m.id).filter(Boolean);
                    if (fetched.length > 0) {
                        const currentModel = get().loadedModel;
                        set({
                            models: fetched,
                            loadedModel: currentModel && fetched.includes(currentModel) ? currentModel : fetched[0],
                        });
                    }
                } catch {
                    // Network error — keep existing model list
                } finally {
                    set({ fetchingModels: false });
                }
            },

            init: () => {
                const { apiKey } = get();
                if (!apiKey) {
                    set({ error: "API Key required for Cloud AI", isSupported: false });
                } else {
                    set({ error: null, isSupported: true, status: "ready" });
                    get().fetchModels();
                }
            },

            loadModel: async (modelId: string) => {
                set({ loadedModel: modelId, error: null });
            },

            generate: async (messages: ChatMessage[], onToken?: (token: string) => void) => {
                const { baseUrl, apiKey, loadedModel } = get();
                if (!apiKey) throw new Error("API Key missing. Please configure Cloud AI settings.");
                if (!loadedModel) throw new Error("No model selected");

                set({ status: "generating", error: null });
                abortController = new AbortController();

                let tokenCount = 0;
                const startTime = performance.now();
                set({ stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 } });

                try {
                    const res = await fetch(`${baseUrl}/chat/completions`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify({
                            model: loadedModel,
                            messages,
                            stream: true,
                            temperature: 0.25,
                            top_p: 0.9,
                        }),
                        signal: abortController.signal,
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.error?.message || `API error: ${res.statusText}`);
                    }
                    if (!res.body) throw new Error("No response body");

                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let fullResponse = "";
                    let sseBuffer = "";

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            if (sseBuffer.trim()) {
                                consumeSSELine(sseBuffer.trim());
                            }
                            break;
                        }

                        sseBuffer += decoder.decode(value, { stream: true });
                        const lines = sseBuffer.split(/\r?\n/);
                        sseBuffer = lines.pop() || "";

                        for (const line of lines) {
                            consumeSSELine(line.trim());
                        }
                    }

                    function consumeSSELine(line: string) {
                        if (!line || line === "data: [DONE]" || !line.startsWith("data: ")) return;
                        try {
                            const parsed = JSON.parse(line.slice(6));
                            const token = parsed.choices?.[0]?.delta?.content;
                            if (!token) return;

                            fullResponse += token;
                            tokenCount++;

                            const now = performance.now();
                            const duration = (now - startTime) / 1000;
                            const tps = duration > 0 ? Math.round(tokenCount / duration) : 0;

                            if (tokenCount % 5 === 0) {
                                set({ stats: { tps, totalTokens: tokenCount, lastTokenTime: now } });
                            }

                            onToken?.(token);
                        } catch {
                            // Keep streaming even if a provider emits a non-standard event.
                        }
                    }

                    const now = performance.now();
                    const duration = (now - startTime) / 1000;
                    const tps = duration > 0 ? Math.round(tokenCount / duration) : 0;
                    set({ stats: { tps, totalTokens: tokenCount, lastTokenTime: now }, status: "ready" });
                    addTokens(tokenCount);
                    abortController = null; // Reset after successful completion

                    return fullResponse;
                } catch (e: any) {
                    if (e.name !== "AbortError") {
                        logger.error("Cloud API generation error:", e);
                        set({ error: e.message });
                    }
                    set({ status: "ready" });
                    throw e;
                }
            },

            stop: () => {
                if (abortController) {
                    abortController.abort();
                    abortController = null; // Reset after abort
                }
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
