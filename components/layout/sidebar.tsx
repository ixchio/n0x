"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, MessageSquare, TrendingDown, Search, X } from "lucide-react";
import { WEBLLM_MODELS, getTotalTokens } from "@/lib/providers/useWebLLM";
import { cn } from "@/lib/utils";
import { StorageManager } from "@/components/system/storage-manager";
import { PixelNoxMark } from "@/components/brand/pixel-nox-mark";

interface Conversation {
    id: string;
    title: string;
    messages?: Array<{ content: string; role: string }>;
    createdAt: number;
    updatedAt: number;
}

interface SidebarProps {
    isOpen: boolean;
    currentModel: string | null;
    provider?: "browser" | "ollama" | "cloud" | "chrome-ai";
    onClose?: () => void;
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

export function Sidebar({
    isOpen,
    currentModel,
    provider = "browser",
    onClose,
    onNewChat,
    conversations = [],
    activeId,
    onSwitch,
    onDelete,
}: SidebarProps) {
    const [query, setQuery] = useState("");
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
    const asideRef = useRef<HTMLElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const filteredConversations = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return conversations;
        return conversations.filter(conv => {
            if (conv.title.toLowerCase().includes(q)) return true;
            return conv.messages?.some(msg => msg.content.toLowerCase().includes(q));
        });
    }, [conversations, query]);

    useEffect(() => {
        const desktopQuery = window.matchMedia?.("(min-width: 1024px)");
        if (!desktopQuery) {
            setIsDesktop(false);
            return;
        }
        const syncDesktop = () => setIsDesktop(desktopQuery.matches);
        syncDesktop();
        desktopQuery.addEventListener?.("change", syncDesktop);
        return () => desktopQuery.removeEventListener?.("change", syncDesktop);
    }, []);

    useEffect(() => {
        if (!isOpen || !onClose || isDesktop !== false) return;

        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const main = asideRef.current?.nextElementSibling as HTMLElement | null;
        const previousInert = main?.inert;
        const previousAriaHidden = main?.getAttribute("aria-hidden");
        if (main) {
            main.inert = true;
            main.setAttribute("aria-hidden", "true");
        }
        const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            const hasHigherOverlay = Array.from(document.querySelectorAll('[role="dialog"], [role="menu"]')).some(
                overlay => overlay !== asideRef.current
            );
            if (hasHigherOverlay) return;
            event.preventDefault();
            onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            cancelAnimationFrame(focusFrame);
            document.removeEventListener("keydown", handleKeyDown);
            if (main) {
                main.inert = previousInert ?? false;
                if (previousAriaHidden == null) main.removeAttribute("aria-hidden");
                else main.setAttribute("aria-hidden", previousAriaHidden);
            }
            previousFocusRef.current?.focus();
        };
    }, [isDesktop, isOpen, onClose]);

    const trapFocus = (event: React.KeyboardEvent<HTMLElement>) => {
        if (isDesktop !== false || event.key !== "Tab" || !asideRef.current) return;
        const focusable = Array.from(
            asideRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            )
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Mobile backdrop */}
            <button
                type="button"
                className="fixed inset-0 z-30 bg-black/60 lg:hidden"
                onClick={onClose}
                aria-label="Close navigation sidebar"
            />
            <aside
                ref={asideRef}
                aria-label="Workspace navigation"
                onKeyDown={trapFocus}
                className="fixed z-40 flex h-full w-64 shrink-0 flex-col border-r border-zinc-900 bg-[#0a0a0a] font-sans lg:relative"
            >
                {/* Header */}
                <div className="p-4 border-b border-zinc-900 flex items-center gap-2">
                    <PixelNoxMark className="h-4 w-8 text-zinc-100" />
                    <span className="font-bold tracking-tight text-sm text-white">N0X Workspace</span>
                    {onClose && (
                        <button
                            ref={closeRef}
                            type="button"
                            onClick={onClose}
                            aria-label="Close navigation sidebar"
                            className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:hidden"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* New chat */}
                <div className="p-3">
                    <button
                        onClick={onNewChat}
                        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs font-medium text-zinc-300 shadow-sm transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        New Session
                    </button>
                    <label className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 focus-within:ring-2 focus-within:ring-white">
                        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                        <span className="sr-only">Search conversations</span>
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search conversations"
                            type="search"
                            className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-500"
                        />
                    </label>
                </div>

                {/* Conversation history */}
                <div className="flex-1 px-3 py-2 overflow-y-auto no-scrollbar space-y-1">
                    {conversations.length > 0 && (
                        <div className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-zinc-400">
                            {query.trim()
                                ? `${filteredConversations.length} match${filteredConversations.length === 1 ? "" : "es"}`
                                : "Recent"}
                        </div>
                    )}

                    {filteredConversations.map(conv => (
                        <div
                            key={conv.id}
                            className={cn(
                                "group flex min-h-11 items-center rounded-lg text-xs transition-all",
                                activeId === conv.id
                                    ? "bg-zinc-800/80 text-white font-medium"
                                    : "text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => onSwitch?.(conv.id)}
                                aria-current={activeId === conv.id ? "page" : undefined}
                                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                            >
                                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">{conv.title}</span>
                                    <span className="mt-0.5 block text-xs text-zinc-400">
                                        {timeAgo(conv.updatedAt)}
                                    </span>
                                </span>
                            </button>
                            {onDelete && (
                                <button
                                    type="button"
                                    onClick={() => onDelete(conv.id)}
                                    aria-label={`Delete conversation: ${conv.title}`}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-400 opacity-60 transition-all hover:bg-zinc-800 hover:text-red-300 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white lg:opacity-0 lg:group-hover:opacity-100"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    ))}

                    {conversations.length === 0 && (
                        <div className="px-2 py-4 text-center text-xs text-zinc-400">No conversations yet</div>
                    )}
                    {conversations.length > 0 && filteredConversations.length === 0 && (
                        <div className="px-2 py-4 text-center text-xs text-zinc-400">No matching conversations</div>
                    )}
                </div>

                {/* Status Panel (Footer) */}
                <div className="p-4 border-t border-zinc-900 bg-zinc-950/50 space-y-3">
                    <div className="flex flex-col gap-1 text-xs">
                        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                            Active Provider
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                            <div
                                aria-hidden="true"
                                className={cn(
                                    "w-2 h-2 rounded-full",
                                    currentModel || provider !== "browser"
                                        ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse"
                                        : "bg-zinc-700"
                                )}
                            />
                            <span className="text-zinc-300 font-mono truncate">
                                {provider === "browser"
                                    ? currentModel
                                        ? WEBLLM_MODELS.find(m => m.id === currentModel)?.label || "Loaded"
                                        : "No model selected"
                                    : provider === "ollama"
                                      ? "Ollama (local)"
                                      : provider === "cloud"
                                        ? "Cloud API"
                                        : provider === "chrome-ai"
                                          ? "Chrome AI"
                                          : "None"}
                            </span>
                        </div>
                    </div>
                    {/* Cost savings counter */}
                    {(() => {
                        const tokens = getTotalTokens();
                        if (tokens < 100) return null;
                        // Average cloud cost: ~$0.30 per 1M tokens (blended input/output)
                        const saved = (tokens / 1_000_000) * 0.3;
                        return (
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                                <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                                <div>
                                    <span className="font-mono font-bold">
                                        ${saved < 0.01 ? "<0.01" : saved.toFixed(2)}
                                    </span>
                                    <span className="ml-1 text-zinc-400">saved vs cloud</span>
                                    <div className="mt-0.5 text-xs text-zinc-400">
                                        {tokens.toLocaleString()} tokens processed locally
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="pt-2 border-t border-zinc-900/50 mt-2">
                        <StorageManager />
                    </div>
                </div>
            </aside>
        </>
    );
}
