"use client";

import React from "react";
import { Plus, Trash2, MessageSquare, Box } from "lucide-react";
import { WEBLLM_MODELS } from "@/lib/useWebLLM";
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
        <aside className="w-64 h-full bg-[#0a0a0a] border-r border-zinc-900 flex flex-col shrink-0 font-sans">
            {/* Header */}
            <div className="p-4 border-b border-zinc-900 flex items-center gap-2">
                <Box className="w-4 h-4 text-white" />
                <span className="font-bold tracking-tight text-sm text-white">N0X Workspace</span>
            </div>

            {/* New chat */}
            <div className="p-3">
                <button
                    onClick={onNewChat}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:bg-zinc-800 hover:text-white hover:border-zinc-700 transition-all shadow-sm"
                >
                    <Plus className="w-3.5 h-3.5" />
                    New Session
                </button>
            </div>

            {/* Conversation history */}
            <div className="flex-1 px-3 py-2 overflow-y-auto no-scrollbar space-y-1">
                {conversations.length > 0 && (
                    <div className="text-[10px] text-zinc-500 font-medium px-1 mb-2 uppercase tracking-wider">
                        Recent
                    </div>
                )}

                {conversations.map((conv) => (
                    <div
                        key={conv.id}
                        className={cn(
                            "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all text-xs",
                            activeId === conv.id
                                ? "bg-zinc-800/80 text-white font-medium"
                                : "text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"
                        )}
                        onClick={() => onSwitch?.(conv.id)}
                    >
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                        <div className="flex-1 min-w-0">
                            <div className="truncate">{conv.title}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">{timeAgo(conv.updatedAt)}</div>
                        </div>
                        {onDelete && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all shrink-0 p-1 rounded-md hover:bg-zinc-800"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                ))}

                {conversations.length === 0 && (
                    <div className="text-xs text-zinc-500 px-2 py-4 text-center">
                        No conversations yet
                    </div>
                )}
            </div>

            {/* Status Panel (Footer) */}
            <div className="p-4 border-t border-zinc-900 bg-zinc-950/50">
                <div className="flex flex-col gap-1 text-[11px]">
                    <span className="text-zinc-500 font-medium uppercase tracking-wider text-[10px]">Active Model</span>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={cn(
                            "w-2 h-2 rounded-full",
                            currentModel ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse" : "bg-zinc-700"
                        )} />
                        <span className="text-zinc-300 font-mono truncate">
                            {currentModel
                                ? WEBLLM_MODELS.find(m => m.id === currentModel)?.label || "Loaded"
                                : "None selected"
                            }
                        </span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
