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

        // Strip markdown formatting so TTS doesn't speak asterisks, backticks, etc.
        const clean = text
            .replace(/<think>[\s\S]*?<\/think>/g, "")  // remove thinking blocks
            .replace(/```[\s\S]*?```/g, " code block omitted ")  // remove code blocks
            .replace(/`([^`]+)`/g, "$1")  // inline code
            .replace(/\*\*([^*]+)\*\*/g, "$1")  // bold
            .replace(/\*([^*]+)\*/g, "$1")  // italic
            .replace(/__([^_]+)__/g, "$1")  // bold alt
            .replace(/_([^_]+)_/g, "$1")  // italic alt
            .replace(/#+\s/g, "")  // headers
            .replace(/!\[.*?\]\(.*?\)/g, "image")  // images
            .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")  // links
            .replace(/^\s*[-*+]\s/gm, "")  // list bullets
            .replace(/^\s*\d+\.\s/gm, "")  // numbered lists
            .replace(/\n{2,}/g, ". ")  // double newlines to pauses
            .replace(/\n/g, " ")  // single newlines
            .trim();

        if (!clean) return;

        const utterance = new SpeechSynthesisUtterance(clean);
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
