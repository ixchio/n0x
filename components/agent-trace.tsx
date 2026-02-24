"use client";

import React, { useRef, useEffect, useState } from "react";
import { AgentStep, AgentStatus } from "@/lib/useAgent";
import { cn } from "@/lib/utils";
import {
    Search, FileText, Code, Brain, Zap, Loader2, CheckCircle,
    AlertCircle, MessageSquare, ChevronDown, ChevronRight, Clock, Square, Bot,
} from "lucide-react";

// ─── Agent Trace UI v2 ──────────────────────────────────────────────
// Hardcore engineering-grade trace visualization
// • Auto-scrolls to latest step
// • Collapsible observation cards (long tool results don't flood the UI)
// • Per-step execution time display
// • Abort button wired to agent.abort()
// • Connection lines between steps for visual flow

const TOOL_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string; bg: string; border: string }> = {
    webSearch: { icon: Search, color: "text-blue-400", label: "WEB SEARCH", bg: "bg-blue-500/8", border: "border-blue-500/20" },
    ragSearch: { icon: FileText, color: "text-amber-400", label: "DOCUMENT SEARCH", bg: "bg-amber-500/8", border: "border-amber-500/20" },
    python: { icon: Code, color: "text-green-400", label: "PYTHON EXEC", bg: "bg-green-500/8", border: "border-green-500/20" },
    memorySave: { icon: Brain, color: "text-purple-400", label: "MEMORY WRITE", bg: "bg-purple-500/8", border: "border-purple-500/20" },
    memoryRecall: { icon: Brain, color: "text-purple-400", label: "MEMORY READ", bg: "bg-purple-500/8", border: "border-purple-500/20" },
};

// ─── Step Card ──────────────────────────────────────────────────────

