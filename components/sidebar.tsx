"use client";

import React from "react";
import { Terminal, Plus, Hash, Cpu, Trash2, MessageSquare } from "lucide-react";
import { WEBLLM_MODELS, MODEL_CATEGORIES } from "@/lib/useWebLLM";
import { cn } from "@/lib/utils";

interface Conversation {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
}

interface SidebarProps {
    isOpen: boolean;
    currentModel: string | null;
    onNewChat: () => void;
    conversations?: Conversation[];
    activeId?: string | null;
    onSwitch?: (id: string) => void;
    onDelete?: (id: string) => void;
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Sidebar({ isOpen, currentModel, onNewChat, conversations = [], activeId, onSwitch, onDelete }: SidebarProps) {
    if (!isOpen) return null;

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

            {/* Conversation history */}
            <div className="flex-1 px-3 py-2 overflow-y-auto no-scrollbar space-y-1">
                {conversations.length > 0 && (
                    <div className="text-[10px] text-txt-tertiary uppercase tracking-wider px-1 mb-2">
                        history
                    </div>
                )}

                {conversations.map((conv) => (
                    <div
                        key={conv.id}
                        className={cn(
                            "group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all text-[11px] font-mono",
                            activeId === conv.id
                                ? "bg-phosphor-faint border border-phosphor-dim text-phosphor"
                                : "text-txt-secondary hover:bg-crt-hover hover:text-txt-primary border border-transparent"
                        )}
                        onClick={() => onSwitch?.(conv.id)}
                    >
                        <MessageSquare className="w-3 h-3 shrink-0 opacity-50" />
                        <div className="flex-1 min-w-0">
                            <div className="truncate">{conv.title}</div>
                            <div className="text-[9px] text-txt-tertiary">{timeAgo(conv.updatedAt)}</div>
                        </div>
                        {onDelete && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                                className="opacity-0 group-hover:opacity-100 text-txt-tertiary hover:text-red-400 transition-all shrink-0"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                ))}

                {conversations.length === 0 && (
                    <div className="text-[10px] text-txt-tertiary px-2 py-4 text-center">
                        no conversations yet
                    </div>
                )}
            </div>

            {/* Status */}
            <div className="p-3 border-t border-crt-border space-y-2">
                <div className="flex items-center gap-2 px-1 text-[11px]">
                    <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        currentModel ? "bg-phosphor animate-pulse" : "bg-txt-tertiary"
                    )} />
                    <span className="text-txt-secondary truncate">
                        {currentModel
                            ? WEBLLM_MODELS.find(m => m.id === currentModel)?.label || "loaded"
                            : "no model loaded"
                        }
                    </span>
                </div>
            </div>
        </aside>
    );
}
