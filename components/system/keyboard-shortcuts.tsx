"use client";

import React, { useState, useEffect } from "react";
import { X, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";

interface Shortcut {
    keys: string[];
    description: string;
    category: string;
}

const SHORTCUTS: Shortcut[] = [
    // Navigation
    { keys: ["⌘", "K"], description: "Open command palette", category: "Navigation" },
    { keys: ["⌘", "N"], description: "New chat", category: "Navigation" },
    { keys: ["⌘", "B"], description: "Toggle sidebar", category: "Navigation" },
    { keys: ["⌘", "/"], description: "Show keyboard shortcuts", category: "Navigation" },
    { keys: ["Esc"], description: "Close dialogs", category: "Navigation" },

    // Messaging
    { keys: ["Enter"], description: "Send message", category: "Messaging" },
    { keys: ["Shift", "Enter"], description: "New line", category: "Messaging" },
    { keys: ["⌘", "I"], description: "Toggle agent mode", category: "Messaging" },
    { keys: ["⌘", "S"], description: "Toggle deep search", category: "Messaging" },
    { keys: ["⌘", "D"], description: "Toggle document RAG", category: "Messaging" },
    { keys: ["⌘", "M"], description: "Toggle memory", category: "Messaging" },

    // Voice
    { keys: ["⌘", "R"], description: "Start voice recording", category: "Voice" },
    { keys: ["⌘", "T"], description: "Toggle text-to-speech", category: "Voice" },

    // Editing
    { keys: ["⌘", "Z"], description: "Undo", category: "Editing" },
    { keys: ["⌘", "Shift", "Z"], description: "Redo", category: "Editing" },
    { keys: ["⌘", "A"], description: "Select all", category: "Editing" },
    { keys: ["⌘", "C"], description: "Copy", category: "Editing" },
    { keys: ["⌘", "V"], description: "Paste", category: "Editing" },
];

export function KeyboardShortcuts() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        function handleKeyPress(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === "/") {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === "Escape" && isOpen) {
                setIsOpen(false);
            }
        }

        document.addEventListener("keydown", handleKeyPress);
        return () => document.removeEventListener("keydown", handleKeyPress);
    }, [isOpen]);

    if (!isOpen) return null;

    const categories = Array.from(new Set(SHORTCUTS.map(s => s.category)));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="max-w-2xl w-full mx-4 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <Keyboard className="w-5 h-5 text-phosphor" />
                        <h2 className="text-lg font-semibold text-zinc-100">Keyboard Shortcuts</h2>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 hover:bg-zinc-800 rounded transition-colors"
                    >
                        <X className="w-5 h-5 text-zinc-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    <div className="space-y-6">
                        {categories.map(category => (
                            <div key={category}>
                                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                                    {category}
                                </h3>
                                <div className="space-y-2">
                                    {SHORTCUTS.filter(s => s.category === category).map((shortcut, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between py-2 hover:bg-zinc-800/50 px-3 rounded transition-colors"
                                        >
                                            <span className="text-sm text-zinc-300">{shortcut.description}</span>
                                            <div className="flex gap-1">
                                                {shortcut.keys.map((key, j) => (
                                                    <React.Fragment key={j}>
                                                        <kbd className="px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded text-zinc-300 min-w-[28px] text-center">
                                                            {key}
                                                        </kbd>
                                                        {j < shortcut.keys.length - 1 && (
                                                            <span className="text-zinc-600 px-1">+</span>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-950/50">
                    <p className="text-xs text-zinc-500 text-center">
                        Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">⌘ /</kbd> or{" "}
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Esc</kbd> to close
                    </p>
                </div>
            </div>
        </div>
    );
}
