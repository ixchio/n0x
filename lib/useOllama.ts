"use client";

import { create } from "zustand";

export type OllamaStatus = "unloaded" | "ready" | "generating" | "error";

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
    pollInterval: NodeJS.Timeout | null;

    // Actions
    init: () => Promise<void>;
    startPolling: () => void;
    stopPolling: () => void;
    loadModel: (modelId: string) => Promise<void>;
    generate: (messages: ChatMessage[], onToken?: (token: string) => void) => Promise<string>;
    stop: () => void;
    setBaseUrl: (url: string) => void;
}

let abortController: AbortController | null = null;

export const useOllama = create<OllamaState>((set, get) => ({
    status: "unloaded",
    models: [],
    loadedModel: null,
    error: null,
    isSupported: false,
    stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 },
    baseUrl: "http://localhost:11434",
    pollInterval: null,

    setBaseUrl: (url: string) => {
        set({ baseUrl: url });
        get().init();
    },

    init: async () => {
        const { baseUrl } = get();
        try {
            const res = await fetch(`${baseUrl}/api/tags`);
            if (!res.ok) throw new Error("Failed to fetch Ollama models");
            const data = await res.json();
            const models = data.models.map((m: any) => ({
                name: m.name,
                size: m.size,
            }));
            set({ 
                isSupported: true, 
                models, 
                status: "ready", 
                error: null,
                loadedModel: get().loadedModel || (models.length > 0 ? models[0].name : null)
            });
        } catch (e: any) {
            // If the error is a fetch TypeError, it's likely CORS or the server is down.
            let errorMsg = "Ollama not reachable at " + baseUrl;
            if (e.message === "Failed to fetch") {
                 errorMsg = `Cannot connect to Ollama. Make sure it's running and CORS is enabled: \`OLLAMA_ORIGINS="*" ollama serve\``;
            }
            set({ isSupported: false, error: errorMsg, status: "error" });
        }
    },

    startPolling: () => {
        // Stop any existing polling first
        get().stopPolling();
        
        // Initial check
        get().init();
        
        // Poll every 3 seconds
        const interval = setInterval(() => {
            get().init();
        }, 3000);
        
        set({ pollInterval: interval });
    },

    stopPolling: () => {
        const { pollInterval } = get() as any;
        if (pollInterval) {
            clearInterval(pollInterval);
            set({ pollInterval: null });
        }
    },

    loadModel: async (modelId: string) => {
        // Ollama loads models implicitly during generation, but we set it here for UI state
        set({ loadedModel: modelId, error: null });
    },

    generate: async (messages: ChatMessage[], onToken?: (token: string) => void) => {
        const { baseUrl, loadedModel } = get();
        if (!loadedModel) throw new Error("No Ollama model selected");

        set({ status: "generating", error: null });
        abortController = new AbortController();

        let tokenCount = 0;
        const startTime = performance.now();
        set({ stats: { tps: 0, totalTokens: 0, lastTokenTime: 0 } });

        try {
            const res = await fetch(`${baseUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: loadedModel,
                    messages,
                    stream: true,
                }),
                signal: abortController.signal,
            });

            if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`);
            if (!res.body) throw new Error("No response body");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n").filter(l => l.trim() !== "");

                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.message?.content) {
                            const token = parsed.message.content;
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
                        console.warn("Failed to parse Ollama JSON line", line);
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
                console.error("Ollama generation error:", e);
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
}));
