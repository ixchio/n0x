"use client";

import { create } from "zustand";

// Browser-native Speech-to-Text using SpeechRecognition API
// 100% local on Chrome/Edge, no data leaves the browser

interface STTState {
    isListening: boolean;
    isSupported: boolean;
    transcript: string;
    interimTranscript: string;
    error: string | null;
    start: () => void;
    stop: () => void;
    clear: () => void;
}

let recognition: any = null;

export const useSTT = create<STTState>((set, get) => ({
    isListening: false,
    isSupported: false, // set lazily to avoid SSR hydration mismatch
    transcript: "",
    interimTranscript: "",
    error: null,

    start: () => {
        if (get().isListening) return;

        const SpeechRecognition =
            (typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;

        if (!SpeechRecognition) {
            set({ error: "Speech recognition not supported", isSupported: false });
            return;
        }

        set({ isSupported: true });

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => set({ isListening: true, error: null });

        recognition.onresult = (event: any) => {
            let final = "";
            let interim = "";
            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    final += result[0].transcript + " ";
                } else {
                    interim += result[0].transcript;
                }
            }
            set({ transcript: final.trim(), interimTranscript: interim });
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
        set({ transcript: "", interimTranscript: "", error: null });
    },
}));
