"use client";

import { create } from "zustand";

interface TTSState {
    isSpeaking: boolean;
    isSupported: boolean;
    isEnabled: boolean;
    voice: SpeechSynthesisVoice | null;

    // Actions
    init: () => void;
    speak: (text: string) => void;
    cancel: () => void;
    setEnabled: (enabled: boolean) => void;
}

// Module-level synthesizer reference
let synth: SpeechSynthesis | null = null;

export const useTTS = create<TTSState>((set, get) => ({
    isSpeaking: false,
    isSupported: false,
    isEnabled: false,
    voice: null,

    init: () => {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
            synth = window.speechSynthesis;
            set({ isSupported: true });

            const loadVoices = () => {
                if (!synth) return;
                const voices = synth.getVoices();
                const preferredVoice = voices.find(v => v.name.includes("Google US English")) ||
                    voices.find(v => v.name.includes("Natural")) ||
                    voices.find(v => v.lang.startsWith("en-US"));

                set({ voice: preferredVoice || voices[0] || null });
            };

            loadVoices();
            if (synth.onvoiceschanged !== undefined) {
                synth.onvoiceschanged = loadVoices;
            }
        }
    },

    speak: (text: string) => {
        const { isEnabled, voice } = get();
        if (!synth || !voice || !isEnabled) return;

        // Cancel current speech
        synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => set({ isSpeaking: true });
        utterance.onend = () => set({ isSpeaking: false });
        utterance.onerror = () => set({ isSpeaking: false });

        synth.speak(utterance);
    },

    cancel: () => {
        if (synth) {
            synth.cancel();
            set({ isSpeaking: false });
        }
    },

    setEnabled: (enabled: boolean) => {
        set({ isEnabled: enabled });
        if (!enabled && synth) {
            synth.cancel();
            set({ isSpeaking: false });
        }
    }
}));
