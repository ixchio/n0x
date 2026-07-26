"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Optimize: Move remarkPlugins to constant to prevent ReactMarkdown reconfiguration on every render
const REMARK_PLUGINS = [remarkGfm];
const SyntaxHighlightedCode = dynamic(
    () => import("@/components/chat/syntax-highlighted-code").then(module => module.SyntaxHighlightedCode),
    {
        ssr: false,
        loading: () => <div className="h-5 w-40 animate-pulse rounded bg-zinc-800" aria-hidden="true" />,
    }
);
import {
    Copy,
    Check,
    Play,
    Loader2,
    Eye,
    EyeOff,
    ZoomIn,
    Download,
    Bot,
    Terminal,
    Brain,
    ChevronDown,
    ChevronRight,
    GitBranch,
    Cloud,
    Monitor,
    Server,
    Sparkles,
    Search,
    FileText,
    HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessageMeta } from "@/lib/chat/useChatStore";
import { buildSandboxHtml } from "@/lib/runtime/artifactSandbox";
import { CitationEvidence } from "@/components/chat/citation-evidence";

export { buildSandboxHtml } from "@/lib/runtime/artifactSandbox";

interface MessageBubbleProps {
    role: "user" | "assistant";
    content: string;
    image?: string;
    onRunCode?: (code: string) => Promise<{ output: string; error: string | null; duration: number }>;
    onBranch?: () => void;
    meta?: ChatMessageMeta;
    timestamp?: number;
    previousPrompt?: string;
}

const PY_BLOCKLIST = [
    "pygame",
    "tkinter",
    "PyQt5",
    "PyQt6",
    "PySide2",
    "PySide6",
    "cv2",
    "opencv",
    "tensorflow",
    "torch",
    "torchvision",
    "torchaudio",
    "flask",
    "django",
    "fastapi",
    "uvicorn",
    "gunicorn",
    "selenium",
    "playwright",
    "pyautogui",
    "pynput",
    "psutil",
    "subprocess",
    "multiprocessing",
    "threading",
    "socket",
    "asyncio",
    "aiohttp",
    "requests",
    "httpx",
    "urllib3",
    "serial",
    "usb",
    "bluetooth",
    "gpio",
    "wx",
    "kivy",
    "pyglet",
    "arcade",
    "turtle",
    "sounddevice",
    "pyaudio",
    "playsound",
    "docker",
    "kubernetes",
    "boto3",
    "paramiko",
];

export function codeResultKey(code: string): string {
    return code;
}

function isLocalMarkdownImageSource(src: string): boolean {
    const source = src.trim();
    if (!source) return false;
    // Relative assets and non-network payloads cannot contact a third-party
    // host. Absolute HTTP(S) URLs always require approval; using a made-up
    // comparison origin here would let that hostname bypass the gate.
    if ((source.startsWith("/") && !source.startsWith("//")) || /^\.\.?(?:\/|$)/.test(source)) return true;
    return source.startsWith("data:") || source.startsWith("blob:");
}

function externalImageHost(src: string): string {
    try {
        const url = new URL(src);
        return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : "external source";
    } catch {
        return "external source";
    }
}

function SafeMarkdownImage({ src = "", alt = "", ...props }: React.ComponentPropsWithoutRef<"img">) {
    const [approved, setApproved] = useState(false);
    const source = typeof src === "string" ? src : "";

    if (isLocalMarkdownImageSource(source)) {
        return <img {...props} src={source} alt={alt} loading="lazy" decoding="async" />;
    }

    if (!approved) {
        return (
            <span className="not-prose my-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
                <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                    External image blocked
                    <span className="ml-1 text-amber-200/70">({externalImageHost(source)})</span>
                </span>
                <button
                    type="button"
                    onClick={() => setApproved(true)}
                    className="min-h-11 rounded-md border border-amber-400/30 px-3 py-2 font-medium text-amber-100 transition hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                >
                    Load once
                </button>
            </span>
        );
    }

    return (
        <img
            {...props}
            src={source}
            alt={alt}
            loading="lazy"
            decoding="async"
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
        />
    );
}

