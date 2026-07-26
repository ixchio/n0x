"use client";
import { logger } from "@/lib/core/logger";

import React, { useEffect, useRef, useState } from "react";
import { Database, Trash2, HardDrive, RefreshCw, X, AlertTriangle, CheckCircle2 } from "lucide-react";

type ClearTarget = "n0x_chat" | "n0x_memory" | "n0x_rag_cache" | "webllm_cache";

export function deleteDatabaseDurably(
    factory: Pick<IDBFactory, "deleteDatabase">,
    dbName: string,
    onBlocked: () => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = factory.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error(`Could not clear ${dbName}`));
        // onblocked is a pending state, not a cancellation. The same request
        // may succeed after another tab closes its connection.
        request.onblocked = onBlocked;
    });
}

export function StorageManager({ disabled = false }: { disabled?: boolean }) {
    const [isOpen, setIsOpen] = useState(false);
    const [clearing, setClearing] = useState<ClearTarget | null>(null);
    // confirmTarget: which row is pending confirmation
    const [confirmTarget, setConfirmTarget] = useState<ClearTarget | null>(null);
    const [blockedTarget, setBlockedTarget] = useState<ClearTarget | null>(null);
    const [operationError, setOperationError] = useState<string | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const cancelConfirmRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        closeRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || clearing) return;
            setIsOpen(false);
            setConfirmTarget(null);
            triggerRef.current?.focus();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [clearing, isOpen]);

    useEffect(() => {
        if (confirmTarget) cancelConfirmRef.current?.focus();
    }, [confirmTarget]);

    const closeDialog = () => {
        if (clearing) return;
        setIsOpen(false);
        setConfirmTarget(null);
        requestAnimationFrame(() => triggerRef.current?.focus());
    };

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

    const clearDatabase = async (dbName: string, target: ClearTarget) => {
        setClearing(target);
        setBlockedTarget(null);
        setOperationError(null);
        setConfirmTarget(null);
        try {
            await deleteDatabaseDurably(indexedDB, dbName, () => setBlockedTarget(target));
            window.location.reload();
        } catch (e) {
            logger.error(`[StorageManager] Failed to clear ${dbName}:`, e);
            setClearing(null);
            setBlockedTarget(null);
            setOperationError(`Could not clear ${dbName}. Check browser storage permissions and try again.`);
        }
    };

    const clearCacheAPI = async () => {
        setClearing("webllm_cache");
        setConfirmTarget(null);
        try {
            const cacheNames = await caches.keys();
            // MLC WebLLM uses keys like "webllm/v0" or prefixed with "mlc-ai"
            const webllmCaches = cacheNames.filter(
                name =>
                    name.includes("webllm") ||
                    name.includes("mlc-ai") ||
                    name.includes("mlc_llm") ||
                    name.startsWith("n0x-model")
            );
            await Promise.all(webllmCaches.map(name => caches.delete(name)));
            window.location.reload();
        } catch (e) {
            logger.error("[StorageManager] Failed to clear Cache API:", e);
            setClearing(null);
            setOperationError("Could not clear model weights. Check browser storage permissions and try again.");
        }
    };

    const rows: { target: ClearTarget; title: string; desc: string; onConfirm: () => void }[] = [
        {
            target: "n0x_chat",
            title: "Chat History",
            desc: "Conversations and their cited evidence snapshots · IndexedDB: n0x_chat",
            onConfirm: () => clearDatabase("n0x_chat", "n0x_chat"),
        },
        {
            target: "n0x_memory",
            title: "Semantic Memory",
            desc: "Agent long-term memory · IndexedDB: n0x_memory",
            onConfirm: () => clearDatabase("n0x_memory", "n0x_memory"),
        },
        {
            target: "n0x_rag_cache",
            title: "RAG Vector Cache",
            desc: "Document embeddings · IndexedDB: n0x_rag_cache",
            onConfirm: () => clearDatabase("n0x_rag_cache", "n0x_rag_cache"),
        },
        {
            target: "webllm_cache",
            title: "Model Weights",
            desc: "Downloaded LLM weights · Cache API (mlc-ai/web-llm)",
            onConfirm: clearCacheAPI,
        },
    ];

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(true)}
                disabled={disabled}
                className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
            >
                <HardDrive className="w-3.5 h-3.5" />
                Storage Manager
            </button>

            {isOpen && (
                // z-[200] so it renders above the sidebar (z-40) and any overlay (z-50)
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 font-sans"
                    onClick={closeDialog}
                >
                    <div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="storage-manager-title"
                        aria-describedby="storage-manager-description"
                        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-[#0a0a0a] shadow-2xl"
                        onClick={e => e.stopPropagation()}
                        onKeyDown={trapFocus}
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                            <div
                                id="storage-manager-title"
                                className="flex items-center gap-2 text-sm font-bold text-white"
                            >
                                <Database className="w-4 h-4 text-emerald-400" />
                                Storage Manager
                            </div>
                            <button
                                ref={closeRef}
                                onClick={closeDialog}
                                aria-label="Close storage manager"
                                className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            {operationError && (
                                <p
                                    role="alert"
                                    aria-live="assertive"
                                    className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200"
                                >
                                    {operationError}
                                </p>
                            )}
                            {/* Info banner */}
                            <div
                                id="storage-manager-description"
                                className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-300"
                            >
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>
                                    Browsers cap IndexedDB storage (~2GB). If you hit errors saving, uploading, or
                                    loading models — clear the relevant store here. Page will reload automatically.
                                </span>
                            </div>

                            {/* Storage rows */}
                            <div className="space-y-2">
                                {rows.map(row => (
                                    <div
                                        key={row.target}
                                        className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-zinc-200 leading-tight">
                                                {row.title}
                                            </div>
                                            <div className="mt-1 text-xs text-zinc-400 sm:truncate">{row.desc}</div>
                                        </div>

                                        {clearing === row.target ? (
                                            <div
                                                role="status"
                                                className="flex min-h-11 shrink-0 items-center gap-1.5 text-xs text-zinc-300"
                                            >
                                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                {blockedTarget === row.target
                                                    ? "Waiting for other n0x tabs to close…"
                                                    : "Clearing…"}
                                            </div>
                                        ) : confirmTarget === row.target ? (
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                <button
                                                    ref={cancelConfirmRef}
                                                    onClick={() => setConfirmTarget(null)}
                                                    className="min-h-11 rounded px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={row.onConfirm}
                                                    aria-label={`Confirm clearing ${row.title}`}
                                                    className="flex min-h-11 items-center gap-1 rounded bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Confirm
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmTarget(row.target)}
                                                disabled={!!clearing}
                                                aria-label={`Clear ${row.title}`}
                                                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
