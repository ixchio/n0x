"use client";

import { create } from "zustand";

// Browser-native speech-to-text using the Web Speech API.
// Recognition may use an online service depending on the browser and OS.

interface STTState {
    isListening: boolean;
    isSupported: boolean;
    transcript: string;
    interimTranscript: string;
    error: string | null;
    init: () => boolean;
    start: () => void;
    stop: () => void;
    clear: () => void;
}

let recognition: any = null;
let finalSegments = new Map<number, string>();

function getSpeechRecognition() {
    if (typeof window === "undefined") return null;
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export const useSTT = create<STTState>((set, get) => ({
    isListening: false,
    isSupported: false, // set lazily to avoid SSR hydration mismatch
    transcript: "",
    interimTranscript: "",
    error: null,

    init: () => {
        const isSupported = typeof getSpeechRecognition() === "function";
        set({ isSupported });
        return isSupported;
    },

    start: () => {
        if (get().isListening) return;

        const SpeechRecognition = getSpeechRecognition();

        if (!SpeechRecognition) {
            set({ error: "Speech recognition not supported", isSupported: false });
            return;
        }

        set({ isSupported: true });
        finalSegments = new Map();

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => set({ isListening: true, error: null });

        recognition.onresult = (event: any) => {
            const interim: string[] = [];
            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                const text = String(result[0]?.transcript || "").trim();
                if (result.isFinal) {
                    finalSegments.set(i, text);
                } else {
                    finalSegments.delete(i);
                    if (text) interim.push(text);
                }
            }
            const transcript = [...finalSegments.entries()]
                .sort(([first], [second]) => first - second)
                .map(([, text]) => text)
                .filter(Boolean)
                .join(" ");
            set({ transcript, interimTranscript: interim.join(" ") });
        };

        recognition.onerror = (event: any) => {
            // "no-speech" and "aborted" are non-fatal
            if (event.error === "no-speech" || event.error === "aborted") return;
            set({ error: event.error, isListening: false });
        };

        recognition.onend = () => {
            set({ isListening: false });
        };

        try {
            recognition.start();
        } catch (e: any) {
            set({ error: e.message || "Failed to start", isListening: false });
        }
    },

    stop: () => {
        if (recognition) {
            recognition.stop();
            recognition = null;
        }
        set({ isListening: false, interimTranscript: "" });
    },

    clear: () => {
        finalSegments = new Map();
        set({ transcript: "", interimTranscript: "", error: null });
    },
}));
