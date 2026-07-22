"use client";

import React, { useEffect, useRef } from "react";

interface KeyboardShortcutsDialogProps {
    open: boolean;
    onClose: () => void;
}

const SHORTCUTS = [
    ["⌘/Ctrl + K", "Command palette"],
    ["⌘/Ctrl + Shift + N", "New conversation"],
    ["?", "Toggle this help"],
    ["Enter", "Send message"],
    ["Shift + Enter", "New line in input"],
] as const;

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;

        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        closeRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            previousFocusRef.current?.focus();
        };
    }, [onClose, open]);

    const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Tab" || !dialogRef.current) return;
        const focusable = Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
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

    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/80" onClick={onClose} aria-hidden="true" />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="keyboard-shortcuts-title"
                    className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl sm:p-6"
                    onClick={event => event.stopPropagation()}
                    onKeyDown={trapFocus}
                >
                    <div className="mb-4 flex items-center justify-between">
                        <h3 id="keyboard-shortcuts-title" className="text-sm font-semibold text-white">
                            Keyboard shortcuts
                        </h3>
                        <button
                            ref={closeRef}
                            onClick={onClose}
                            aria-label="Close keyboard shortcuts"
                            className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            <span className="text-lg">×</span>
                        </button>
                    </div>
                    <div className="space-y-2 text-xs">
                        {SHORTCUTS.map(([key, description]) => (
                            <div
                                key={key}
                                className="flex items-center justify-between border-b border-zinc-800/50 py-1.5 last:border-0"
                            >
                                <span className="text-zinc-400">{description}</span>
                                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                                    {key}
                                </kbd>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
