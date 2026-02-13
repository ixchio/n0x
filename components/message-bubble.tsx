"use client";

import React, { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, Play, Loader2, Eye, EyeOff, ZoomIn, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
    role: "user" | "assistant";
    content: string;
    image?: string;
    onRunCode?: (code: string) => Promise<{ output: string; error: string | null; duration: number }>;
}

// packages that won't work in pyodide — native deps, GUI, networking servers
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

// pull imports from python code, return true if all are pyodide-safe
function canRunPython(code: string): boolean {
    const importRe = /(?:^|\n)\s*(?:import|from)\s+([\w.]+)/g;
    let m;
    const modules: string[] = [];
    while ((m = importRe.exec(code)) !== null) {
        modules.push(m[1].split(".")[0]);
    }
    // no imports = pure python, always runnable
    if (modules.length === 0) return true;
    return !modules.some(mod => PY_BLOCKLIST.includes(mod));
}

// Build HTML for sandboxed iframe execution
function buildSandboxHtml(code: string, lang: string): string {
    const l = lang.toLowerCase();

    if (l === "javascript" || l === "js") {
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { background:#0a0a0a; color:#39ff14; font-family:'IBM Plex Mono',monospace; padding:12px; margin:0; font-size:13px; }
pre { white-space:pre-wrap; word-break:break-word; margin:0; }
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

// Code block component
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

    // Inline code
    if (!match) {
        return (
            <code className="bg-phosphor-faint text-phosphor px-1.5 py-0.5 text-[0.85em] font-mono border border-crt-border" {...props}>
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

        if (next && isWeb && iframeRef.current) {
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

    return (
        <div className="my-3 border border-crt-border rounded overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-crt-surface border-b border-crt-border">
                <span className="text-[10px] text-phosphor-dim font-mono">{lang}</span>
                <div className="flex items-center gap-1">
                    {/* Preview toggle (web languages) */}
                    {isWeb && (
                        <button
                            onClick={handlePreview}
                            className={cn("p-1 transition-colors", showPreview ? "text-neon-cyan" : "text-txt-tertiary hover:text-neon-cyan")}
                            title={showPreview ? "Show code" : "Preview"}
                        >
                            {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                    )}

                    {/* Run python — only if imports are sandbox-safe */}
                    {pyRunnable && onRunCode && (
                        <button
                            onClick={() => handleRunCode(code)}
                            disabled={isRunning}
                            className="p-1 text-txt-tertiary hover:text-phosphor transition-colors"
                            title="Run Python"
                        >
                            {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        </button>
                    )}

                    {/* Run web (when no onRunCode needed) */}
                    {isWeb && !showPreview && (
                        <button
                            onClick={handlePreview}
                            className="p-1 text-txt-tertiary hover:text-phosphor transition-colors"
                            title={`Run ${lang}`}
                        >
                            <Play className="w-3 h-3" />
                        </button>
                    )}

                    <button onClick={handleCopy} className="p-1 text-txt-tertiary hover:text-phosphor transition-colors">
                        {copied ? <Check className="w-3 h-3 text-phosphor" /> : <Copy className="w-3 h-3" />}
                    </button>
                </div>
            </div>

            {/* Code view */}
            {!showPreview && (
                <SyntaxHighlighter
                    language={lang}
                    style={vscDarkPlus}
                    customStyle={{
                        margin: 0,
                        padding: "0.75rem 1rem",
                        background: "#030303",
                        fontSize: "0.8rem",
                        fontFamily: "'IBM Plex Mono', monospace",
                        borderRadius: 0,
                    }}
                    codeTagProps={{ style: { fontFamily: "'IBM Plex Mono', monospace" } }}
                >
                    {code}
                </SyntaxHighlighter>
            )}

            {/* Web preview iframe */}
            {showPreview && isWeb && (
                <div className="relative">
                    <iframe
                        ref={iframeRef}
                        sandbox="allow-scripts"
                        className="w-full h-72 border-0 bg-[#0a0a0a]"
                        title={`${lang} preview`}
                    />
                </div>
            )}

            {/* Python output */}
            {result && (
                <div className="border-t border-crt-border p-3 bg-crt-black">
                    <div className="text-[10px] text-txt-tertiary mb-1 font-mono">
                        output · {result.duration}ms
                    </div>
                    {result.output && (
                        <pre className="text-xs text-phosphor font-mono whitespace-pre-wrap">{result.output}</pre>
                    )}
                    {result.error && (
                        <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap">{result.error}</pre>
                    )}
                </div>
            )}
        </div>
    );
};

// Main component
export const MessageBubble = React.memo(function MessageBubble({ role, content, image, onRunCode }: MessageBubbleProps) {
    const [runningCode, setRunningCode] = useState<string | null>(null);
    const [codeResults, setCodeResults] = useState<Record<string, { output: string; error: string | null; duration: number }>>({});
    const [imageZoomed, setImageZoomed] = useState(false);

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

    // USER
    if (role === "user") {
        return (
            <div className="flex justify-end animate-fade-in">
                <div className="max-w-[80%] bg-crt-surface border border-crt-border text-txt-primary px-4 py-2.5 rounded text-sm">
                    <div className="whitespace-pre-wrap font-mono">{content}</div>
                </div>
            </div>
        );
    }

    // ASSISTANT
    return (
        <div className="flex gap-3 animate-fade-in">
            <div className="shrink-0 w-2 h-2 rounded-full bg-phosphor mt-2 shadow-glow-sm" />

            <div className="flex-1 min-w-0 space-y-3">
                {/* Image */}
                {image && (
                    <div className="relative group">
                        <div
                            className={cn(
                                "rounded overflow-hidden border border-crt-border cursor-pointer transition-all",
                                imageZoomed ? "fixed inset-4 z-50 flex items-center justify-center bg-black/95" : "max-w-md"
                            )}
                            onClick={() => setImageZoomed(!imageZoomed)}
                        >
                            <img
                                src={image}
                                alt="Generated"
                                className={cn("w-full h-auto", imageZoomed && "max-w-full max-h-full object-contain")}
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = "none";
                                    target.parentElement!.innerHTML = '<div class="p-6 text-center text-txt-tertiary text-xs">image failed to load</div>';
                                }}
                            />
                        </div>
                        {!imageZoomed && (
                            <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); setImageZoomed(true); }} className="p-1.5 bg-black/80 text-phosphor rounded">
                                    <ZoomIn className="w-3 h-3" />
                                </button>
                                <a href={image} download={`n0x-${Date.now()}.webp`} onClick={(e) => e.stopPropagation()} className="p-1.5 bg-black/80 text-phosphor rounded">
                                    <Download className="w-3 h-3" />
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {imageZoomed && <div className="fixed inset-0 z-40 bg-black/90" onClick={() => setImageZoomed(false)} />}

                {/* Markdown content */}
                <div className="prose-crt select-text">
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
                        {content}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    );
});