function SafeMarkdownLink({ href = "", children, ...props }: React.ComponentPropsWithoutRef<"a">) {
    const external = /^(?:https?:)?\/\//i.test(href);
    return (
        <a
            {...props}
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
        >
            {children}
        </a>
    );
}

function canRunPython(code: string): boolean {
    const importRe = /(?:^|\n)\s*(?:import|from)\s+([\w.]+)/g;
    let m;
    const modules: string[] = [];
    while ((m = importRe.exec(code)) !== null) {
        modules.push(m[1].split(".")[0]);
    }
    if (modules.length === 0) return true;
    return !modules.some(mod => PY_BLOCKLIST.includes(mod));
}

const CodeBlock = ({ children, className, onRunCode, codeResults, runningCode, handleRunCode, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "");
    const code = String(children).replace(/\n$/, "");
    const [copied, setCopied] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const lang = match?.[1]?.toLowerCase() || "";
    const isPython = lang === "python" || lang === "py";
    const isWeb = ["html", "htm", "javascript", "js", "css"].includes(lang);
    const pyRunnable = isPython && canRunPython(code);
    // Auto-detect "artifact" — a full HTML document with <html or <!doctype
    const isArtifact =
        isWeb && lang === "html" && (code.toLowerCase().includes("<!doctype") || code.toLowerCase().includes("<html"));

    if (!match) {
        return (
            <code
                className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded-md text-[0.85em] font-mono border border-zinc-700"
                {...props}
            >
                {children}
            </code>
        );
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePreview = () => {
        setShowPreview(current => !current);
    };

    const codeId = codeResultKey(code);
    const result = codeResults?.[codeId];
    const isRunning = runningCode === codeId;

    return (
        <div
            className={cn(
                "my-4 border rounded-xl overflow-hidden shadow-sm bg-[#0a0a0a]",
                isArtifact && showPreview ? "border-purple-500/30" : "border-zinc-800"
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-zinc-300">{lang}</span>
                    {isArtifact && (
                        <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-purple-300">
                            ARTIFACT
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    {isWeb && (
                        <button
                            onClick={handlePreview}
                            aria-label={showPreview ? `Show ${lang} source code` : `Preview ${lang} code`}
                            aria-pressed={showPreview}
                            title={showPreview ? "Show source code" : "Run in sandboxed preview"}
                            className={cn(
                                "flex min-h-11 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-mono font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                                showPreview ? "bg-white text-black" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                            )}
                        >
                            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            {showPreview ? "Code" : "Preview"}
                        </button>
                    )}

                    {pyRunnable && onRunCode && (
                        <button
                            onClick={() => handleRunCode(code)}
                            disabled={isRunning}
                            aria-label={isRunning ? "Running Python code" : "Run Python code"}
                            className="flex min-h-11 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-mono font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-60"
                        >
                            {isRunning ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Play className="w-3.5 h-3.5" />
                            )}
                            Run
                        </button>
                    )}

                    <button
                        onClick={handleCopy}
                        aria-label={copied ? "Code copied" : "Copy code"}
                        title={copied ? "Copied" : "Copy code"}
                        className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                            copied ? "bg-[#1f1f1f] text-phosphor" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                        )}
                    >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {/* Code view */}
            {!showPreview && (
                <div className="p-4 bg-[#0a0a0a] overflow-x-auto text-[13px] leading-relaxed no-scrollbar">
                    <SyntaxHighlightedCode language={lang} code={code} />
                </div>
            )}

            {/* Web preview iframe — taller for artifacts */}
            {showPreview && isWeb && (
                <div className={cn("relative bg-white w-full", isArtifact ? "h-[500px]" : "h-[400px]")}>
                    <iframe
                        sandbox="allow-scripts"
                        srcDoc={buildSandboxHtml(code, lang)}
                        referrerPolicy="no-referrer"
                        className="w-full h-full border-0 absolute inset-0"
                        title={`${lang} preview`}
                    />
                </div>
            )}

            {/* Python output */}
            {result && (
                <div className="border-t border-zinc-800 p-3 bg-zinc-950">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
                        <Terminal className="w-3 h-3" /> Execution output · {result.duration}ms
                        {result.duration > 3000 && (
                            <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-300">
                                WASM — expect 10–50× vs native
                            </span>
                        )}
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                        {result.output && (
                            <pre className="text-[13px] text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed pb-2">
                                {result.output}
                            </pre>
                        )}
                        {result.error && (
                            <pre className="text-[13px] text-red-400 font-mono whitespace-pre-wrap leading-relaxed pb-2">
                                {result.error}
                            </pre>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

function MessageMetaBadge({ meta, align = "left" }: { meta?: ChatMessageMeta; align?: "left" | "right" }) {
    if (!meta) return null;

    const privacy = meta.privacy || "unknown";
    const label =
        privacy === "cloud"
            ? "CLOUD"
            : privacy === "mixed"
              ? "NETWORK PATH"
              : privacy === "local"
                ? "LOCAL"
                : "UNKNOWN";
    const Icon =
        privacy === "unknown"
            ? HelpCircle
            : meta.provider === "cloud"
              ? Cloud
              : meta.provider === "ollama"
                ? Server
                : meta.provider === "chrome-ai"
                  ? Sparkles
                  : Monitor;

    return (
        <div className={cn("mb-1 flex flex-wrap items-center gap-1.5", align === "right" && "justify-end")}>
            <span
                className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                    privacy === "cloud"
                        ? "border-blue-500/25 bg-blue-500/10 text-blue-300"
                        : privacy === "mixed"
                          ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                          : privacy === "local"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                            : "border-zinc-700 bg-zinc-900/70 text-zinc-300"
                )}
            >
                <Icon className="h-2.5 w-2.5" />
                {label} · {meta.providerLabel || "Provider"}
            </span>
            {meta.modelName && (
                <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-xs text-zinc-400">
                    {meta.modelName}
                </span>
            )}
            {meta.usedDocs && (
                <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-xs text-zinc-400">
                    <FileText className="h-2.5 w-2.5" />
                    docs
                </span>
            )}
            {meta.usedSearch && (
                <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-xs text-zinc-400">
                    <Search className="h-2.5 w-2.5" />
                    search
                </span>
            )}
        </div>
    );
}

function buildAnswerCard(content: string, meta?: ChatMessageMeta, timestamp?: number, previousPrompt?: string): string {
    const generatedAt = new Date(timestamp || Date.now()).toISOString();
    const privacy =
        meta?.privacy === "cloud"
            ? "Cloud provider"
            : meta?.privacy === "mixed"
              ? "Network involved"
              : meta?.privacy === "local"
                ? "Local device"
                : "Unknown";

    return [
        "# N0X Answer Card",
        "",
        `Generated: ${generatedAt}`,
        `Provider: ${meta?.providerLabel || "Unknown"}`,
        `Model: ${meta?.modelName || "Unknown"}`,
        `Privacy path: ${privacy}`,
        `Context: ${
            [
                meta?.usedDocs ? "uploaded docs" : "",
                meta?.usedSearch ? "web search" : "",
                meta?.usedMemory ? "memory" : "",
                meta?.agent ? "agent mode" : "",
            ]
                .filter(Boolean)
                .join(", ") || "chat only"
        }`,
        "",
        "## Question",
        "",
        previousPrompt || "(question not captured)",
        "",
        "## Answer",
        "",
        content,
        ...(meta?.citations?.length
            ? [
                  "",
                  "## Evidence used",
                  "",
                  ...meta.citations.map(citation => `- [${citation.documentName}#chunk-${citation.chunkIndex}]`),
              ]
            : []),
    ].join("\n");
}

function downloadText(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function downloadImage(filename: string, source: string) {
    let parsed: URL;
    try {
        parsed = new URL(source, window.location.href);
    } catch {
        return;
    }
    if (!["http:", "https:", "blob:", "data:"].includes(parsed.protocol)) return;

    try {
        const response = await fetch(parsed.href, { referrerPolicy: "no-referrer" });
        if (!response.ok) throw new Error(`Image download failed (${response.status})`);
        const objectUrl = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(objectUrl);
    } catch {
        // Some image hosts allow display but block fetch/CORS. Keep the current
        // workspace intact and open the source in a separate tab as a fallback.
        const popup = window.open(parsed.href, "_blank", "noopener,noreferrer");
        if (popup) popup.opener = null;
    }
}

export const MessageBubble = React.memo(function MessageBubble({
    role,
    content,
    image,
    onRunCode,
    onBranch,
    meta,
    timestamp,
    previousPrompt,
}: MessageBubbleProps) {
    const [runningCode, setRunningCode] = useState<string | null>(null);
    const [codeResults, setCodeResults] = useState<
        Record<string, { output: string; error: string | null; duration: number }>
    >({});
    const [imageZoomed, setImageZoomed] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [showThinking, setShowThinking] = useState(false);
    const [answerCopied, setAnswerCopied] = useState(false);
    const runningCodeRef = useRef<string | null>(null);
    const imageThumbnailRef = useRef<HTMLButtonElement>(null);
    const imageToolbarRef = useRef<HTMLButtonElement>(null);
    const imageOpenerKindRef = useRef<"thumbnail" | "toolbar">("thumbnail");
    const imageDialogButtonRef = useRef<HTMLButtonElement>(null);
    const imageWasZoomedRef = useRef(false);

    useEffect(() => {
        if (!imageZoomed) {
            if (imageWasZoomedRef.current) {
                imageWasZoomedRef.current = false;
                const opener = imageOpenerKindRef.current === "toolbar" ? imageToolbarRef : imageThumbnailRef;
                opener.current?.focus();
            }
            return;
        }

        imageWasZoomedRef.current = true;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        imageDialogButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setImageZoomed(false);
            } else if (event.key === "Tab") {
                event.preventDefault();
                imageDialogButtonRef.current?.focus();
            }
        };
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [imageZoomed]);

    let thinking = "";
    let finalContent = content;

    if (role === "assistant") {
        const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
        if (thinkMatch) {
            thinking = thinkMatch[1].trim();
            finalContent = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/, "").trim();
        }
    }

    const handleRunCode = async (code: string) => {
        const inFlight = runningCodeRef.current;
        // React may commit the completed result one tick before it commits the
        // matching `runningCode = null`. Once that result exists, the prior
        // invocation is complete and must not swallow a click on another block.
        if (!onRunCode || (inFlight && !codeResults[inFlight])) return;
        const codeId = codeResultKey(code);
        runningCodeRef.current = codeId;
        setRunningCode(codeId);
        try {
            const result = await onRunCode(code);
            setCodeResults(prev => ({ ...prev, [codeId]: result }));
        } catch (error: any) {
            setCodeResults(prev => ({ ...prev, [codeId]: { output: "", error: error.message, duration: 0 } }));
        } finally {
            if (runningCodeRef.current === codeId) runningCodeRef.current = null;
            setRunningCode(null);
        }
    };

    if (role === "user") {
        return (
            <div className="flex justify-end animate-slide-up group">
                <div className="relative max-w-[75%]">
                    <MessageMetaBadge meta={meta} align="right" />
                    <div className="bg-zinc-800 text-white px-5 py-3.5 rounded-2xl rounded-tr-sm text-[15px] shadow-sm leading-relaxed">
                        <div className="whitespace-pre-wrap">{content}</div>
                    </div>
                    {onBranch && (
                        <button
                            onClick={onBranch}
                            aria-label="Branch conversation from this message"
                            title="Branch conversation from here"
                            className="absolute -left-12 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 opacity-60 transition-opacity hover:bg-zinc-800 hover:text-white focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100"
                        >
                            <GitBranch className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const answerCard = buildAnswerCard(finalContent || content, meta, timestamp, previousPrompt);
    const handleCopyAnswerCard = async () => {
        try {
            await navigator.clipboard.writeText(answerCard);
        } catch {
            const el = document.createElement("textarea");
            el.value = answerCard;
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
        }
        setAnswerCopied(true);
        setTimeout(() => setAnswerCopied(false), 1800);
    };

    return (
        <div className="flex gap-4 animate-slide-up group">
            <div className="shrink-0 w-8 h-8 rounded-full bg-white text-black flex items-center justify-center mt-1 shadow-sm">
                <Bot className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0 max-w-4xl space-y-4 pt-1.5 relative">
                <MessageMetaBadge meta={meta} />
                {image && (
                    <div className="relative inline-block">
                        {/* Loading skeleton */}
                        {imageLoading && !imageError && (
                            <div className="h-[300px] w-[300px] max-w-full rounded-xl border border-zinc-800 bg-zinc-900 flex flex-col items-center justify-center gap-3 animate-pulse">
                                <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                                <span className="text-xs font-mono text-zinc-400">generating image…</span>
                            </div>
                        )}
                        {/* Error state with retry */}
                        {imageError && (
                            <div className="w-[300px] max-w-full rounded-xl bg-zinc-900 border border-red-500/20 p-6 flex flex-col items-center gap-3">
                                <span className="text-sm text-zinc-400">Image failed to load</span>
                                <button
                                    onClick={() => {
                                        setImageError(false);
                                        setImageLoading(true);
                                    }}
                                    className="min-h-11 rounded-lg bg-zinc-800 px-4 py-2 text-xs text-zinc-200 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                        {/* Actual image */}
                        {imageZoomed ? (
                            <div
                                role="dialog"
                                aria-modal="true"
                                aria-label="Generated image preview"
                                className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm"
                                onMouseDown={event => {
                                    if (event.target === event.currentTarget) setImageZoomed(false);
                                }}
                            >
                                <button
                                    ref={imageDialogButtonRef}
                                    type="button"
                                    aria-label="Close generated image preview"
                                    className="flex max-h-full max-w-full items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                    onClick={() => setImageZoomed(false)}
                                >
                                    <img
                                        key={imageError ? "retry" : "initial"}
                                        src={image}
                                        alt="Generated"
                                        crossOrigin="anonymous"
                                        referrerPolicy="no-referrer"
                                        onLoad={() => {
                                            setImageLoading(false);
                                            setImageError(false);
                                        }}
                                        onError={() => {
                                            setImageLoading(false);
                                            setImageError(true);
                                        }}
                                        className="max-h-[calc(100vh-2rem)] max-w-full rounded-xl object-contain"
                                    />
                                </button>
                            </div>
                        ) : (
                            <button
                                ref={imageThumbnailRef}
                                type="button"
                                aria-label="Open generated image preview"
                                aria-haspopup="dialog"
                                className={cn(
                                    "max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                                    (imageLoading || imageError) && "hidden"
                                )}
                                onClick={() => {
                                    imageOpenerKindRef.current = "thumbnail";
                                    setImageZoomed(true);
                                }}
                            >
                                <img
                                    key={imageError ? "retry" : "initial"}
                                    src={image}
                                    alt="Generated"
                                    crossOrigin="anonymous"
                                    referrerPolicy="no-referrer"
                                    onLoad={() => {
                                        setImageLoading(false);
                                        setImageError(false);
                                    }}
                                    onError={() => {
                                        setImageLoading(false);
                                        setImageError(true);
                                    }}
                                    className="h-auto w-full"
                                />
                            </button>
                        )}
                        {!imageZoomed && !imageLoading && !imageError && (
                            <div className="absolute bottom-3 right-3 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                <button
                                    ref={imageToolbarRef}
                                    onClick={e => {
                                        e.stopPropagation();
                                        imageOpenerKindRef.current = "toolbar";
                                        setImageZoomed(true);
                                    }}
                                    aria-label="Expand generated image preview"
                                    className="flex h-11 w-11 items-center justify-center rounded-lg bg-black/70 text-white backdrop-blur transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={event => {
                                        event.stopPropagation();
                                        void downloadImage(`n0x-${timestamp || Date.now()}.png`, image);
                                    }}
                                    aria-label="Download generated image"
                                    className="flex h-11 w-11 items-center justify-center rounded-lg bg-black/70 text-white backdrop-blur transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {thinking && (
                    <div className="mb-2 text-sm border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
                        <button
                            onClick={() => setShowThinking(!showThinking)}
                            aria-expanded={showThinking}
                            className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 transition-colors hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                        >
                            <Brain className="w-3.5 h-3.5 text-phosphor-dim" />
                            <span className="font-mono text-xs font-medium uppercase tracking-wider text-zinc-300 group-hover:text-zinc-200">
                                Reasoning Process
                            </span>
                            {showThinking ? (
                                <ChevronDown className="w-3.5 h-3.5 ml-auto text-zinc-500" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5 ml-auto text-zinc-500" />
                            )}
                        </button>
                        {showThinking && (
                            <div className="px-4 pb-4 pt-2 border-t border-zinc-800/80 bg-[#0a0a0a]/50">
                                <div className="my-2 max-w-none whitespace-pre-wrap border-l-2 border-zinc-800 py-1 pl-4 font-serif text-[13px] italic leading-relaxed text-zinc-400">
                                    <ReactMarkdown
                                        remarkPlugins={REMARK_PLUGINS}
                                        components={{ img: SafeMarkdownImage, a: SafeMarkdownLink }}
                                    >
                                        {thinking}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {finalContent && (
                    <div className="prose-crt select-text w-full max-w-none">
                        <ReactMarkdown
                            remarkPlugins={REMARK_PLUGINS}
                            components={{
                                img: SafeMarkdownImage,
                                a: SafeMarkdownLink,
                                code: props => (
                                    <CodeBlock
                                        {...props}
                                        onRunCode={onRunCode}
                                        codeResults={codeResults}
                                        runningCode={runningCode}
                                        handleRunCode={handleRunCode}
                                    />
                                ),
                                table: props => (
                                    <div className="table-wrapper">
                                        <table {...props} />
                                    </div>
                                ),
                            }}
                        >
                            {finalContent}
                        </ReactMarkdown>
                    </div>
                )}
                {finalContent && <CitationEvidence citations={meta?.citations} />}
                {finalContent && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-900/80 pt-2 text-xs font-mono text-zinc-400">
                        {onBranch && (
                            <button
                                onClick={onBranch}
                                aria-label="Branch conversation from this message"
                                className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 py-2 transition-colors hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                title="Branch conversation from here"
                            >
                                <GitBranch className="h-3 w-3" />
                                Branch
                            </button>
                        )}
                        <button
                            onClick={handleCopyAnswerCard}
                            className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 py-2 transition-colors hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            title="Copy reproducible answer card"
                        >
                            {answerCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {answerCopied ? "Copied card" : "Copy card"}
                        </button>
                        <button
                            onClick={() => downloadText(`n0x-answer-${timestamp || Date.now()}.md`, answerCard)}
                            className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 py-2 transition-colors hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            title="Export this answer as Markdown"
                        >
                            <Download className="h-3 w-3" />
                            Export
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});
