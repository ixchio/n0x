"use client";

import React, { useState } from "react";
import { Search, Globe, BookOpen, Brain, CheckCircle, Loader2, ExternalLink, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentThinkingProps {
    phase: "idle" | "planning" | "searching" | "reading" | "analyzing" | "complete" | "error";
    query: string;
    results: any[];
    readingUrl: string;
    streamingText: string;
    isActive: boolean;
}

function getFavicon(url: string): string {
    try {
        const hostname = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    } catch {
        return "";
    }
}

function getHostname(url: string): string {
    try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

const PHASE_CONFIG = [
    { key: "planning", icon: Brain, label: "Understanding query", color: "text-violet-400" },
    { key: "searching", icon: Search, label: "Searching the web", color: "text-blue-400" },
    { key: "reading", icon: BookOpen, label: "Reading sources", color: "text-amber-400" },
    { key: "analyzing", icon: Sparkles, label: "Analyzing", color: "text-emerald-400" },
];

export function AgentThinking({ phase, query, results, readingUrl, streamingText, isActive }: AgentThinkingProps) {
    const [sourcesExpanded, setSourcesExpanded] = useState(false);

    if (!isActive && phase === "idle") return null;

    const currentPhaseIndex = PHASE_CONFIG.findIndex(p => p.key === phase);
    const visibleResults = sourcesExpanded ? results : results.slice(0, 3);

    return (
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800/60 overflow-hidden animate-fade-in backdrop-blur-sm">
            {/* Search Header */}
            <div className="px-4 pt-4 pb-3">
                <div className="flex items-center gap-2.5">
                    <div className="relative">
                        <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-500",
                            phase === "complete"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-blue-500/15 text-blue-400"
                        )}>
                            {phase === "complete" ? (
                                <CheckCircle className="w-4 h-4" />
                            ) : (
                                <Search className="w-4 h-4" />
                            )}
                        </div>
                        {phase !== "complete" && phase !== "idle" && (
                            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-200 truncate">
                            {query || "Searching..."}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                            {phase === "complete"
                                ? `Found ${results.length} sources`
                                : PHASE_CONFIG[currentPhaseIndex]?.label || "Processing..."}
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Steps — compact pill bar */}
            {phase !== "complete" && (
                <div className="px-4 pb-3">
                    <div className="flex items-center gap-1">
                        {PHASE_CONFIG.map((p, i) => {
                            const isDone = i < currentPhaseIndex;
                            const isCurrent = p.key === phase;
                            return (
                                <div key={p.key} className="flex items-center gap-1 flex-1">
                                    <div className={cn(
                                        "h-1 rounded-full flex-1 transition-all duration-700",
                                        isDone ? "bg-emerald-500/60" :
                                        isCurrent ? "bg-blue-500/80 animate-pulse" :
                                        "bg-zinc-800"
                                    )} />
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                        {PHASE_CONFIG.map((p, i) => {
                            const isDone = i < currentPhaseIndex;
                            const isCurrent = p.key === phase;
                            return (
                                <span key={p.key} className={cn(
                                    "text-[10px] transition-colors",
                                    isCurrent ? p.color + " font-medium" : isDone ? "text-zinc-500" : "text-zinc-700"
                                )}>
                                    {isCurrent && <Loader2 className="w-2.5 h-2.5 animate-spin inline mr-0.5 -mt-px" />}
                                    {isDone && <CheckCircle className="w-2.5 h-2.5 inline mr-0.5 -mt-px text-emerald-500/60" />}
                                    {p.label}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Reading indicator — shows which URL is being read */}
            {readingUrl && phase === "reading" && (
                <div className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                    <BookOpen className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                    <span className="text-[11px] text-amber-300/80 truncate">
                        Reading {getHostname(readingUrl)}
                    </span>
                </div>
            )}

            {/* Sources — Perplexity-style card grid */}
            {results.length > 0 && (
                <div className="px-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                            Sources
                        </span>
                        {results.length > 3 && (
                            <button
                                onClick={() => setSourcesExpanded(!sourcesExpanded)}
                                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                {sourcesExpanded ? "Show less" : `+${results.length - 3} more`}
                                {sourcesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {visibleResults.map((r: any, i: number) => (
                            <a
                                key={i}
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex flex-col gap-1.5 p-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700/30 hover:border-zinc-600/50 hover:bg-zinc-800/80 transition-all cursor-pointer min-w-0"
                            >
                                <div className="flex items-center gap-1.5 min-w-0">
                                    {r.url && (
                                        <img
                                            src={getFavicon(r.url)}
                                            alt=""
                                            className="w-3.5 h-3.5 rounded-sm shrink-0"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                    )}
                                    <span className="text-[10px] text-zinc-500 truncate">
                                        {r.url ? getHostname(r.url) : "source"}
                                    </span>
                                </div>
                                <span className="text-[11px] text-zinc-300 line-clamp-2 leading-tight">
                                    {r.title || r.snippet?.slice(0, 60) || "Untitled"}
                                </span>
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Search complete badge */}
            {phase === "complete" && (
                <div className="px-4 pb-3">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-[11px] text-emerald-300/80">
                            Search complete · {results.length} sources analyzed
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
