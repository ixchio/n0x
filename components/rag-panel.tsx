"use client";

import React, { useRef } from "react";
import { useRAG } from "@/lib/useRAG";
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
        <div className="absolute bottom-20 right-6 w-72 bg-crt-surface border border-crt-border rounded overflow-hidden z-20 animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-crt-border">
                <div className="flex items-center gap-2 text-xs font-mono">
                    <Database className="w-3.5 h-3.5 text-neon-cyan" />
                    <span className="text-neon-cyan">knowledge base</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={async () => { await rag.clearCache(); rag.clear(); }} className="text-txt-tertiary hover:text-red-400 transition-colors" title="Clear Vector Cache">
                        <Database className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={rag.toggle} className="text-txt-tertiary hover:text-txt-primary">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Documents */}
            <div className="p-2 max-h-48 overflow-y-auto no-scrollbar">
                {rag.documents.length === 0 ? (
                    <div className="text-center py-6 text-txt-tertiary text-[10px] font-mono space-y-1">
                        <Upload className="w-5 h-5 mx-auto opacity-30" />
                        <p>drop pdf/txt/md files</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {rag.documents.map(doc => (
                            <div key={doc.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono hover:bg-crt-hover">
                                <FileText className="w-3.5 h-3.5 text-phosphor-dim shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="truncate text-txt-primary">{doc.name}</div>
                                    <div className="text-[10px] text-txt-tertiary">{doc.chunks} chunks · {Math.round(doc.size / 1024)}kb</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add button */}
            <div className="p-2 border-t border-crt-border">
                {rag.isIndexing ? (
                    <div className="flex items-center justify-center gap-2 text-[11px] text-phosphor font-mono py-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {rag.status}
                    </div>
                ) : (
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono border border-crt-border text-txt-secondary hover:text-phosphor hover:border-phosphor-dim transition-all"
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
        </div>
    );
}
