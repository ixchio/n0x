"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Send, Square, Globe, Brain, Code, Paperclip, Upload, X, FileText, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface AttachedFile { id: string; name: string; size: number; type: string; }

interface ChatInputProps {
    input: string; setInput: (val: string) => void;
    onSend: () => void; onStop?: () => void; isStreaming: boolean;
    deepSearchEnabled: boolean; toggleDeepSearch: () => void;
    memoryEnabled: boolean; toggleMemory: () => void;
    ragEnabled?: boolean; toggleRag?: () => void;
    pyodideReady?: boolean; pyodideLoading?: boolean; pyodideEnabled?: boolean;
    onPyodideLoad?: () => void; onPyodideToggle?: (on: boolean) => void;
    onFileDrop?: (file: File) => void; attachedFiles?: AttachedFile[]; onRemoveFile?: (id: string) => void;
    sttSupported?: boolean; sttListening?: boolean; onSttToggle?: () => void;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function ChatInput({
    input, setInput, onSend, onStop, isStreaming, deepSearchEnabled, toggleDeepSearch,
    memoryEnabled, toggleMemory, ragEnabled, toggleRag, pyodideReady, pyodideLoading, pyodideEnabled,
    onPyodideLoad, onPyodideToggle, onFileDrop, attachedFiles = [], onRemoveFile,
    sttSupported, sttListening, onSttToggle,
}: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
        }
    }, [input]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
    };

    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false);
        if (!onFileDrop) return;
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) onFileDrop(files[i]);
        }
    }, [onFileDrop]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!onFileDrop || !e.target.files) return;
        for (let i = 0; i < e.target.files.length; i++) onFileDrop(e.target.files[i]);
        e.target.value = "";
    }, [onFileDrop]);

    const features = [
        { key: "search", icon: Globe, label: "Search", active: deepSearchEnabled, action: toggleDeepSearch },
        { key: "memory", icon: Brain, label: "Memory", active: memoryEnabled, action: toggleMemory },
        ...(toggleRag ? [{ key: "rag", icon: Paperclip, label: "Docs", active: !!ragEnabled, action: toggleRag }] : []),
        ...(onPyodideLoad ? [{
            key: "python", icon: Code, label: pyodideLoading ? "Loading..." : (pyodideReady && pyodideEnabled) ? "Py ✓" : "Py", active: !!(pyodideReady && pyodideEnabled),
            action: () => {
                if (pyodideLoading) return;
                if (!pyodideReady) { onPyodideLoad(); onPyodideToggle?.(true); } else { onPyodideToggle?.(!pyodideEnabled); }
            },
        }] : []),
    ];

    return (
        <div
            className={cn("bg-background mx-auto max-w-4xl w-full p-4", isDragging && "bg-zinc-900/50 rounded-xl")}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        >
            <div className="relative border border-zinc-800 bg-zinc-900/40 rounded-2xl shadow-sm overflow-hidden focus-within:border-zinc-700 transition-colors flex flex-col pt-3 pb-2 px-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">

                {attachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {attachedFiles.map((file) => (
                            <div key={file.id} className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
                                <FileText className="w-3.5 h-3.5 text-zinc-500" />
                                <span className="text-zinc-300 max-w-[120px] truncate">{file.name}</span>
                                <span className="text-zinc-600 text-[10px]">{formatSize(file.size)}</span>
                                {onRemoveFile && (
                                    <button onClick={() => onRemoveFile(file.id)} className="ml-1 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <textarea
                    ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder={sttListening ? "Listening..." : "Message n0x..."} disabled={isStreaming} rows={1}
                    className="w-full bg-transparent text-sm resize-none outline-none text-zinc-200 placeholder:text-zinc-500 leading-relaxed max-h-[160px] min-h-[40px] no-scrollbar"
                />

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800/50">
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                        {onFileDrop && (
                            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors text-zinc-400 hover:text-white hover:bg-zinc-800">
                                <Upload className="w-3.5 h-3.5" /> Attach
                            </button>
                        )}
                        {features.map((f) => (
                            <button key={f.key} onClick={f.action} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors", f.active ? "bg-white text-black" : "text-zinc-400 hover:text-white hover:bg-zinc-800")}>
                                <f.icon className="w-3.5 h-3.5" /> {f.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {sttSupported && onSttToggle && (
                            <button onClick={onSttToggle} className={cn("p-2 rounded-full transition-colors", sttListening ? "bg-red-500/20 text-red-500 animate-pulse" : "text-zinc-400 hover:bg-zinc-800 hover:text-white")}>
                                {sttListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                            </button>
                        )}
                        {isStreaming && onStop ? (
                            <button onClick={onStop} className="p-2 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors">
                                <Square className="w-4 h-4 fill-current" />
                            </button>
                        ) : (
                            <button onClick={onSend} disabled={isStreaming || (!input.trim() && attachedFiles.length === 0)} className="p-2 rounded-full bg-white text-black disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors hover:bg-zinc-200">
                                <Send className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".pdf,.txt,.md,.json,.csv,.docx,.html,.htm,.xml,.log,.yaml,.yml,.toml,.ini,.cfg,.conf,.rst,.tex" multiple />
        </div>
    );
}
