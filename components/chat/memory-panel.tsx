"use client";

import React, { useState } from "react";
import { Brain, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Memory {
    id: string;
    content: string;
    embedding: number[];
    timestamp: number;
    tags: string[];
}

interface MemoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    memories: Memory[];
    onSave: (content: string) => void;
    onDelete: (id: string) => void;
    onSearch: (query: string) => Memory[];
}

export function MemoryPanel({ isOpen, onClose, memories, onSave, onDelete, onSearch }: MemoryPanelProps) {
    const [newMemory, setNewMemory] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Memory[] | null>(null);

    if (!isOpen) return null;

    const handleSave = () => {
        if (newMemory.trim()) {
            onSave(newMemory.trim());
            setNewMemory("");
        }
    };

    const handleSearch = () => {
        if (searchQuery.trim()) {
            setSearchResults(onSearch(searchQuery));
        } else {
            setSearchResults(null);
        }
    };

    const displayMemories = searchResults || memories;

    return (
        <section
            aria-label="Memory bank"
            className="absolute bottom-20 left-6 z-20 w-80 overflow-hidden rounded border border-crt-border bg-crt-surface animate-slide-up"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-crt-border">
                <div className="flex items-center gap-2 text-xs font-mono">
                    <Brain className="w-3.5 h-3.5 text-neon-amber" />
                    <span className="text-neon-amber">memory bank</span>
                    <span className="text-txt-tertiary">({memories.length})</span>
                </div>
                <button
                    onClick={onClose}
                    aria-label="Close memory bank"
                    className="flex h-11 w-11 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-crt-border flex gap-2">
                <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                    placeholder="search memories..."
                    aria-label="Search memories"
                    className="min-h-11 flex-1 bg-transparent text-xs font-mono text-txt-primary outline-none placeholder:text-zinc-500"
                />
                <button
                    onClick={handleSearch}
                    aria-label="Search memories"
                    className="flex h-11 w-11 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                    <Search className="w-3 h-3" />
                </button>
            </div>

            {/* Memories list */}
            <div className="max-h-48 overflow-y-auto no-scrollbar p-2 space-y-1">
                {displayMemories.length === 0 ? (
                    <div className="py-4 text-center text-xs font-mono text-zinc-400">no memories stored</div>
                ) : (
                    displayMemories.map(m => (
                        <div
                            key={m.id}
                            className="group flex items-start gap-2 px-2 py-1.5 rounded hover:bg-crt-hover text-xs font-mono"
                        >
                            <span className="text-phosphor-dim mt-0.5">·</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-txt-primary truncate">{m.content}</div>
                                <div className="text-xs text-zinc-400">
                                    {new Date(m.timestamp).toLocaleDateString()}
                                </div>
                            </div>
                            <button
                                onClick={() => onDelete(m.id)}
                                aria-label={`Delete memory: ${m.content.slice(0, 40)}`}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-zinc-300 opacity-60 transition-all hover:bg-zinc-800 hover:text-red-300 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Add memory */}
            <div className="p-2 border-t border-crt-border flex gap-2">
                <input
                    value={newMemory}
                    onChange={e => setNewMemory(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSave()}
                    placeholder="add memory..."
                    aria-label="New memory"
                    className="min-h-11 flex-1 bg-transparent text-xs font-mono text-txt-primary outline-none placeholder:text-zinc-500"
                />
                <button
                    onClick={handleSave}
                    disabled={!newMemory.trim()}
                    aria-label="Save memory"
                    className="flex h-11 w-11 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30"
                >
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>
        </section>
    );
}
