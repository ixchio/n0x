"use client";

import React from "react";
import { Search, Globe, BookOpen, Brain, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchProviderStatus } from "@/lib/retrieval/useDeepSearch";

interface AgentThinkingProps {
    phase: "idle" | "planning" | "searching" | "reading" | "analyzing" | "complete" | "error";
    query: string;
    results: any[];
    readingUrl: string;
    streamingText: string;
    isActive: boolean;
    providerStatus?: SearchProviderStatus[];
}

const phases = [
    { key: "planning", icon: Brain, label: "planning" },
    { key: "searching", icon: Search, label: "searching" },
    { key: "reading", icon: BookOpen, label: "reading" },
    { key: "analyzing", icon: Globe, label: "analyzing" },
];

export function AgentThinking({ phase, results, readingUrl, isActive, providerStatus = [] }: AgentThinkingProps) {
    if (!isActive && phase === "idle") return null;

    const currentPhaseIndex = phases.findIndex(p => p.key === phase);

    return (
        <div
            role="status"
            aria-live="polite"
            aria-label="Deep search progress"
            className="space-y-3 rounded border border-crt-border bg-crt-surface p-4 animate-fade-in"
        >
            {/* Header */}
            <div className="flex items-center gap-2 text-xs font-mono">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-cyan" aria-hidden="true" />
                <span className="text-neon-cyan">deep search</span>
                <span className="text-zinc-400">· {phase === "idle" ? "preparing" : phase}</span>
            </div>

            {/* Phase indicators */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                {phases.map((p, i) => {
                    const isActive = i <= currentPhaseIndex;
                    const isCurrent = p.key === phase;
                    return (
                        <div
                            key={p.key}
                            className={cn(
                                "flex items-center gap-1 transition-colors",
                                isCurrent ? "text-phosphor" : isActive ? "text-emerald-300" : "text-zinc-400"
                            )}
                        >
                            {isCurrent && phase !== "complete" ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : isActive ? (
                                <CheckCircle className="w-3 h-3" />
                            ) : (
                                <p.icon className="w-3 h-3" />
                            )}
                            {p.label}
                        </div>
                    );
                })}
            </div>

            {/* Results */}
            {results.length > 0 && (
                <div className="space-y-1">
                    {results.slice(0, 4).map((r, i) => (
                        <div key={i} className="truncate text-xs font-mono text-zinc-300">
                            <span className="text-phosphor-dim">[{i + 1}]</span> {r.title || r.url}
                        </div>
                    ))}
                </div>
            )}

            {providerStatus.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-crt-border pt-2">
                    {providerStatus.map(provider => (
                        <span
                            key={provider.name}
                            title={provider.detail}
                            className={cn(
                                "rounded border px-1.5 py-0.5 text-xs font-mono uppercase",
                                provider.status === "ok"
                                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                                    : provider.status === "failed"
                                      ? "border-red-500/20 bg-red-500/10 text-red-300"
                                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                            )}
                        >
                            {provider.name}: {provider.status}
                        </span>
                    ))}
                </div>
            )}

            {/* Reading indicator */}
            {readingUrl && isActive && (
                <div className="flex items-center gap-2 text-xs font-mono text-neon-cyan">
                    <BookOpen className="w-3 h-3 animate-pulse" />
                    reading:{" "}
                    {(() => {
                        try {
                            return new URL(readingUrl).hostname;
                        } catch {
                            return readingUrl;
                        }
                    })()}
                </div>
            )}

            {/* Complete */}
            {phase === "complete" && (
                <div className="flex items-center gap-2 text-xs font-mono text-phosphor">
                    <CheckCircle className="w-3 h-3" />
                    search complete
                </div>
            )}
        </div>
    );
}
