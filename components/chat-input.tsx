"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Send, Globe, Brain, Code, Paperclip, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

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
                    // toggle on/off
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
                    drop files to add to knowledge base
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
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border border-crt-border text-txt-tertiary hover:text-txt-secondary hover:border-txt-tertiary transition-all"
                    >
                        <Upload className="w-3 h-3" />
                        upload
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
                        placeholder="type something..."
                        disabled={isStreaming}
                        rows={1}
                        className="w-full bg-transparent text-txt-primary text-sm resize-none outline-none placeholder:text-txt-tertiary disabled:opacity-40 font-mono leading-relaxed"
                    />
                </div>

                <button
                    onClick={onSend}
                    disabled={isStreaming || !input.trim()}
                    className={cn(
                        "p-2 rounded border transition-all mb-0.5",
                        input.trim() && !isStreaming
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
                accept=".pdf,.txt,.md,.json,.csv"
                multiple
            />
        </div>
    );
}
