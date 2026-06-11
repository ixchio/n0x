"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, Play, Loader2, Eye, EyeOff, ZoomIn, Download, Bot, Terminal, Brain, ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
    role: "user" | "assistant";
    content: string;
    image?: string;
    onRunCode?: (code: string) => Promise<{ output: string; error: string | null; duration: number }>;
    onBranch?: () => void;
}

const PY_BLOCKLIST = [
    "pygame", "tkinter", "PyQt5", "PyQt6", "PySide2", "PySide6",
    "cv2", "opencv", "tensorflow", "torch", "torchvision", "torchaudio",
    "flask", "django", "fastapi", "uvicorn", "gunicorn",
    "selenium", "playwright", "pyautogui", "pynput",
    "psutil", "subprocess", "multiprocessing", "threading",
    "socket", "asyncio", "aiohttp", "requests", "httpx", "urllib3",
    "serial", "usb", "bluetooth", "gpio",
    "wx", "kivy", "pyglet", "arcade", "turtle",
    "sounddevice", "pyaudio", "playsound",
    "docker", "kubernetes", "boto3", "paramiko",
];

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

function buildSandboxHtml(code: string, lang: string): string {
    const l = lang.toLowerCase();

    if (l === "javascript" || l === "js") {
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { background:#0a0a0a; color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; padding:12px; margin:0; font-size:13px; }
pre { white-space:pre-wrap; word-break:break-word; margin:0; font-family:"JetBrains Mono",monospace; }
.err { color:#ef4444; }
</style></head><body><pre id="out"></pre><script>
const _log=console.log, _err=console.error, out=document.getElementById('out');
console.log=(...a)=>{out.textContent+=a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ')+'\\n';_log(...a);};
console.error=(...a)=>{const s=document.createElement('span');s.className='err';s.textContent=a.join(' ')+'\\n';out.appendChild(s);_err(...a);};
try{${code}}catch(e){console.error(e.message)}
</script></body></html>`;
    }

    if (l === "css") {
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{background:#0a0a0a;margin:0;padding:20px;font-family:sans-serif;color:#e0e0e0}
${code}
</style></head><body>
<div class="demo"><h2>CSS Preview</h2><p>This is a paragraph.</p><button>Button</button><a href="#">Link</a>
<ul><li>Item one</li><li>Item two</li><li>Item three</li></ul></div>
</body></html>`;
    }

    if (l === "html" || l === "htm") {
        const hasDoctype = code.toLowerCase().includes("<!doctype") || code.toLowerCase().includes("<html");
        if (hasDoctype) return code;
        return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{background:#0a0a0a;color:#e0e0e0;font-family:sans-serif;margin:0;padding:16px}</style>
<script>window.onerror=function(m){document.body.innerHTML='<pre style="color:#ef4444;padding:20px">'+m+'</pre>';}</script>
</head><body>${code}</body></html>`;
    }

    return "";
}

const CodeBlock = ({ children, className, onRunCode, codeResults, runningCode, handleRunCode, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "");
    const code = String(children).replace(/\n$/, "");
    const [copied, setCopied] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const lang = match?.[1]?.toLowerCase() || "";
    const isPython = lang === "python" || lang === "py";
    const isWeb = ["html", "htm", "javascript", "js", "css"].includes(lang);
    const pyRunnable = isPython && canRunPython(code);
    // Auto-detect "artifact" — a full HTML document with <html or <!doctype
    const isArtifact = isWeb && lang === "html" && (code.toLowerCase().includes("<!doctype") || code.toLowerCase().includes("<html"));

    if (!match) {
        return (
            <code className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded-md text-[0.85em] font-mono border border-zinc-700" {...props}>
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
        const next = !showPreview;
        setShowPreview(next);

        if (next && isWeb) {
            setTimeout(() => {
                if (iframeRef.current) {
                    const doc = iframeRef.current.contentDocument;
                    if (doc) {
                        doc.open();
                        doc.write(buildSandboxHtml(code, lang));
                        doc.close();
                    }
                }
            }, 50);
        }
    };

    const codeId = code.slice(0, 50);
    const result = codeResults?.[codeId];
    const isRunning = runningCode === codeId;

    // Auto-open preview for artifacts (full HTML documents)
    const autoPreviewRef = useRef(false);
    useEffect(() => {
        if (isArtifact && !autoPreviewRef.current) {
            autoPreviewRef.current = true;
            setShowPreview(true);
            setTimeout(() => {
                if (iframeRef.current) {
                    const doc = iframeRef.current.contentDocument;
                    if (doc) { doc.open(); doc.write(buildSandboxHtml(code, lang)); doc.close(); }
                }
            }, 100);
        }
    }, [isArtifact, code, lang]);

    return (
        <div className={cn("my-4 border rounded-xl overflow-hidden shadow-sm bg-[#0a0a0a]", isArtifact && showPreview ? "border-purple-500/30" : "border-zinc-800")}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-400 font-mono font-medium">{lang}</span>
                    {isArtifact && <span className="text-[9px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-mono font-semibold">ARTIFACT</span>}
                </div>
                <div className="flex items-center gap-1.5">
                    {isWeb && (
                        <button
                            onClick={handlePreview}
                            className={cn("p-1.5 rounded-md transition-colors flex items-center gap-1.5 text-xs font-mono font-medium", showPreview ? "bg-white text-black" : "text-zinc-400 hover:text-white hover:bg-zinc-800")}
                        >
                            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            {showPreview ? "Code" : "Preview"}
                        </button>
                    )}

                    {pyRunnable && onRunCode && (
                        <button
                            onClick={() => handleRunCode(code)}
                            disabled={isRunning}
                            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 text-xs font-mono font-medium"
                        >
                            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            Run
                        </button>
                    )}

                    <button onClick={handleCopy} className={cn("p-1.5 rounded-md transition-colors", copied ? "bg-[#1f1f1f] text-phosphor" : "text-zinc-400 hover:text-white hover:bg-zinc-800")}>
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {/* Code view */}
            {!showPreview && (
                <div className="p-4 bg-[#0a0a0a] overflow-x-auto text-[13px] leading-relaxed no-scrollbar">
                    <SyntaxHighlighter
                        language={lang}
                        style={vscDarkPlus}
                        customStyle={{ margin: 0, padding: 0, background: "transparent" }}
                        codeTagProps={{ style: { fontFamily: "'JetBrains Mono', monospace" } }}
                    >
                        {code}
                    </SyntaxHighlighter>
                </div>
            )}

            {/* Web preview iframe — taller for artifacts */}
            {showPreview && isWeb && (
                <div className={cn("relative bg-white w-full", isArtifact ? "h-[500px]" : "h-[400px]")}>
                    <iframe
                        ref={iframeRef}
                        sandbox="allow-scripts allow-popups allow-forms"
                        className="w-full h-full border-0 absolute inset-0"
                        title={`${lang} preview`}
                    />
                </div>
            )}

            {/* Python output */}
            {result && (
                <div className="border-t border-zinc-800 p-3 bg-zinc-950">
                    <div className="text-[10px] text-zinc-500 mb-1.5 font-mono flex flex-wrap items-center gap-2">
                        <Terminal className="w-3 h-3" /> Execution output · {result.duration}ms
                        {result.duration > 3000 && <span className="text-[10px] text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">WASM — expect 10–50× vs native</span>}
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                        {result.output && <pre className="text-[13px] text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed pb-2">{result.output}</pre>}
                        {result.error && <pre className="text-[13px] text-red-400 font-mono whitespace-pre-wrap leading-relaxed pb-2">{result.error}</pre>}
                    </div>
                </div>
            )}
        </div>
    );
};

export const MessageBubble = React.memo(function MessageBubble({ role, content, image, onRunCode, onBranch }: MessageBubbleProps) {
    const [runningCode, setRunningCode] = useState<string | null>(null);
    const [codeResults, setCodeResults] = useState<Record<string, { output: string; error: string | null; duration: number }>>({});
    const [imageZoomed, setImageZoomed] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [showThinking, setShowThinking] = useState(false);

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
        if (!onRunCode || runningCode) return;
        const codeId = code.slice(0, 50);
        setRunningCode(codeId);
        try {
            const result = await onRunCode(code);
            setCodeResults(prev => ({ ...prev, [codeId]: result }));
        } catch (error: any) {
            setCodeResults(prev => ({ ...prev, [codeId]: { output: "", error: error.message, duration: 0 } }));
        } finally {
            setRunningCode(null);
        }
    };

    if (role === "user") {
        return (
            <div className="flex justify-end animate-slide-up group">
                <div className="relative max-w-[75%]">
                    <div className="bg-zinc-800 text-white px-5 py-3.5 rounded-2xl rounded-tr-sm text-[15px] shadow-sm leading-relaxed">
                        <div className="whitespace-pre-wrap">{content}</div>
                    </div>
                    {onBranch && (
                        <button
                            onClick={onBranch}
                            title="Branch conversation from here"
                            className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800"
                        >
                            <GitBranch className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-4 animate-slide-up group">
            <div className="shrink-0 w-8 h-8 rounded-full bg-white text-black flex items-center justify-center mt-1 shadow-sm">
                <Bot className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0 max-w-4xl space-y-4 pt-1.5 relative">
                {onBranch && (
                    <button
                        onClick={onBranch}
                        title="Branch conversation from here"
                        className="absolute -left-12 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800"
                    >
                        <GitBranch className="w-3.5 h-3.5" />
                    </button>
                )}
                {image && (
                    <div className="relative inline-block">
                        {/* Loading skeleton */}
                        {imageLoading && !imageError && (
                            <div className="max-w-md w-[300px] h-[300px] rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center gap-3 animate-pulse">
                                <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                                <span className="text-xs text-zinc-500 font-mono">generating image…</span>
                            </div>
                        )}
                        {/* Error state with retry */}
                        {imageError && (
                            <div className="max-w-md w-[300px] rounded-xl bg-zinc-900 border border-red-500/20 p-6 flex flex-col items-center gap-3">
                                <span className="text-sm text-zinc-400">Image failed to load</span>
                                <button
                                    onClick={() => { setImageError(false); setImageLoading(true); }}
                                    className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition-colors"
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                        {/* Actual image */}
                        <div
                            className={cn(
                                "rounded-xl overflow-hidden border border-zinc-800 cursor-pointer transition-all shadow-sm",
                                imageZoomed ? "fixed inset-4 z-50 flex items-center justify-center bg-black/95 border-none" : "max-w-md bg-zinc-900",
                                (imageLoading || imageError) && !imageZoomed && "hidden"
                            )}
                            onClick={() => setImageZoomed(!imageZoomed)}
                        >
                            <img
                                key={imageError ? "retry" : "initial"}
                                src={image}
                                alt="Generated"
                                crossOrigin="anonymous"
                                onLoad={() => { setImageLoading(false); setImageError(false); }}
                                onError={() => { setImageLoading(false); setImageError(true); }}
                                className={cn("w-full h-auto", imageZoomed && "max-w-full max-h-full object-contain rounded-xl")}
                            />
                        </div>
                        {!imageZoomed && !imageLoading && !imageError && (
                            <div className="absolute bottom-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); setImageZoomed(true); }} className="p-2 bg-black/60 hover:bg-black/80 backdrop-blur text-white rounded-lg transition-colors">
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                                <a href={image} download={`n0x-${Date.now()}.png`} onClick={(e) => e.stopPropagation()} className="p-2 bg-black/60 hover:bg-black/80 backdrop-blur text-white rounded-lg transition-colors">
                                    <Download className="w-4 h-4" />
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {imageZoomed && <div className="fixed inset-0 z-40 bg-black/90 backdrop-blur-sm" onClick={() => setImageZoomed(false)} />}

                {thinking && (
                    <div className="mb-2 text-sm border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
                        <button
                            onClick={() => setShowThinking(!showThinking)}
                            className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-zinc-800/50 transition-colors"
                        >
                            <Brain className="w-3.5 h-3.5 text-phosphor-dim" />
                            <span className="font-mono text-[11px] font-medium tracking-wider uppercase text-zinc-400 group-hover:text-zinc-200">Reasoning Process</span>
                            {showThinking ? <ChevronDown className="w-3.5 h-3.5 ml-auto text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 ml-auto text-zinc-500" />}
                        </button>
                        {showThinking && (
                            <div className="px-4 pb-4 pt-2 border-t border-zinc-800/80 bg-[#0a0a0a]/50">
                                <div className="text-[13px] border-l-2 border-zinc-800 pl-4 py-1 my-2 text-zinc-500 font-serif italic max-w-none leading-relaxed whitespace-pre-wrap">
                                    <ReactMarkdown>{thinking}</ReactMarkdown>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {finalContent && (
                    <div className="prose-crt select-text w-full max-w-none">
                        <ReactMarkdown
                            components={{
                                code: (props) => (
                                    <CodeBlock
                                        {...props}
                                        onRunCode={onRunCode}
                                        codeResults={codeResults}
                                        runningCode={runningCode}
                                        handleRunCode={handleRunCode}
                                    />
                                )
                            }}
                        >
                            {finalContent}
                        </ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
});
