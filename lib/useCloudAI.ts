"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

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

    // Actions
    init: () => void;
    loadModel: (modelId: string) => Promise<void>;
    generate: (messages: ChatMessage[], onToken?: (token: string) => void) => Promise<string>;
    stop: () => void;
    setCredentials: (baseUrl: string, apiKey: string) => void;
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
    "deepseek-r1-distill-llama-70b"
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

            setCredentials: (baseUrl: string, apiKey: string) => {
                set({ baseUrl: baseUrl || DEFAULT_BASE_URL, apiKey });
                // If it's groq, reset models to Groq models
                if (baseUrl.includes("groq.com")) {
                    set({ models: GROQ_MODELS });
                } else if (baseUrl.includes("openrouter.ai")) {
                     set({ models: ["liquid/lfm-40b", "google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct"] });
                }
            },

            init: () => {
                const { apiKey } = get();
                if (!apiKey) {
                    set({ error: "API Key required for Cloud AI", isSupported: false });
                } else {
                    set({ error: null, isSupported: true, status: "ready" });
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
                            "Authorization": `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: loadedModel,
                            messages,
                            stream: true,
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

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split("\n").filter(l => l.trim() !== "" && l.trim() !== "data: [DONE]");

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                try {
                                    const parsed = JSON.parse(line.slice(6));
                                    if (parsed.choices?.[0]?.delta?.content) {
                                        const token = parsed.choices[0].delta.content;
                                        fullResponse += token;
                                        tokenCount++;
                                        
                                        const now = performance.now();
                                        const duration = (now - startTime) / 1000;
                                        const tps = duration > 0 ? Math.round(tokenCount / duration) : 0;
                                        
                                        if (tokenCount % 5 === 0) {
                                            set({ stats: { tps, totalTokens: tokenCount, lastTokenTime: now } });
                                        }
                                        
                                        onToken?.(token);
                                    }
                                } catch (e) {
                                    // ignore parse errors for partial chunks
                                }
                            }
                        }
                    }

                    const now = performance.now();
                    const duration = (now - startTime) / 1000;
                    const tps = duration > 0 ? Math.round(tokenCount / duration) : 0;
                    set({ stats: { tps, totalTokens: tokenCount, lastTokenTime: now }, status: "ready" });

                    return fullResponse;
                } catch (e: any) {
                    if (e.name !== "AbortError") {
                        console.error("Cloud API generation error:", e);
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
                set({ status: "ready" });
            }
        }),
        {
            name: "n0x-cloud-storage",
            storage: sessionStorageAdapter as any,
            partialize: (state) => ({ baseUrl: state.baseUrl, apiKey: state.apiKey }),
        }
    )
);
