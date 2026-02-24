"use client";

// Keyboard Sound Design — Web Audio API oscillator clicks
// Subtle mechanical key clicks during AI token generation
// Zero external audio files

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch {
            return null;
        }
    }
    return audioCtx;
}

const STORAGE_KEY = "n0x_keysound";

export function getKeySoundEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export function setKeySoundEnabled(on: boolean): void {
    try {
        localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch { }
}

// Play a single mechanical key click
// Randomized pitch for organic feel
let lastTick = 0;

export function tick(): void {
    const ctx = getCtx();
    if (!ctx || !getKeySoundEnabled()) return;

    // Throttle: minimum 40ms between clicks
    const now = performance.now();
    if (now - lastTick < 40) return;
    lastTick = now;

    try {
        // Short oscillator burst (~12ms) — sounds like a key click
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // Random pitch between 300-800Hz for variety
        osc.frequency.value = 300 + Math.random() * 500;
        osc.type = "square";

        // Very quiet — subtle background texture
        const volume = 0.02 + Math.random() * 0.015;
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        // Fast decay envelope
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.012);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.015);

        // Prevent GC leak: disconnect nodes after playback
        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    } catch {
        // Audio context issues — silently ignore
    }
}
