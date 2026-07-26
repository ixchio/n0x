"use client";

import { create } from "zustand";
import { addTokens } from "@/lib/providers/useWebLLM";
import { logger } from "@/lib/core/logger";
import type { GenerationOptions } from "@/lib/chat/executionPrompt";

// Chrome Built-in AI (Gemini Nano) — on-device inference after Chrome has the model.
// Uses the Prompt API: https://developer.chrome.com/docs/ai/prompt-api
// Available in Chrome 138+ with Gemini Nano downloaded on-device.

export type ChromeAIStatus = "unavailable" | "checking" | "downloadable" | "downloading" | "ready" | "generating";

interface ChromeAIState {
    status: ChromeAIStatus;
    isSupported: boolean;
    error: string | null;
    contextWindow: number;
    maxOutputTokens: number;
    runtimeRevision: number;

    init: () => Promise<void>;
    load: () => Promise<void>;
    generate: (
        messages: { role: string; content: string }[],
        onToken?: (token: string) => void,
        options?: GenerationOptions
    ) => Promise<string>;
    stop: (requestId?: string) => void;
}

interface ChromeAISession {
    promptStreaming: (prompt: string, options: { signal: AbortSignal }) => Promise<AsyncIterable<unknown>>;
    destroy?: () => void;
}

interface ActiveGeneration {
    requestId: string;
    controller: AbortController;
    session: ChromeAISession | null;
    detachParent?: () => void;
}

let activeGeneration: ActiveGeneration | null = null;

function createAbortError(): DOMException {
    return new DOMException("The operation was aborted", "AbortError");
}

function destroySession(generation: ActiveGeneration): void {
    const currentSession = generation.session;
    generation.session = null;

    try {
        currentSession?.destroy?.();
    } catch (error) {
        logger.warn("Failed to destroy Chrome AI session:", error);
    }
}

function abortGeneration(generation: ActiveGeneration): void {
    generation.controller.abort();
    destroySession(generation);
}

