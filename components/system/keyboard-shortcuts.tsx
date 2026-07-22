"use client";

import React, { useEffect, useRef, useState } from "react";
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
    const closeRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        function handleKeyPress(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === "/") {
                e.preventDefault();
                if (!isOpen) {
                    previousFocusRef.current = document.activeElement as HTMLElement | null;
                    setIsOpen(true);
                } else {
                    setIsOpen(false);
                    requestAnimationFrame(() => previousFocusRef.current?.focus());
                }
            }
            if (e.key === "Escape" && isOpen) {
                setIsOpen(false);
                requestAnimationFrame(() => previousFocusRef.current?.focus());
            }
        }

        document.addEventListener("keydown", handleKeyPress);
        if (isOpen) closeRef.current?.focus();
        return () => document.removeEventListener("keydown", handleKeyPress);
    }, [isOpen]);

    if (!isOpen) return null;

    const categories = Array.from(new Set(SHORTCUTS.map(s => s.category)));
    const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Tab" || !dialogRef.current) return;
        const focusable = Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
            )
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="keyboard-shortcuts-title"
                className="max-w-2xl w-full mx-4 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
                onKeyDown={trapFocus}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <Keyboard className="w-5 h-5 text-phosphor" />
                        <h2 id="keyboard-shortcuts-title" className="text-lg font-semibold text-zinc-100">
                            Keyboard Shortcuts
                        </h2>
                    </div>
                    <button
                        ref={closeRef}
                        onClick={() => {
                            setIsOpen(false);
                            requestAnimationFrame(() => previousFocusRef.current?.focus());
                        }}
                        aria-label="Close keyboard shortcuts"
                        className="flex h-11 w-11 items-center justify-center rounded transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
