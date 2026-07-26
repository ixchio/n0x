// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SpeechResult {
    0: { transcript: string };
    isFinal: boolean;
}

class FakeSpeechRecognition {
    static instance: FakeSpeechRecognition | null = null;

    continuous = false;
    interimResults = false;
    lang = "";
    onstart: (() => void) | null = null;
    onresult: ((event: { results: SpeechResult[]; resultIndex: number }) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;

    constructor() {
        FakeSpeechRecognition.instance = this;
    }

    start() {
        this.onstart?.();
    }

    stop() {
        this.onend?.();
    }

    emit(results: SpeechResult[], resultIndex = 0) {
        this.onresult?.({ results, resultIndex });
    }
}

function result(transcript: string, isFinal: boolean): SpeechResult {
    return { 0: { transcript }, isFinal };
}

describe("speech recognition capability and transcript", () => {
    beforeEach(() => {
        vi.resetModules();
        FakeSpeechRecognition.instance = null;
        delete (window as any).SpeechRecognition;
        delete (window as any).webkitSpeechRecognition;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("detects capability explicitly before the first microphone click", async () => {
        (window as any).SpeechRecognition = FakeSpeechRecognition;
        const { useSTT } = await import("@/lib/media/useSTT");

        expect(useSTT.getState().isSupported).toBe(false);
        expect(useSTT.getState().init()).toBe(true);
        expect(useSTT.getState().isSupported).toBe(true);

        useSTT.getState().start();
        expect(FakeSpeechRecognition.instance).not.toBeNull();
        expect(useSTT.getState().isListening).toBe(true);
    });

    it("keeps finalized speech cumulative while replacing interim text", async () => {
        (window as any).webkitSpeechRecognition = FakeSpeechRecognition;
        const { useSTT } = await import("@/lib/media/useSTT");
        useSTT.getState().init();
        useSTT.getState().start();

        FakeSpeechRecognition.instance?.emit([result("hello", true)]);
        expect(useSTT.getState().transcript).toBe("hello");

        FakeSpeechRecognition.instance?.emit([result("hello", true), result("wor", false)], 1);
        expect(useSTT.getState().transcript).toBe("hello");
        expect(useSTT.getState().interimTranscript).toBe("wor");

        FakeSpeechRecognition.instance?.emit([result("hello", true), result("world", true)], 1);
        expect(useSTT.getState().transcript).toBe("hello world");
        expect(useSTT.getState().interimTranscript).toBe("");
    });
});