function StepCard({ step, isLast }: { step: AgentStep; isLast: boolean }) {
    const [collapsed, setCollapsed] = useState(step.type === "observation" && step.content.length > 300);
    const toolCfg = step.tool ? TOOL_CONFIG[step.tool] : null;

    const styles: Record<string, { bg: string; border: string; labelColor: string }> = {
        thought: { bg: "bg-zinc-900/30", border: "border-zinc-800/60", labelColor: "text-zinc-500" },
        action: { bg: toolCfg?.bg || "bg-zinc-900/40", border: toolCfg?.border || "border-zinc-700/50", labelColor: toolCfg?.color || "text-zinc-400" },
        observation: { bg: "bg-zinc-950/60", border: "border-zinc-800/40", labelColor: "text-zinc-600" },
        final: { bg: "bg-emerald-500/5", border: "border-emerald-500/25", labelColor: "text-emerald-400" },
        error: { bg: "bg-red-500/5", border: "border-red-500/25", labelColor: "text-red-400" },
    };

    const s = styles[step.type] || styles.thought;

    const StepIcon = () => {
        if (step.type === "action" && toolCfg) {
            const Icon = toolCfg.icon;
            return <Icon className={cn("w-3.5 h-3.5", toolCfg.color)} />;
        }
        switch (step.type) {
            case "thought": return <Brain className="w-3.5 h-3.5 text-zinc-500" />;
            case "observation": return <MessageSquare className="w-3.5 h-3.5 text-zinc-600" />;
            case "final": return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
            case "error": return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
            default: return <Zap className="w-3.5 h-3.5 text-zinc-600" />;
        }
    };

    const label = step.type === "action" && toolCfg
        ? toolCfg.label
        : step.type === "thought" ? "REASONING"
            : step.type === "observation" ? "RESULT"
                : step.type === "final" ? "FINAL ANSWER"
                    : step.type === "error" ? "ERROR"
                        : "STEP";

    const isCollapsible = step.type === "observation" && step.content.length > 300;
    const displayContent = collapsed
        ? step.content.slice(0, 200) + "…"
        : step.content;

    return (
        <div className="relative">
            {/* Connection line to next step */}
            {!isLast && (
                <div className="absolute left-[9px] top-[28px] w-px h-[calc(100%+4px)] bg-gradient-to-b from-zinc-800/80 to-zinc-800/20" />
            )}

            <div className={cn(
                "relative border rounded-lg transition-all duration-200",
                "ml-5 pl-3 pr-3 py-2.5",
                s.bg, s.border,
                isLast && (step.type === "thought" || step.type === "action") && "animate-in fade-in slide-in-from-left-2 duration-300",
            )}>
                {/* Timeline dot */}
                <div className={cn(
                    "absolute -left-5 top-3 w-2.5 h-2.5 rounded-full border-2 z-10",
                    step.type === "final" ? "bg-emerald-400 border-emerald-400/50" :
                        step.type === "error" ? "bg-red-400 border-red-400/50" :
                            step.type === "action" ? `bg-zinc-700 ${toolCfg?.border || "border-zinc-600"}` :
                                "bg-zinc-800 border-zinc-700",
                )} />

                {/* Header */}
                <div className="flex items-center gap-2 mb-1">
                    <StepIcon />
                    <span className={cn("text-[10px] font-mono font-bold tracking-widest", s.labelColor)}>
                        {label}
                    </span>

                    {/* Duration badge for tool executions */}
                    {step.durationMs != null && (
                        <span className="text-[9px] font-mono text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded">
                            {step.durationMs > 1000
                                ? `${(step.durationMs / 1000).toFixed(1)}s`
                                : `${step.durationMs}ms`}
                        </span>
                    )}

                    <span className="text-[9px] text-zinc-700 font-mono ml-auto tabular-nums">
                        {new Date(step.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                </div>

                {/* Content */}
                <div className={cn(
                    "text-xs leading-relaxed whitespace-pre-wrap break-words",
                    step.type === "thought" ? "text-zinc-400 italic font-sans" :
                        step.type === "observation" ? "text-zinc-500 font-mono text-[11px]" :
                            step.type === "action" ? "text-zinc-300 font-mono text-[11px]" :
                                step.type === "final" ? "text-zinc-200 font-sans" :
                                    step.type === "error" ? "text-red-300 font-mono text-[11px]" :
                                        "text-zinc-400",
                    isCollapsible && !collapsed && "max-h-48 overflow-y-auto no-scrollbar",
                )}>
                    {displayContent}
                </div>

                {/* Collapse toggle */}
                {isCollapsible && (
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="flex items-center gap-1 mt-1.5 text-[9px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {collapsed ? `show ${step.content.length} chars` : "collapse"}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Main Trace Component ───────────────────────────────────────────

interface AgentTraceProps {
    steps: AgentStep[];
    status: AgentStatus;
    iteration: number;
    isActive: boolean;
    elapsedMs?: number;
    onAbort?: () => void;
}

export function AgentTrace({ steps, status, iteration, isActive, elapsedMs = 0, onAbort }: AgentTraceProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to latest step
    useEffect(() => {
        if (scrollRef.current && steps.length > 0) {
            const el = scrollRef.current;
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
    }, [steps.length]);

    if (!isActive && steps.length === 0) return null;

    const isRunning = status === "thinking" || status === "acting";

    const formatElapsed = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    return (
        <div className="w-full my-4 border border-zinc-800/60 rounded-xl overflow-hidden bg-zinc-950/30">
            {/* Header bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900/30 border-b border-zinc-800/40">
                <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    isRunning ? "bg-amber-400 animate-pulse" :
                        status === "done" ? "bg-emerald-400" :
                            status === "error" ? "bg-red-400" :
                                "bg-zinc-600"
                )} />

                <Bot className="w-3.5 h-3.5 text-zinc-500" />

                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                    Agent
                    {isRunning && ` · step ${iteration}/${8}`}
                    {status === "done" && ` · done`}
                    {status === "error" && ` · failed`}
                </span>

                {/* Timer */}
                {elapsedMs > 0 && (
                    <span className="flex items-center gap-1 text-[9px] font-mono text-zinc-600 ml-auto">
                        <Clock className="w-3 h-3" />
                        {formatElapsed(elapsedMs)}
                    </span>
                )}

                {/* Abort button */}
                {isRunning && onAbort && (
                    <button
                        onClick={onAbort}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors ml-2"
                    >
                        <Square className="w-2.5 h-2.5 fill-current" />
                        ABORT
                    </button>
                )}

                {/* Spinner */}
                {isRunning && (
                    <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin shrink-0" />
                )}
            </div>

            {/* Steps */}
            <div ref={scrollRef} className="p-3 space-y-1 max-h-[500px] overflow-y-auto no-scrollbar">
                {steps.map((step, i) => (
                    <StepCard key={step.id} step={step} isLast={i === steps.length - 1} />
                ))}

                {/* Active indicator */}
                {status === "thinking" && (
                    <div className="relative ml-5 pl-3">
                        <div className="absolute -left-5 top-2 w-2.5 h-2.5 rounded-full bg-amber-400/50 border-2 border-amber-400/30 animate-pulse" />
                        <div className="flex items-center gap-2 py-2">
                            <div className="flex gap-0.5">
                                <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "100ms" }} />
                                <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "200ms" }} />
                            </div>
                            <span className="text-[10px] font-mono text-zinc-600">reasoning…</span>
                        </div>
                    </div>
                )}

                {status === "acting" && (
                    <div className="relative ml-5 pl-3">
                        <div className="absolute -left-5 top-2 w-2.5 h-2.5 rounded-full bg-blue-400/50 border-2 border-blue-400/30 animate-pulse" />
                        <div className="flex items-center gap-2 py-2">
                            <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                            <span className="text-[10px] font-mono text-zinc-600">executing tool…</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
