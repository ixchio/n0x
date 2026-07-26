"use client";

import React, { useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { Terminal, Volume2, VolumeX, Database, Cpu, Keyboard } from "lucide-react";
import { WEBLLM_MODELS } from "@/lib/providers/useWebLLM";
import { getKeySoundEnabled, setKeySoundEnabled } from "@/lib/media/useKeySound";

export function modelSizeInGB(size?: string): number {
    const match = size?.match(/([\d.]+)\s*(MB|GB)/i);
    if (!match) return 0;
    const value = Number.parseFloat(match[1]);
    return match[2].toUpperCase() === "MB" ? value / 1024 : value;
}

export function hasOpenOverlay(): boolean {
    return Boolean(document.querySelector('[role="dialog"], [role="menu"], [data-chat-popover="true"]'));
}

export function shouldToggleShortcuts(shortcutsOpen: boolean): boolean {
    return shortcutsOpen || !hasOpenOverlay();
}

interface CommandMenuProps {
    onLoadModel: (modelId: string) => void;
    browserModelsAvailable: boolean;
    onNewChat: () => void;
    ttsEnabled: boolean;
    onToggleTTS: () => void;
    ragEnabled: boolean;
    onToggleRAG: () => void;
}

export function CommandMenu({
    onLoadModel,
    browserModelsAvailable,
    onNewChat,
    ttsEnabled,
    onToggleTTS,
    ragEnabled,
    onToggleRAG,
}: CommandMenuProps) {
    const [open, setOpen] = useState(false);
    const [keySounds, setKeySounds] = useState(false);
    const paletteRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        setKeySounds(getKeySoundEnabled());
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                if (!open && hasOpenOverlay()) {
                    e.preventDefault();
                    return;
                }
                e.preventDefault();
                if (!open) {
                    previousFocusRef.current =
                        document.activeElement instanceof HTMLElement ? document.activeElement : null;
                }
                setOpen(!open);
                return;
            }
            if (e.key === "Escape" && open) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                setOpen(false);
            }
        };
        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        return () => previousFocusRef.current?.focus();
    }, [open]);

    const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Tab" || !paletteRef.current) return;
        const focusable = Array.from(
            paletteRef.current.querySelectorAll<HTMLElement>(
                'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
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
        <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh] sm:px-4 sm:pt-[20vh]">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80" onClick={() => setOpen(false)} aria-hidden="true" />

            {/* Command palette */}
            <Command
                ref={paletteRef}
                label="Search commands"
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
                onKeyDown={trapFocus}
                className="relative max-h-[calc(100dvh-4rem)] w-full max-w-md overflow-hidden rounded border border-crt-border bg-crt-surface font-mono text-sm shadow-2xl"
            >
                {/* Input */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-crt-border">
                    <span className="text-phosphor text-xs">{">"}</span>
                    <Command.Input
                        autoFocus
                        placeholder="type a command..."
                        aria-label="Search commands"
                        className="flex-1 bg-transparent text-txt-primary text-xs outline-none placeholder:text-txt-tertiary font-mono"
                    />
                    <kbd className="rounded border border-crt-border px-1.5 py-0.5 text-[11px] text-zinc-400">esc</kbd>
                </div>

                {/* List */}
                <Command.List className="max-h-72 overflow-y-auto no-scrollbar p-1.5">
                    <Command.Empty className="py-4 text-center text-txt-tertiary text-xs">no results</Command.Empty>

                    {/* Actions */}
                    <Command.Group
                        heading={<span className="px-1 text-xs uppercase tracking-wider text-zinc-400">actions</span>}
                    >
                        <Command.Item
                            onSelect={() => {
                                onNewChat();
                                setOpen(false);
                            }}
                            className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-zinc-300 hover:bg-crt-hover hover:text-phosphor data-[selected=true]:bg-crt-hover data-[selected=true]:text-phosphor"
                        >
                            <Terminal className="w-3 h-3" />
                            new session
                        </Command.Item>
                        <Command.Item
                            onSelect={() => {
                                onToggleTTS();
                                setOpen(false);
                            }}
                            className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-zinc-300 hover:bg-crt-hover hover:text-phosphor data-[selected=true]:bg-crt-hover data-[selected=true]:text-phosphor"
                        >
                            {ttsEnabled ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                            {ttsEnabled ? "disable tts" : "enable tts"}
                        </Command.Item>
                        <Command.Item
                            onSelect={() => {
                                onToggleRAG();
                                setOpen(false);
                            }}
                            className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-zinc-300 hover:bg-crt-hover hover:text-phosphor data-[selected=true]:bg-crt-hover data-[selected=true]:text-phosphor"
                        >
                            <Database className="w-3 h-3" />
                            {ragEnabled ? "disable document context" : "enable document context"}
                        </Command.Item>
                        <Command.Item
                            onSelect={() => {
                                const next = !keySounds;
                                setKeySoundEnabled(next);
                                setKeySounds(next);
                                setOpen(false);
                            }}
                            className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-zinc-300 hover:bg-crt-hover hover:text-phosphor data-[selected=true]:bg-crt-hover data-[selected=true]:text-phosphor"
                        >
                            <Keyboard className="w-3 h-3" />
                            {keySounds ? "disable key sounds" : "enable key sounds"}
                        </Command.Item>
                    </Command.Group>

                    {browserModelsAvailable && (
                        <Command.Group
                            heading={
                                <span className="mt-2 px-1 text-xs uppercase tracking-wider text-zinc-400">
                                    browser models
                                </span>
                            }
                        >
                            {WEBLLM_MODELS.map(model => (
                                <Command.Item
                                    key={model.id}
                                    onSelect={() => {
                                        onLoadModel(model.id);
                                        setOpen(false);
                                    }}
                                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-zinc-300 hover:bg-crt-hover hover:text-phosphor data-[selected=true]:bg-crt-hover data-[selected=true]:text-phosphor"
                                >
                                    <Cpu className="w-3 h-3" />
                                    <span className="flex-1">{model.label}</span>
                                    <span className="text-xs text-zinc-400">{model.size}</span>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}
                </Command.List>

                {/* Footer */}
                <div className="flex gap-3 border-t border-crt-border px-3 py-2 text-[11px] text-zinc-400">
                    <span>↑↓ navigate</span>
                    <span>↵ select</span>
                    <span>esc close</span>
                </div>
            </Command>
        </div>
    );
}
