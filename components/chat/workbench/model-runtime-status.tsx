"use client";

import React from "react";
import { AlertTriangle, Cloud, Zap } from "lucide-react";

import { WEBLLM_MODELS } from "@/lib/providers/useWebLLM";
import type { AIProvider } from "@/components/chat/workbench/workbench-panels";

interface WebLlmRuntime {
    error: string | null;
    status: string;
    isSupported: boolean;
    loadProgress: number;
    loadingModel: string | null;
    loadedModel: string | null;
    loadModel: (modelId: string, force?: boolean) => Promise<void>;
}

interface ModelRuntimeStatusProps {
    provider: AIProvider;
    webllm: WebLlmRuntime;
    messageCount: number;
    defaultModel: string;
    onModelChange: (modelId: string) => Promise<void>;
    onUseCloud: () => void;
}

export function ModelRuntimeStatus({
    provider,
    webllm,
    messageCount,
    defaultModel,
    onModelChange,
    onUseCloud,
}: ModelRuntimeStatusProps) {
    if (provider !== "browser") return null;

    if (webllm.error && webllm.status === "error") {
        return (
            <div className="mx-auto mb-6 mt-8 max-w-lg sm:mt-12">
                <div
                    role="alert"
                    aria-live="assertive"
                    className="space-y-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center sm:p-5"
                >
                    <AlertTriangle className="mx-auto h-7 w-7 text-red-400" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-red-400">Model load failed</h3>
                    <p className="mx-auto max-w-sm text-xs leading-relaxed text-red-300">{webllm.error}</p>
                    <div className="flex flex-col gap-2 pt-2">
                        <button
                            onClick={() => void onModelChange("SmolLM2-360M-Instruct-q4f16_1-MLC")}
                            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-xs text-zinc-200 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            <Zap className="h-3.5 w-3.5 text-neon-amber" /> Try SmolLM2 360M (tiny, works everywhere)
                        </button>
                        <button
                            onClick={onUseCloud}
                            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/15 px-4 py-2.5 text-xs font-bold text-blue-300 transition-colors hover:bg-blue-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            <Cloud className="h-3.5 w-3.5" /> Use Cloud API for this session
                        </button>
                        {webllm.error.includes("Hardware Restricted") && (
                            <button
                                onClick={() => {
                                    const modelToForce = webllm.loadingModel || webllm.loadedModel || defaultModel;
                                    void webllm.loadModel(modelToForce, true);
                                }}
                                className="min-h-11 rounded-md px-4 py-2 text-xs text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                Force load anyway (may crash)
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (!webllm.isSupported || webllm.status !== "loading" || messageCount > 0) return null;

    const loadingLabel =
        WEBLLM_MODELS.find(model => model.id === (webllm.loadingModel || webllm.loadedModel || defaultModel))?.label ||
        "model";

    return (
        <div role="status" aria-live="polite" className="flex h-full flex-col items-center justify-center">
            <div className="w-full max-w-sm space-y-6 px-4 text-center">
                <h2 className="text-xl font-bold tracking-tight text-white">N0X Engine</h2>
                <div className="mx-auto w-[min(16rem,calc(100vw-2rem))]">
                    <div className="h-1.5 overflow-hidden rounded-full border border-crt-border bg-crt-surface">
                        <div
                            role="progressbar"
                            aria-label={`Downloading ${loadingLabel}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(webllm.loadProgress * 100)}
                            className="h-full rounded-full bg-phosphor shadow-glow-sm transition-all duration-300"
                            style={{ width: `${Math.round(webllm.loadProgress * 100)}%` }}
                        />
                    </div>
                    <div className="mt-2 flex justify-between text-xs">
                        <span className="text-zinc-400">Downloading {loadingLabel}</span>
                        <span className="text-phosphor-dim">{Math.round(webllm.loadProgress * 100)}%</span>
                    </div>
                </div>
                <div className="space-y-2 pt-2">
                    {webllm.error ? (
                        <>
                            <p className="text-xs text-amber-300">⚠ {webllm.error}</p>
                            <div className="flex justify-center pt-1">
                                <button
                                    onClick={onUseCloud}
                                    className="min-h-11 rounded border border-blue-500/25 bg-blue-500/15 px-3 py-2 text-xs font-bold text-blue-300 transition-colors hover:bg-blue-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    Use Cloud API
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-xs text-zinc-300">
                                First time? This downloads once, then it is instant on later visits.
                            </p>
                            <p className="text-xs text-zinc-400">
                                Model weights are cached in your browser. No server or account is required.
                            </p>
                            <p className="text-xs text-zinc-400">Do not refresh; the download will restart.</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
