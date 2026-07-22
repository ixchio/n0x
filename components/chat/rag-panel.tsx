"use client";

import React, { useRef } from "react";
import { useRAG } from "@/lib/retrieval/useRAG";
import { FileText, Loader2, Upload, X, Database, Plus } from "lucide-react";

export function RAGPanel() {
    const rag = useRAG();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            rag.addFile(e.target.files[0]);
        }
    };

    if (!rag.ragEnabled) return null;

    return (
        <section
            aria-label="Knowledge base"
            className="absolute bottom-20 right-6 z-20 w-72 overflow-hidden rounded border border-crt-border bg-crt-surface animate-slide-up"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-crt-border">
                <div className="flex items-center gap-2 text-xs font-mono">
                    <Database className="w-3.5 h-3.5 text-neon-cyan" />
                    <span className="text-neon-cyan">knowledge base</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={async () => {
                            await rag.clearCache();
                            rag.clear();
                        }}
                        aria-label="Clear all documents and vector cache"
                        className="flex h-11 w-11 items-center justify-center rounded text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        title="Clear Vector Cache"
                    >
                        <Database className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={rag.toggle}
                        aria-label="Close knowledge base"
                        className="flex h-11 w-11 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Documents */}
            <div className="p-2 max-h-48 overflow-y-auto no-scrollbar">
                {rag.documents.length === 0 ? (
                    <div className="space-y-1 py-6 text-center text-xs font-mono text-zinc-400">
                        <Upload className="w-5 h-5 mx-auto opacity-30" />
                        <p>drop pdf/txt/md files</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {rag.documents.map(doc => (
                            <div
                                key={doc.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono hover:bg-crt-hover"
                            >
                                <FileText className="w-3.5 h-3.5 text-phosphor-dim shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="truncate text-txt-primary">{doc.name}</div>
                                    <div className="text-xs text-zinc-400">
                                        {doc.chunks} chunks · {Math.round(doc.size / 1024)}kb
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add button */}
            <div className="p-2 border-t border-crt-border">
                {rag.isIndexing ? (
                    <div
                        role="status"
                        className="flex min-h-11 items-center justify-center gap-2 py-1.5 text-xs font-mono text-phosphor"
                    >
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {rag.status}
                    </div>
                ) : (
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded border border-crt-border px-3 py-2 text-xs font-mono text-zinc-300 transition-all hover:border-phosphor-dim hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        <Plus className="w-3 h-3" />
                        add document
                    </button>
                )}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.txt,.md,.json"
                />
            </div>
        </section>
    );
}
