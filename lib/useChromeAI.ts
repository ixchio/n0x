"use client";

import { create } from "zustand";
import { addTokens } from "@/lib/useWebLLM";

// Chrome Built-in AI (Gemini Nano) — zero download, instant inference
// Uses the Prompt API: https://developer.chrome.com/docs/ai/prompt-api
// Available in Chrome 138+ with Gemini Nano downloaded on-device.

export type ChromeAIStatus = "unavailable" | "checking" | "downloading" | "ready" | "generating";

interface ChromeAIState {
    status: ChromeAIStatus;
    isSupported: boolean;
    error: string | null;

    init: () => Promise<void>;
    generate: (
        messages: { role: string; content: string }[],
        onToken?: (token: string) => void,
    ) => Promise<string>;
    stop: () => void;
}

let session: any = null;
let abortCtrl: AbortController | null = null;

export const useChromeAI = create<ChromeAIState>((set, get) => ({
    status: "unavailable",
    isSupported: false,
    error: null,

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
                set({ isSupported: true, status: "ready", error: null });
            } else if (availability === "downloadable" || availability === "downloading") {
                set({ isSupported: true, status: "downloading", error: null });
                // Create session to trigger download
                session = await lm.create();
                set({ status: "ready" });
            } else {
                set({ isSupported: false, status: "unavailable", error: "Chrome AI model not available on this device." });
            }
        } catch (e: any) {
            set({ isSupported: false, status: "unavailable", error: e.message || "Chrome AI check failed" });
        }
    },

    generate: async (messages, onToken) => {
        const lm = (globalThis as any).LanguageModel ?? (globalThis as any).ai?.languageModel;
        if (!lm) throw new Error("Chrome AI not available");

        set({ status: "generating" });
        abortCtrl = new AbortController();

        try {
            // Create a fresh session if needed
            if (!session) {
                session = await lm.create();
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
            const stream = await session.promptStreaming(prompt, {
                signal: abortCtrl.signal,
            });

            let fullResponse = "";
            // The Prompt API returns cumulative text, not deltas
            for await (const chunk of stream) {
                if (abortCtrl?.signal.aborted) break;
                const newContent = typeof chunk === "string" ? chunk : chunk.toString();
                // Prompt API returns full text so far — compute delta
                const delta = newContent.slice(fullResponse.length);
                fullResponse = newContent;
                if (delta) onToken?.(delta);
            }

            set({ status: "ready" });
            // Estimate tokens from response length (~4 chars per token)
            addTokens(Math.ceil(fullResponse.length / 4));
            return fullResponse;
        } catch (e: any) {
            if (e.name !== "AbortError") {
                console.error("Chrome AI error:", e);
                set({ error: e.message });
            }
            set({ status: "ready" });
            throw e;
        }
    },

    stop: () => {
        if (abortCtrl) {
            abortCtrl.abort();
            abortCtrl = null;
        }
        set({ status: "ready" });
    },
}));
