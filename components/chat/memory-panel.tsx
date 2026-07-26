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
    onSave: (content: string) => unknown | Promise<unknown>;
    onDelete: (id: string) => unknown | Promise<unknown>;
    onSearch: (query: string) => Memory[];
    busy?: boolean;
}

export function MemoryPanel({ isOpen, onClose, memories, onSave, onDelete, onSearch, busy = false }: MemoryPanelProps) {
    const [newMemory, setNewMemory] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Memory[] | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [operationError, setOperationError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSave = async () => {
        const content = newMemory.trim();
        if (!content || isSaving || busy) return;

        setIsSaving(true);
        setOperationError(null);
        try {
            const result = await onSave(content);
            if (result === false || result === null) {
                setOperationError("Memory was not saved. Check browser storage and try again.");
                return;
            }
            setNewMemory("");
        } catch {
            setOperationError("Memory was not saved. Check browser storage and try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (deletingId || busy) return;

        setDeletingId(id);
        setOperationError(null);
        try {
            const result = await onDelete(id);
            if (result === false || result === null) {
                setOperationError("Memory was not deleted. It remains stored on this device.");
            }
        } catch {
            setOperationError("Memory was not deleted. It remains stored on this device.");
        } finally {
            setDeletingId(null);
        }
    };

    const handleSearch = () => {
        if (busy) return;
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
            aria-busy={busy || isSaving || deletingId !== null}
            className="absolute inset-x-3 bottom-20 z-20 w-auto overflow-hidden rounded border border-crt-border bg-crt-surface animate-slide-up sm:left-6 sm:right-auto sm:w-80"
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
                    disabled={busy}
                    className="min-h-11 flex-1 bg-transparent text-xs font-mono text-txt-primary outline-none placeholder:text-zinc-500"
                />
                <button
                    onClick={handleSearch}
                    aria-label="Search memories"
                    disabled={busy}
                    className="flex h-11 w-11 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
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
                                onClick={() => void handleDelete(m.id)}
                                disabled={busy || deletingId !== null}
                                aria-label={`Delete memory: ${m.content.slice(0, 40)}`}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-zinc-300 opacity-60 transition-all hover:bg-zinc-800 hover:text-red-300 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-30 sm:opacity-0 sm:group-hover:opacity-100"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Add memory */}
            <div className="border-t border-crt-border p-2">
                {operationError && (
                    <p role="alert" aria-live="assertive" className="mb-2 px-1 text-xs leading-5 text-red-300">
                        {operationError}
                    </p>
                )}
                <div className="flex gap-2">
                    <input
                        value={newMemory}
                        onChange={e => setNewMemory(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter") void handleSave();
                        }}
                        placeholder="add memory..."
                        aria-label="New memory"
                        disabled={busy || isSaving}
                        className="min-h-11 flex-1 bg-transparent text-xs font-mono text-txt-primary outline-none placeholder:text-zinc-500 disabled:cursor-wait disabled:opacity-60"
                    />
                    <button
                        onClick={() => void handleSave()}
                        disabled={busy || !newMemory.trim() || isSaving}
                        aria-label={isSaving ? "Saving memory" : "Save memory"}
                        className="flex h-11 w-11 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </section>
    );
}
