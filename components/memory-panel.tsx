"use client";

import React, { useState, useCallback } from "react";
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
        <div className="absolute bottom-20 left-6 w-80 bg-crt-surface border border-crt-border rounded overflow-hidden z-20 animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-crt-border">
                <div className="flex items-center gap-2 text-xs font-mono">
                    <Brain className="w-3.5 h-3.5 text-neon-amber" />
                    <span className="text-neon-amber">memory bank</span>
                    <span className="text-txt-tertiary">({memories.length})</span>
                </div>
                <button onClick={onClose} className="text-txt-tertiary hover:text-txt-primary">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-crt-border flex gap-2">
                <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="search memories..."
                    className="flex-1 bg-transparent text-xs font-mono text-txt-primary outline-none placeholder:text-txt-tertiary"
                />
                <button onClick={handleSearch} className="text-txt-tertiary hover:text-phosphor">
                    <Search className="w-3 h-3" />
                </button>
            </div>

            {/* Memories list */}
            <div className="max-h-48 overflow-y-auto no-scrollbar p-2 space-y-1">
                {displayMemories.length === 0 ? (
                    <div className="text-center py-4 text-txt-tertiary text-[10px] font-mono">no memories stored</div>
                ) : (
                    displayMemories.map((m) => (
                        <div key={m.id} className="group flex items-start gap-2 px-2 py-1.5 rounded hover:bg-crt-hover text-xs font-mono">
                            <span className="text-phosphor-dim mt-0.5">·</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-txt-primary truncate">{m.content}</div>
                                <div className="text-[10px] text-txt-tertiary">{new Date(m.timestamp).toLocaleDateString()}</div>
                            </div>
                            <button
                                onClick={() => onDelete(m.id)}
                                className="opacity-0 group-hover:opacity-100 text-txt-tertiary hover:text-red-400 transition-all mt-0.5"
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
                    onChange={(e) => setNewMemory(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    placeholder="add memory..."
                    className="flex-1 bg-transparent text-xs font-mono text-txt-primary outline-none placeholder:text-txt-tertiary"
                />
                <button
                    onClick={handleSave}
                    disabled={!newMemory.trim()}
                    className="text-txt-tertiary hover:text-phosphor disabled:opacity-30"
                >
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
