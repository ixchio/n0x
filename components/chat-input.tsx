"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Send, Globe, Brain, Code, Paperclip, Upload, X, FileText, File as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AttachedFile {
    id: string;
    name: string;
    size: number;
    type: string;
}

interface ChatInputProps {
    input: string;
    setInput: (val: string) => void;
    onSend: () => void;
    isStreaming: boolean;
    deepSearchEnabled: boolean;
    toggleDeepSearch: () => void;
    memoryEnabled: boolean;
    toggleMemory: () => void;
    ragEnabled?: boolean;
    toggleRag?: () => void;
    pyodideReady?: boolean;
    pyodideLoading?: boolean;
    pyodideEnabled?: boolean;
    onPyodideLoad?: () => void;
    onPyodideToggle?: (on: boolean) => void;
    onFileDrop?: (file: File) => void;
    attachedFiles?: AttachedFile[];
    onRemoveFile?: (id: string) => void;
}

// File type badge color
function getFileBadge(name: string): { label: string; color: string } {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
        case "pdf": return { label: "PDF", color: "text-red-400 border-red-400/30 bg-red-400/10" };
        case "txt": return { label: "TXT", color: "text-blue-400 border-blue-400/30 bg-blue-400/10" };
        case "md": return { label: "MD", color: "text-purple-400 border-purple-400/30 bg-purple-400/10" };
        case "json": return { label: "JSON", color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10" };
        case "csv": return { label: "CSV", color: "text-green-400 border-green-400/30 bg-green-400/10" };
        case "docx": return { label: "DOCX", color: "text-blue-500 border-blue-500/30 bg-blue-500/10" };
        case "html":
        case "htm": return { label: "HTML", color: "text-orange-400 border-orange-400/30 bg-orange-400/10" };
        default: return { label: ext.toUpperCase() || "FILE", color: "text-gray-400 border-gray-400/30 bg-gray-400/10" };
    }
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function ChatInput({
    input,
    setInput,
    onSend,
    isStreaming,
    deepSearchEnabled,
    toggleDeepSearch,
    memoryEnabled,
    toggleMemory,
    ragEnabled,
    toggleRag,
    pyodideReady,
    pyodideLoading,
    pyodideEnabled,
    onPyodideLoad,
    onPyodideToggle,
    onFileDrop,
    attachedFiles = [],
    onRemoveFile,
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
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    // Drag and drop for RAG
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (!onFileDrop) return;
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                onFileDrop(files[i]);
            }
        }
    }, [onFileDrop]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!onFileDrop || !e.target.files) return;
        for (let i = 0; i < e.target.files.length; i++) {
            onFileDrop(e.target.files[i]);
        }
        e.target.value = "";
    }, [onFileDrop]);

    const features = [
        { key: "search", icon: Globe, label: "search", active: deepSearchEnabled, action: toggleDeepSearch },
        { key: "memory", icon: Brain, label: "memory", active: memoryEnabled, action: toggleMemory },
        ...(toggleRag ? [{ key: "rag", icon: Paperclip, label: "docs", active: !!ragEnabled, action: toggleRag }] : []),
        ...(onPyodideLoad ? [{
            key: "python",
            icon: Code,
            label: pyodideLoading ? "loading..." : (pyodideReady && pyodideEnabled) ? "py ✓" : "py",
            active: !!(pyodideReady && pyodideEnabled),
            action: () => {
                if (pyodideLoading) return;
                if (!pyodideReady) {
                    onPyodideLoad();
                    onPyodideToggle?.(true);
                } else {
                    onPyodideToggle?.(!pyodideEnabled);
                }
            },
        }] : []),
    ];

    return (
        <div
            className={cn(
                "border-t border-crt-border bg-crt-bg p-4 transition-all",
                isDragging && "border-t-2 border-t-neon-cyan bg-neon-cyan/5"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag overlay */}
            {isDragging && (
                <div className="flex items-center justify-center gap-2 py-3 mb-3 border border-dashed border-neon-cyan rounded text-xs font-mono text-neon-cyan">
                    <Upload className="w-4 h-4" />
                    drop files to attach
                </div>
            )}

            {/* ── File Preview Chips (Claude-like) ── */}
            {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {attachedFiles.map((file) => {
                        const badge = getFileBadge(file.name);
                        return (
                            <div
                                key={file.id}
                                className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-crt-border bg-crt-surface hover:border-phosphor-dim transition-all max-w-[200px]"
                            >
                                <FileText className="w-4 h-4 text-phosphor-dim shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="text-[11px] font-mono text-txt-primary truncate">
                                        {file.name}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className={cn("text-[9px] font-mono px-1 py-0.5 rounded border", badge.color)}>
                                            {badge.label}
                                        </span>
                                        <span className="text-[9px] text-txt-tertiary font-mono">
                                            {formatSize(file.size)}
                                        </span>
                                    </div>
                                </div>
                                {onRemoveFile && (
                                    <button
                                        onClick={() => onRemoveFile(file.id)}
                                        className="opacity-0 group-hover:opacity-100 text-txt-tertiary hover:text-red-400 transition-all shrink-0"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Feature toggles */}
            <div className="flex items-center gap-1 mb-3">
                {features.map((f) => (
                    <button
                        key={f.key}
                        onClick={f.action}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-all border",
                            f.active
                                ? "bg-phosphor-faint border-phosphor-dim text-phosphor"
                                : "border-crt-border text-txt-tertiary hover:text-txt-secondary hover:border-txt-tertiary"
                        )}
                    >
                        <f.icon className="w-3 h-3" />
                        {f.label}
                    </button>
                ))}

                {/* File upload button */}
                {onFileDrop && (
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border transition-all",
                            attachedFiles.length > 0
                                ? "bg-phosphor-faint border-phosphor-dim text-phosphor"
                                : "border-crt-border text-txt-tertiary hover:text-txt-secondary hover:border-txt-tertiary"
                        )}
                    >
                        <Upload className="w-3 h-3" />
                        upload
                        {attachedFiles.length > 0 && (
                            <span className="ml-0.5 text-[9px] bg-phosphor text-crt-black px-1 rounded-full font-bold">
                                {attachedFiles.length}
                            </span>
                        )}
                    </button>
                )}

                <div className="flex-1" />
                <span className="text-[10px] text-txt-tertiary font-mono">
                    "generate image of..." for img
                </span>
            </div>

            {/* Input area */}
            <div className="flex items-end gap-3">
                <span className="text-phosphor text-sm mb-2 select-none text-glow-sm">{">"}</span>

                <div className="flex-1 relative">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={attachedFiles.length > 0 ? "ask about your files..." : "type something..."}
                        disabled={isStreaming}
                        rows={1}
                        className="w-full bg-transparent text-txt-primary text-sm resize-none outline-none placeholder:text-txt-tertiary disabled:opacity-40 font-mono leading-relaxed"
                    />
                </div>

                <button
                    onClick={onSend}
                    disabled={isStreaming || (!input.trim() && attachedFiles.length === 0)}
                    className={cn(
                        "p-2 rounded border transition-all mb-0.5",
                        (input.trim() || attachedFiles.length > 0) && !isStreaming
                            ? "border-phosphor-dim text-phosphor hover:bg-phosphor-faint hover:shadow-glow-sm"
                            : "border-crt-border text-txt-tertiary"
                    )}
                >
                    <Send className="w-4 h-4" />
                </button>
            </div>

            {/* Hidden file input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.txt,.md,.json,.csv,.docx,.html,.htm,.xml,.log,.yaml,.yml,.toml,.ini,.cfg,.conf,.rst,.tex"
                multiple
            />
        </div>
    );
}
