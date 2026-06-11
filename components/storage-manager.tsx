"use client";

import React, { useState } from "react";
import { Database, Trash2, HardDrive, RefreshCw, X, AlertTriangle, CheckCircle2 } from "lucide-react";

type ClearTarget = "n0x_chat" | "voidchat_memory" | "n0x_rag_cache" | "webllm_cache";

export function StorageManager() {
    const [isOpen, setIsOpen] = useState(false);
    const [clearing, setClearing] = useState<ClearTarget | null>(null);
    // confirmTarget: which row is pending confirmation
    const [confirmTarget, setConfirmTarget] = useState<ClearTarget | null>(null);

    const clearDatabase = async (dbName: string, target: ClearTarget) => {
        setClearing(target);
        setConfirmTarget(null);
        try {
            await new Promise<void>((resolve, reject) => {
                const req = indexedDB.deleteDatabase(dbName);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
                // onblocked fires when another tab has the DB open; still resolve so UX doesn't hang
                req.onblocked = () => resolve();
            });
            setTimeout(() => window.location.reload(), 600);
        } catch (e) {
            console.error(`[StorageManager] Failed to clear ${dbName}:`, e);
            setClearing(null);
        }
    };

    const clearCacheAPI = async () => {
        setClearing("webllm_cache");
        setConfirmTarget(null);
        try {
            const cacheNames = await caches.keys();
            // MLC WebLLM uses keys like "webllm/v0" or prefixed with "mlc-ai"
            const webllmCaches = cacheNames.filter(name =>
                name.includes("webllm") ||
                name.includes("mlc-ai") ||
                name.includes("mlc_llm") ||
                name.startsWith("n0x-model")
            );
            await Promise.all(webllmCaches.map(name => caches.delete(name)));
            setTimeout(() => window.location.reload(), 600);
        } catch (e) {
            console.error("[StorageManager] Failed to clear Cache API:", e);
            setClearing(null);
        }
    };

    const rows: { target: ClearTarget; title: string; desc: string; onConfirm: () => void }[] = [
        {
            target: "n0x_chat",
            title: "Chat History",
            desc: "All saved conversations · IndexedDB: n0x_chat",
            onConfirm: () => clearDatabase("n0x_chat", "n0x_chat"),
        },
        {
            target: "voidchat_memory",
            title: "Semantic Memory",
            desc: "Agent long-term memory · IndexedDB: voidchat_memory",
            onConfirm: () => clearDatabase("voidchat_memory", "voidchat_memory"),
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
                onClick={() => setIsOpen(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors rounded-lg mt-1"
            >
                <HardDrive className="w-3.5 h-3.5" />
                Storage Manager
            </button>

            {isOpen && (
                // z-[200] so it renders above the sidebar (z-40) and any overlay (z-50)
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 font-sans"
                    onClick={() => { setIsOpen(false); setConfirmTarget(null); }}
                >
                    <div
                        className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                            <div className="flex items-center gap-2 text-white font-bold text-sm">
                                <Database className="w-4 h-4 text-emerald-400" />
                                Storage Manager
                            </div>
                            <button
                                onClick={() => { setIsOpen(false); setConfirmTarget(null); }}
                                className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            {/* Info banner */}
                            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400/90 text-[11px] p-3 rounded-lg flex gap-2 leading-relaxed">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>
                                    Browsers cap IndexedDB storage (~2GB). If you hit errors saving, uploading, or loading models — clear the relevant store here. Page will reload automatically.
                                </span>
                            </div>

                            {/* Storage rows */}
                            <div className="space-y-2">
                                {rows.map(row => (
                                    <div
                                        key={row.target}
                                        className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/30 gap-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-zinc-200 leading-tight">{row.title}</div>
                                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">{row.desc}</div>
                                        </div>

                                        {clearing === row.target ? (
                                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 shrink-0">
                                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                Clearing…
                                            </div>
                                        ) : confirmTarget === row.target ? (
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    onClick={() => setConfirmTarget(null)}
                                                    className="text-[11px] px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={row.onConfirm}
                                                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold transition-colors"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Confirm
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmTarget(row.target)}
                                                disabled={!!clearing}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[11px] font-medium rounded-md transition-colors disabled:opacity-40 shrink-0"
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