export const useChromeAI = create<ChromeAIState>((set, get) => ({
    status: "unavailable",
    isSupported: false,
    error: null,
    contextWindow: 4_096,
    maxOutputTokens: 1_024,
    runtimeRevision: 0,

    init: async () => {
        if (typeof window === "undefined") return;

        // Check for the Prompt API (LanguageModel or ai.languageModel)
        const lm = (globalThis as any).LanguageModel ?? (globalThis as any).ai?.languageModel;
        if (!lm) {
            set({ isSupported: false, status: "unavailable" });
            return;
        }

        set({ status: "checking" });
        try {
            const availability = await lm.availability();
            if (availability === "available" || availability === "readily") {
                set(state => ({
                    isSupported: true,
                    status: "ready",
                    error: null,
                    runtimeRevision: state.runtimeRevision + 1,
                }));
            } else if (availability === "downloadable") {
                // Availability probes must never trigger a model installation. The
                // user explicitly starts that with load() after choosing Chrome AI.
                set({ isSupported: true, status: "downloadable", error: null });
            } else if (availability === "downloading") {
                set({ isSupported: true, status: "downloading", error: null });
            } else {
                set({
                    isSupported: false,
                    status: "unavailable",
                    error: "Chrome AI model not available on this device.",
                });
            }
        } catch (e: any) {
            set({ isSupported: false, status: "unavailable", error: e.message || "Chrome AI check failed" });
        }
    },

    load: async () => {
        if (typeof window === "undefined") return;
        const lm = (globalThis as any).LanguageModel ?? (globalThis as any).ai?.languageModel;
        if (!lm) {
            set({ isSupported: false, status: "unavailable", error: "Chrome AI is not available in this browser." });
            return;
        }

        try {
            const availability = await lm.availability();
            if (availability === "available" || availability === "readily") {
                set(state => ({
                    isSupported: true,
                    status: "ready",
                    error: null,
                    runtimeRevision: state.runtimeRevision + 1,
                }));
                return;
            }
            if (availability !== "downloadable" && availability !== "downloading") {
                set({
                    isSupported: false,
                    status: "unavailable",
                    error: "Chrome AI model is not available on this device.",
                });
                return;
            }

            set({ isSupported: true, status: "downloading", error: null });
            const downloadSession = (await lm.create()) as ChromeAISession;
            try {
                downloadSession.destroy?.();
            } catch (error) {
                logger.warn("Failed to destroy Chrome AI setup session:", error);
            }
            set(state => ({ status: "ready", error: null, runtimeRevision: state.runtimeRevision + 1 }));
        } catch (error: any) {
            set({
                isSupported: true,
                status: "downloadable",
                error: error?.message || "Chrome AI setup failed. Try again or choose another provider.",
            });
        }
    },

    generate: async (messages, onToken, options) => {
        const lm = (globalThis as any).LanguageModel ?? (globalThis as any).ai?.languageModel;
        if (!lm) throw new Error("Chrome AI not available");
        if (options?.model && options.model !== "gemini-nano") {
            throw new Error("Chrome AI provider contract changed: the planned model is unavailable");
        }

        // A Prompt API session retains model context. Never reuse one across
        // requests, otherwise switching conversations can leak prior prompts
        // into the next response. A newer request supersedes any in-flight one.
        if (activeGeneration) abortGeneration(activeGeneration);

        const generation: ActiveGeneration = {
            requestId: options?.requestId || `chrome_${Date.now()}`,
            controller: new AbortController(),
            session: null,
        };
        if (options?.signal) {
            const abortFromPlan = () => abortGeneration(generation);
            if (options.signal.aborted) abortFromPlan();
            else {
                options.signal.addEventListener("abort", abortFromPlan, { once: true });
                generation.detachParent = () => options.signal.removeEventListener("abort", abortFromPlan);
            }
        }
        activeGeneration = generation;
        set({ status: "generating", error: null });

        try {
            generation.session = (await lm.create()) as ChromeAISession;
            if (generation.controller.signal.aborted) {
                throw createAbortError();
            }

            // Build a single prompt from messages (Gemini Nano uses simple prompting)
            const systemMsg = messages.find(m => m.role === "system");
            const conversationMsgs = messages.filter(m => m.role !== "system");
            let prompt = "";
            if (systemMsg) prompt += `System: ${systemMsg.content}\n\n`;
            for (const m of conversationMsgs) {
                const role = m.role === "user" ? "User" : "Assistant";
                prompt += `${role}: ${m.content}\n`;
            }
            prompt += "Assistant:";

            // Stream the response
            // Note: Chrome Prompt API v1 does not support temperature/top_p parameters
            // Consistency with other providers is limited by browser API constraints
            const stream = await generation.session.promptStreaming(prompt, {
                signal: generation.controller.signal,
            });

            let fullResponse = "";
            // Chrome Prompt API: older versions return cumulative text,
            // newer versions (138+) may return delta chunks.
            // Auto-detect on the second chunk.
            let isCumulative: boolean | null = null;

            for await (const chunk of stream) {
                if (generation.controller.signal.aborted) break;
                const text = typeof chunk === "string" ? chunk : String(chunk);
                if (!text) continue;

                if (fullResponse.length === 0) {
                    // First chunk — both modes behave the same
                    fullResponse = text;
                    onToken?.(text);
                } else if (isCumulative === null) {
                    // Second chunk — detect: if it starts with existing text, it's cumulative
                    isCumulative = text.length > fullResponse.length && text.startsWith(fullResponse);
                    if (isCumulative) {
                        const delta = text.slice(fullResponse.length);
                        fullResponse = text;
                        if (delta) onToken?.(delta);
                    } else {
                        fullResponse += text;
                        onToken?.(text);
                    }
                } else if (isCumulative) {
                    const delta = text.slice(fullResponse.length);
                    fullResponse = text;
                    if (delta) onToken?.(delta);
                } else {
                    fullResponse += text;
                    onToken?.(text);
                }
            }

            if (generation.controller.signal.aborted) throw createAbortError();

            // Estimate tokens from response length (~4 chars per token)
            addTokens(Math.ceil(fullResponse.length / 4));
            return fullResponse;
        } catch (e: any) {
            if (e.name !== "AbortError" && !generation.controller.signal.aborted) {
                logger.error("Chrome AI error:", e);
                if (activeGeneration === generation) set({ error: e.message });
            }
            throw e;
        } finally {
            generation.detachParent?.();
            destroySession(generation);
            if (activeGeneration === generation) {
                activeGeneration = null;
                set({ status: "ready" });
            }
        }
    },

    stop: requestId => {
        if (!activeGeneration || (requestId && activeGeneration.requestId !== requestId)) return;
        abortGeneration(activeGeneration);
        activeGeneration = null;
        set({ status: "ready" });
    },
}));
