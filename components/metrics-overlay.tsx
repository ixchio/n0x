"use client";

import React from "react";
import { Cpu, Zap, Database, Activity, Server, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface MetricsOverlayProps {
    tps: number;
    modelName: string;
    isLoaded: boolean;
    isLoading: boolean;
    progress: number;
    isOpen: boolean;
    onToggle: () => void;
    estimatedTimeRemaining?: number | null;
}

export function MetricsOverlay({
    tps,
    modelName,
    isLoaded,
    isLoading,
    progress,
    isOpen,
    onToggle,
    estimatedTimeRemaining,
}: MetricsOverlayProps) {
    const formatTimeRemaining = (seconds: number | null | undefined): string => {
        if (!seconds || seconds <= 0) return "Calculating...";
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };
    return (
        <div className="absolute top-4 right-4 z-50">
            <AnimatePresence>
                {!isOpen ? (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        onClick={onToggle}
                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-full text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-glass"
                    >
                        <Activity className="w-3.5 h-3.5" />
                        <span>Metrics</span>
                        {tps > 0 && <span className="text-green-400 ml-1">{tps} t/s</span>}
                    </motion.button>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className="w-72 bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/80 rounded-xl shadow-2xl overflow-hidden font-mono text-[11px]"
                    >
                        <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50">
                            <div className="flex items-center gap-2 text-zinc-300 font-semibold">
                                <Activity className="w-4 h-4" />
                                <span>Engine Telemetry</span>
                            </div>
                            <button onClick={onToggle} className="text-zinc-500 hover:text-white transition-colors">
                                close
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Status Row */}
                            <div className="flex items-center justify-between">
                                <span className="text-zinc-500">Engine Status</span>
                                <span
                                    className={cn(
                                        "px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1.5",
                                        isLoaded
                                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                            : isLoading
                                              ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                              : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "w-1.5 h-1.5 rounded-full",
                                            isLoaded
                                                ? "bg-green-400"
                                                : isLoading
                                                  ? "bg-yellow-400 animate-pulse"
                                                  : "bg-zinc-500"
                                        )}
                                    />
                                    {isLoaded ? "ONLINE (WebGPU)" : isLoading ? "LOADING WEIGHTS" : "IDLE"}
                                </span>
                            </div>

                            {/* Model Info */}
                            <div className="flex items-center justify-between">
                                <span className="text-zinc-500">Active Model</span>
                                <span className="text-zinc-300 max-w-[140px] truncate" title={modelName || "None"}>
                                    {modelName || "None"}
                                </span>
                            </div>

                            {/* Progress Bar (if loading) */}
                            {isLoading && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-zinc-500">
                                            {progress === 0 ? "Initializing..." : "Downloading to browser cache"}
                                        </span>
                                        <span className="text-yellow-400">{Math.round(progress * 100)}%</span>
                                    </div>
                                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                                        <div
                                            className="h-full bg-gradient-to-r from-yellow-400 to-amber-400 rounded-full transition-all duration-300"
                                            style={{ width: `${Math.round(progress * 100)}%` }}
                                        />
                                    </div>
                                    {estimatedTimeRemaining !== null && estimatedTimeRemaining !== undefined && progress > 0 && progress < 1 && (
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="text-zinc-600">Time remaining</span>
                                            <span className="text-amber-400 font-semibold">
                                                ~{formatTimeRemaining(estimatedTimeRemaining)}
                                            </span>
                                        </div>
                                    )}
                                    <div className="text-[10px] text-zinc-600 mt-1">
                                        💡 Model downloads once, then loads instantly from cache
                                    </div>
                                </div>
                            )}

                            {/* Divider */}
                            <div className="h-px w-full bg-zinc-800/50" />

                            {/* Grid Stats */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <span className="text-zinc-500 flex items-center gap-1">
                                        <Zap className="w-3 h-3" /> Throughput
                                    </span>
                                    <div className="text-zinc-200 text-sm font-semibold">
                                        {tps > 0 ? `${tps} tok/s` : "0 tok/s"}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-zinc-500 flex items-center gap-1">
                                        <Server className="w-3 h-3" /> Runtime
                                    </span>
                                    <div className="text-zinc-200 text-sm font-semibold">Local WASM</div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-zinc-500 flex items-center gap-1">
                                        <Database className="w-3 h-3" /> VRAM Est.
                                    </span>
                                    <div className="text-zinc-200 text-sm font-semibold">
                                        ~ {isLoaded ? "1-3 GB" : "0 GB"}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-zinc-500 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> Latency
                                    </span>
                                    <div className="text-zinc-200 text-sm font-semibold">
                                        {tps > 0 ? "~ 15ms" : "N/A"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
