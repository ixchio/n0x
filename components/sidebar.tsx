"use client";

import React from "react";
import { Terminal, Plus, Hash, Cpu } from "lucide-react";
import { WEBLLM_MODELS, MODEL_CATEGORIES } from "@/lib/useWebLLM";
import { cn } from "@/lib/utils";

interface SidebarProps {
    isOpen: boolean;
    currentModel: string | null;
    onNewChat: () => void;
}

export function Sidebar({ isOpen, currentModel, onNewChat }: SidebarProps) {
    if (!isOpen) return null;

    const modelCount = {
        fast: WEBLLM_MODELS.filter(m => m.category === "fast").length,
        balanced: WEBLLM_MODELS.filter(m => m.category === "balanced").length,
        powerful: WEBLLM_MODELS.filter(m => m.category === "powerful").length,
    };

    return (
        <aside className="w-56 h-full bg-crt-black border-r border-crt-border flex flex-col shrink-0">
            {/* Header */}
            <div className="p-4 border-b border-crt-border">
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-phosphor" />
                    <span className="font-pixel text-xs text-phosphor text-glow-sm tracking-wider">N0X</span>
                </div>
            </div>

            {/* New chat */}
            <div className="p-3">
                <button
                    onClick={onNewChat}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-phosphor-text border border-crt-border rounded hover:bg-phosphor-faint hover:border-phosphor-dim transition-all"
                >
                    <Plus className="w-3.5 h-3.5" />
                    new session
                </button>
            </div>

            {/* Status */}
            <div className="flex-1 px-3 py-2 space-y-3 overflow-y-auto no-scrollbar">
                <div className="text-[10px] text-txt-tertiary uppercase tracking-wider px-1">
                    system
                </div>

                <div className="space-y-1">
                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs rounded">
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            currentModel ? "bg-phosphor animate-pulse" : "bg-txt-tertiary"
                        )} />
                        <span className="text-txt-secondary truncate text-[11px]">
                            {currentModel
                                ? WEBLLM_MODELS.find(m => m.id === currentModel)?.label || "loaded"
                                : "no model loaded"
                            }
                        </span>
                    </div>
                </div>
            </div>

            {/* Models count */}
            <div className="p-3 border-t border-crt-border">
                <div className="text-[10px] text-txt-tertiary space-y-1 px-1">
                    <div className="flex justify-between">
                        <span>fast</span>
                        <span className="text-phosphor-dim">{modelCount.fast}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>balanced</span>
                        <span className="text-phosphor-dim">{modelCount.balanced}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>powerful</span>
                        <span className="text-phosphor-dim">{modelCount.powerful}</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
