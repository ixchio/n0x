"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Monitor, Zap, Brain, FileText, ImageIcon, Code, ArrowRight, X } from "lucide-react";
import { setAnalyticsEnabled, trackFunnelEvent } from "@/lib/core/analytics";

const ONBOARDING_KEY = "n0x_onboarded";

interface OnboardingProps {
    onComplete: () => void;
    chromeAIAvailable?: boolean;
}

const STEPS = [
    {
        title: "Welcome to n0x",
        subtitle: "Local by default. Search, image and cloud paths are explicit.",
        features: [
            { icon: Monitor, label: "Browser-first", desc: "Run supported models locally with WebGPU." },
            { icon: Brain, label: "LLM + Agent", desc: "Chat, reason, and use tools autonomously." },
            {
                icon: FileText,
                label: "Local document search",
                desc: "Index files in this browser for grounded answers.",
            },
            { icon: ImageIcon, label: "Explicit image path", desc: "Image prompts use the configured network route." },
            { icon: Code, label: "Code sandbox", desc: "Run Python & JavaScript live in-browser." },
        ],
    },
];

export function Onboarding({ onComplete, chromeAIAvailable }: OnboardingProps) {
    const [visible, setVisible] = useState(false);
    const [shareTelemetry, setShareTelemetry] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    const onCompleteRef = useRef(onComplete);
    const shareTelemetryRef = useRef(shareTelemetry);
    const titleId = useId();
    const descriptionId = useId();
    onCompleteRef.current = onComplete;
    shareTelemetryRef.current = shareTelemetry;

    useEffect(() => {
        try {
            if (!localStorage.getItem(ONBOARDING_KEY)) setVisible(true);
        } catch {
            /* SSR or storage unavailable */
        }
    }, []);

    const dismiss = useCallback(() => {
        try {
            localStorage.setItem(ONBOARDING_KEY, "1");
        } catch {}
        const telemetryEnabled = shareTelemetryRef.current;
        setAnalyticsEnabled(telemetryEnabled);
        setVisible(false);
        onCompleteRef.current();
        if (telemetryEnabled) trackFunnelEvent("visit", { source: "onboarding" });
    }, []);

    useEffect(() => {
        if (!visible) return;

        restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                dismiss();
                return;
            }

            if (event.key !== "Tab") return;
            const dialog = dialogRef.current;
            if (!dialog) return;
            const focusable = Array.from(
                dialog.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
                )
            );

            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = previousOverflow;
            restoreFocusRef.current?.focus();
        };
    }, [dismiss, visible]);

    if (!visible) return null;

    const step = STEPS[0];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md animate-in fade-in duration-300 sm:p-4">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
            >
                {/* Close */}
                <button
                    ref={closeButtonRef}
                    onClick={dismiss}
                    aria-label="Close welcome dialog"
                    className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-3 sm:top-3"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Header */}
                <div className="px-5 pb-4 pt-6 pr-14 sm:px-8 sm:pt-8 sm:pr-16">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                            <Zap className="w-6 h-6 text-black" />
                        </div>
                        <div>
                            <h2 id={titleId} className="text-xl font-bold text-white">
                                {step.title}
                            </h2>
                            <p id={descriptionId} className="text-sm leading-6 text-zinc-300">
                                {step.subtitle}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Features */}
                <div className="space-y-2 px-5 pb-4 sm:px-8">
                    {step.features.map((f, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/50"
                        >
                            <f.icon className="w-4 h-4 text-zinc-400 shrink-0" />
                            <div>
                                <span className="text-sm font-medium text-white">{f.label}</span>
                                <span className="ml-2 text-xs text-zinc-400">{f.desc}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Provider hint */}
                <div className="px-5 pb-4 sm:px-8">
                    <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-3 text-[11px] leading-5 text-zinc-300">
                        {chromeAIAvailable ? (
                            <span>
                                <strong className="text-purple-400">Chrome AI detected</strong> — you can start chatting
                                instantly with Gemini Nano, no download needed. Or load a WebGPU model for more power.
                            </span>
                        ) : (
                            <span>
                                A small model (~360MB) downloads on first use. Local chat can then reuse the cached
                                model; search, image generation, and cloud providers remain explicit network paths.
                            </span>
                        )}
                    </div>
                </div>

                <div className="px-5 pb-4 sm:px-8">
                    <label className="flex items-start gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 px-4 py-3 text-left">
                        <input
                            type="checkbox"
                            checked={shareTelemetry}
                            onChange={e => setShareTelemetry(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900"
                        />
                        <span className="text-[11px] leading-relaxed text-zinc-400">
                            Share anonymous page views and product telemetry. No prompts, responses, file names,
                            document text, or API keys are collected.
                        </span>
                    </label>
                </div>

                {/* CTA */}
                <div className="px-5 pb-6 sm:px-8 sm:pb-8">
                    <button
                        onClick={dismiss}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                    >
                        Get Started <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
