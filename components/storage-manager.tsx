"use client";

import React, { useState, useEffect } from "react";
import { Database, Trash2, HardDrive, RefreshCw, X, AlertTriangle } from "lucide-react";

export function StorageManager() {
    const [isOpen, setIsOpen] = useState(false);
    const [clearing, setClearing] = useState<string | null>(null);

    const clearDatabase = async (dbName: string) => {
        setClearing(dbName);
        try {
            await new Promise<void>((resolve, reject) => {
                const req = indexedDB.deleteDatabase(dbName);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
                req.onblocked = () => resolve(); // Ignore blocked for now
            });
            setTimeout(() => {
                window.location.reload(); // Reload to re-initialize stores
            }, 500);
        } catch (e) {
            console.error(`Failed to clear ${dbName}:`, e);
            setClearing(null);
        }
    };

    const clearCacheAPI = async () => {
        setClearing("webllm_cache");
        try {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
                if (name.includes("webllm")) {
                    await caches.delete(name);
                }
            }
            setTimeout(() => {
                window.location.reload();
            }, 500);
        } catch (e) {
            console.error("Failed to clear Cache API:", e);
            setClearing(null);
        }
    };

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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 font-sans">
                    <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                            <div className="flex items-center gap-2 text-white font-bold">
                                <Database className="w-4 h-4 text-emerald-400" />
                                Storage Manager
                            </div>
                            <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        
                        <div className="p-4 space-y-4">
                            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500/90 text-[11px] p-3 rounded-lg flex gap-2 leading-relaxed">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <div>
                                    Browsers cap IndexedDB storage (often at 2GB). If you encounter errors saving memories, uploading files, or downloading models, clear your storage here.
                                </div>
                            </div>

                            <div className="space-y-2">
                                <StorageRow 
                                    title="Chat History" 
                                    desc="All your saved conversations (n0x_chat)" 
                                    onClear={() => clearDatabase("n0x_chat")}
                                    isClearing={clearing === "n0x_chat"}
                                />
                                <StorageRow 
                                    title="Semantic Memory" 
                                    desc="Agent's long-term memory (voidchat_memory)" 
                                    onClear={() => clearDatabase("voidchat_memory")}
                                    isClearing={clearing === "voidchat_memory"}
                                />
                                <StorageRow 
                                    title="RAG Vector Cache" 
                                    desc="Embeddings for uploaded files (n0x_rag_cache)" 
                                    onClear={() => clearDatabase("n0x_rag_cache")}
                                    isClearing={clearing === "n0x_rag_cache"}
                                />
                                <StorageRow 
                                    title="Model Weights Cache" 
                                    desc="Downloaded LLM weights (Cache API)" 
                                    onClear={clearCacheAPI}
                                    isClearing={clearing === "webllm_cache"}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function StorageRow({ title, desc, onClear, isClearing }: { title: string, desc: string, onClear: () => void, isClearing: boolean }) {
    return (
        <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/30">
            <div>
                <div className="text-sm font-semibold text-zinc-200">{title}</div>
                <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{desc}</div>
            </div>
            <button 
                onClick={onClear}
                disabled={isClearing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
            >
                {isClearing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {isClearing ? "Clearing..." : "Clear"}
            </button>
        </div>
    );
}
