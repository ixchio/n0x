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

export function AgentThinking({
    phase,
    query,
    results,
    readingUrl,
    streamingText,
    isActive,
    providerStatus = [],
}: AgentThinkingProps) {
    if (!isActive && phase === "idle") return null;

    const currentPhaseIndex = phases.findIndex(p => p.key === phase);

    return (
        <div className="border border-crt-border rounded bg-crt-surface p-4 space-y-3 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-2 text-xs font-mono">
                <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
                <span className="text-neon-cyan">deep search</span>
                {query && <span className="text-txt-tertiary">· {query}</span>}
            </div>

            {/* Phase indicators */}
            <div className="flex items-center gap-3 text-[10px] font-mono">
                {phases.map((p, i) => {
                    const isActive = i <= currentPhaseIndex;
                    const isCurrent = p.key === phase;
                    return (
                        <div
                            key={p.key}
                            className={cn(
                                "flex items-center gap-1 transition-colors",
                                isCurrent ? "text-phosphor" : isActive ? "text-phosphor-dim" : "text-txt-tertiary"
                            )}
                        >
                            {isCurrent && phase !== "complete" ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
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
                        <div key={i} className="text-[11px] text-txt-secondary font-mono truncate">
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
                                "rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase",
                                provider.status === "ok"
                                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                                    : provider.status === "failed"
                                      ? "border-red-500/20 bg-red-500/10 text-red-300"
                                      : "border-zinc-800 bg-zinc-900/60 text-zinc-500"
                            )}
                        >
                            {provider.name}: {provider.status}
                        </span>
                    ))}
                </div>
            )}

            {/* Reading indicator */}
            {readingUrl && isActive && (
                <div className="flex items-center gap-2 text-[11px] font-mono text-neon-cyan">
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

            {/* Streaming text */}
            {streamingText && (
                <div className="text-xs text-txt-secondary font-mono border-t border-crt-border pt-2 mt-2">
                    {streamingText}
                </div>
            )}

            {/* Complete */}
            {phase === "complete" && (
                <div className="flex items-center gap-2 text-[11px] text-phosphor font-mono">
                    <CheckCircle className="w-3 h-3" />
                    search complete
                </div>
            )}
        </div>
    );
}
