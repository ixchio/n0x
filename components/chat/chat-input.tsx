"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
    Send,
    Square,
    Globe,
    Brain,
    Code,
    Paperclip,
    Upload,
    X,
    FileText,
    Mic,
    MicOff,
    Bot,
    ImageIcon,
    Shuffle,
} from "lucide-react";
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
    onStop?: () => void;
    isStreaming: boolean;
    deepSearchEnabled: boolean;
    toggleDeepSearch: () => void;
    memoryEnabled: boolean;
    toggleMemory: () => void;
    reasoningEnabled?: boolean;
    toggleReasoning?: () => void;
    ragEnabled?: boolean;
    toggleRag?: () => void;
    pyodideReady?: boolean;
    pyodideLoading?: boolean;
    pyodideEnabled?: boolean;
    onPyodideLoad?: () => void;
    onPyodideToggle?: (on: boolean) => void;
    onFileDrop?: (file: File) => void;
    fileInputId?: string;
    attachedFiles?: AttachedFile[];
    onRemoveFile?: (id: string) => void;
    fileStatus?: string | null;
    agentEnabled?: boolean;
    toggleAgent?: () => void;
    sttSupported?: boolean;
    sttListening?: boolean;
    onSttToggle?: () => void;
    onImagePrefill?: () => void;
    autoRouteEnabled?: boolean;
    toggleAutoRoute?: () => void;
    lastRouteDecision?: string | null;
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
    onStop,
    isStreaming,
    deepSearchEnabled,
    toggleDeepSearch,
    memoryEnabled,
    toggleMemory,
    reasoningEnabled,
    toggleReasoning,
    ragEnabled,
    toggleRag,
    pyodideReady,
    pyodideLoading,
    pyodideEnabled,
    onPyodideLoad,
    onPyodideToggle,
    onFileDrop,
    fileInputId = "n0x-attach-input",
    attachedFiles = [],
    onRemoveFile,
    fileStatus,
    agentEnabled,
    toggleAgent,
    sttSupported,
    sttListening,
    onSttToggle,
    onImagePrefill,
    autoRouteEnabled,
    toggleAutoRoute,
    lastRouteDecision,
}: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const visibleFileStatus = fileStatus?.trim().toLowerCase() === "ready" ? "" : fileStatus?.trim() || "";
    const fileStatusIsError = /failed|unsupported|too large|empty|could not|not allowed|invalid/i.test(
        visibleFileStatus
    );

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
        }
    }, [input]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

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
    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            if (!onFileDrop) return;
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                for (let i = 0; i < files.length; i++) onFileDrop(files[i]);
            }
        },
        [onFileDrop]
    );

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (!onFileDrop || !e.target.files) return;
            for (let i = 0; i < e.target.files.length; i++) onFileDrop(e.target.files[i]);
            e.target.value = "";
        },
        [onFileDrop]
    );

    const features = [
        { key: "search", icon: Globe, label: "Search", active: deepSearchEnabled, action: toggleDeepSearch },
        { key: "memory", icon: Brain, label: "Memory", active: memoryEnabled, action: toggleMemory },
        ...(toggleRag ? [{ key: "rag", icon: Paperclip, label: "Docs", active: !!ragEnabled, action: toggleRag }] : []),
        ...(onPyodideLoad
            ? [
                  {
                      key: "python",
                      icon: Code,
                      label: pyodideLoading ? "Loading..." : pyodideReady && pyodideEnabled ? "Py ✓" : "Py",
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
                  },
              ]
            : []),
        ...(toggleAgent
            ? [{ key: "agent", icon: Bot, label: "Agent", active: !!agentEnabled, action: toggleAgent }]
            : []),
        ...(onImagePrefill
            ? [{ key: "image", icon: ImageIcon, label: "Image", active: false, action: onImagePrefill }]
            : []),
        ...(toggleAutoRoute
            ? [
                  {
                      key: "autoroute",
                      icon: Shuffle,
                      label: autoRouteEnabled
                          ? lastRouteDecision === "cloud"
                              ? "Auto ☁"
                              : lastRouteDecision === "local"
                                ? "Auto ⚡"
                                : "Auto"
                          : "Auto",
                      active: !!autoRouteEnabled,
                      action: toggleAutoRoute,
                  },
              ]
            : []),
    ];

    return (
        <div
            className={cn(
                "mx-auto w-full max-w-4xl bg-background p-2 sm:p-4",
                isDragging && "rounded-xl bg-zinc-900/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="relative flex flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/40 px-2.5 pb-1.5 pt-2 shadow-[0_4px_24px_rgba(0,0,0,0.2)] transition-colors focus-within:border-zinc-500 sm:rounded-2xl sm:px-4 sm:pb-2 sm:pt-3">
                {attachedFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2 sm:mb-3">
                        {attachedFiles.map(file => (
                            <div
                                key={file.id}
                                className="group flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 py-1 pl-3 pr-1 text-xs"
                            >
                                <FileText className="w-3.5 h-3.5 text-zinc-500" />
                                <span className="text-zinc-300 max-w-[120px] truncate">{file.name}</span>
                                <span className="text-xs text-zinc-400">{formatSize(file.size)}</span>
                                {onRemoveFile && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveFile(file.id)}
                                        aria-label={`Remove ${file.name}`}
                                        className="ml-1 flex h-11 w-11 items-center justify-center rounded-md text-zinc-300 opacity-70 transition hover:bg-zinc-800 hover:text-red-300 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="mb-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar no-scrollbar sm:mb-2 sm:pr-2">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={sttListening ? "Listening..." : "Message n0x..."}
                        aria-label="Message n0x"
                        disabled={isStreaming}
                        rows={1}
                        className="min-h-11 w-full resize-none overflow-y-auto bg-transparent text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ height: "auto" }}
                    />
                </div>

                <div className="flex min-w-0 items-center justify-between gap-1 border-t border-zinc-700/70 bg-transparent pb-0.5 pt-1 sm:gap-2 sm:pb-1 sm:pt-2">
                    <div className="flex min-w-0 flex-1 flex-nowrap gap-0.5 overflow-x-auto py-0.5 no-scrollbar sm:gap-1.5 sm:py-1">
                        {onFileDrop && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                aria-label="Attach files"
                                title="Attach files"
                                className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-2.5"
                            >
                                <Upload className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                <span className="hidden sm:inline">Attach</span>
                            </button>
                        )}
                        {features.map(f => (
                            <button
                                type="button"
                                key={f.key}
                                onClick={f.action}
                                aria-label={f.active ? `${f.label}, enabled` : f.label}
                                aria-pressed={f.key === "image" ? undefined : f.active}
                                title={f.label}
                                className={cn(
                                    "flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-2.5",
                                    f.active
                                        ? "bg-white text-black"
                                        : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                )}
                            >
                                <f.icon className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                <span className="hidden sm:inline">{f.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                        {sttSupported && onSttToggle && (
                            <button
                                type="button"
                                onClick={onSttToggle}
                                aria-label={sttListening ? "Stop voice input" : "Start voice input"}
                                aria-pressed={sttListening}
                                className={cn(
                                    "flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                                    sttListening
                                        ? "animate-pulse bg-red-500/20 text-red-300"
                                        : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                )}
                            >
                                {sttListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                            </button>
                        )}
                        {isStreaming && onStop ? (
                            <button
                                type="button"
                                onClick={onStop}
                                aria-label="Stop generating"
                                className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/20 text-red-300 transition-colors hover:bg-red-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <Square className="w-4 h-4 fill-current" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={onSend}
                                disabled={isStreaming || (!input.trim() && attachedFiles.length === 0)}
                                aria-label="Send message"
                                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {visibleFileStatus && (
                <p
                    role="status"
                    aria-live="polite"
                    className={cn("px-2 pt-2 text-xs leading-5", fileStatusIsError ? "text-red-300" : "text-zinc-300")}
                >
                    {visibleFileStatus}
                </p>
            )}
            <input
                id={fileInputId}
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
