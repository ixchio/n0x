"use client";

import React, { useState, useEffect } from "react";
import { Monitor, Sparkles, Cloud, Server, Zap, Brain, FileText, ImageIcon, Code, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ONBOARDING_KEY = "n0x_onboarded";

interface OnboardingProps {
    onComplete: () => void;
    chromeAIAvailable?: boolean;
}

const STEPS = [
    {
        title: "Welcome to n0x",
        subtitle: "The full AI stack in one browser tab",
        features: [
            { icon: Monitor, label: "100% in-browser", desc: "Everything runs on your GPU. Zero servers." },
            { icon: Brain, label: "LLM + Agent", desc: "Chat, reason, and use tools autonomously." },
            { icon: FileText, label: "RAG pipeline", desc: "Upload docs, get answers with citations." },
            { icon: ImageIcon, label: "Image gen", desc: "Create images from text descriptions." },
            { icon: Code, label: "Code sandbox", desc: "Run Python & JavaScript live in-browser." },
        ],
    },
];

export function Onboarding({ onComplete, chromeAIAvailable }: OnboardingProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            if (!localStorage.getItem(ONBOARDING_KEY)) setVisible(true);
        } catch { /* SSR or storage unavailable */ }
    }, []);

    const dismiss = () => {
        try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
        setVisible(false);
        onComplete();
    };

    if (!visible) return null;

    const step = STEPS[0];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-lg mx-4 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
                {/* Close */}
                <button onClick={dismiss} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-zinc-800">
                    <X className="w-4 h-4" />
                </button>

                {/* Header */}
                <div className="px-8 pt-8 pb-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                            <Zap className="w-6 h-6 text-black" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{step.title}</h2>
                            <p className="text-sm text-zinc-400">{step.subtitle}</p>
                        </div>
                    </div>
                </div>

                {/* Features */}
                <div className="px-8 pb-4 space-y-2">
                    {step.features.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                            <f.icon className="w-4 h-4 text-zinc-400 shrink-0" />
                            <div>
                                <span className="text-sm font-medium text-white">{f.label}</span>
                                <span className="text-xs text-zinc-500 ml-2">{f.desc}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Provider hint */}
                <div className="px-8 pb-4">
                    <div className="text-[11px] text-zinc-500 bg-zinc-900/30 rounded-lg px-4 py-3 border border-zinc-800/40">
                        {chromeAIAvailable ? (
                            <span>✨ <strong className="text-purple-400">Chrome AI detected</strong> — you can start chatting instantly with Gemini Nano, no download needed. Or load a WebGPU model for more power.</span>
                        ) : (
                            <span>A small model (~360MB) will download on first use. After that, everything works offline — no cloud required.</span>
                        )}
                    </div>
                </div>

                {/* CTA */}
                <div className="px-8 pb-8">
                    <button
                        onClick={dismiss}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-colors"
                    >
                        Get Started <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
