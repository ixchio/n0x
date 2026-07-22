"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { Share2, X, Copy, Check, ExternalLink, Camera, Download, FileText, FileJson } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShareMenuProps {
    messages?: Array<{ role: string; content: string }>;
    modelName?: string;
    appUrl?: string;
    label?: string;
}

const REPO = "https://github.com/ixchio/n0x";
const APP = "https://n0xth.vercel.app";
const TRUTH_COPY = "Local by default. Search, image and cloud paths are explicit.";

// platform-specific share hooks — different vibes for different audiences
function shareTexts(snippet: string, hasChat: boolean) {
    const base = hasChat ? `A conversation from N0X:\n\n${snippet}\n\n${TRUTH_COPY}\n\n` : "";

    return {
        x: hasChat
            ? `${base}${REPO}`
            : `N0X — an in-browser AI workstation for models, documents and code.\n\n${TRUTH_COPY}\n\n${REPO}`,

        linkedin: hasChat
            ? `I've been testing N0X, an open-source in-browser AI workstation.\n\n${TRUTH_COPY}\n\n${snippet}\n\nLocal features include WebGPU inference, document retrieval, and Python execution. Network paths are shown when selected.\n\n${REPO}`
            : `N0X is an open-source in-browser AI workstation for local inference, document retrieval, code execution, image generation, and web search.\n\n${TRUTH_COPY}\n\n${REPO}`,

        reddit: hasChat
            ? `N0X — in-browser AI workstation (local-first)\n\n${TRUTH_COPY}\n\n${snippet}\n\n${REPO}`
            : `N0X — in-browser AI workstation for LLMs, document retrieval, code, image generation, and search.\n\n${TRUTH_COPY}\n\n${REPO}`,

        hn: `N0X – browser-native AI workstation; local by default with explicit search, image and cloud paths`,
    };
}

// render conversation as a branded card image
async function renderCard(messages: Array<{ role: string; content: string }>, model: string): Promise<Blob | null> {
    const W = 800,
        PAD = 40,
        MSG_GAP = 16;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // pick last few messages (up to 4)
    const recent = messages.slice(-4);

    // measure text first to get height
    ctx.font = "14px 'IBM Plex Mono', monospace";
    const maxTextW = W - PAD * 2 - 40;

    function wrapText(text: string, maxW: number): string[] {
        const words = text.split(" ");
        const lines: string[] = [];
        let line = "";
        for (const w of words) {
            const test = line ? `${line} ${w}` : w;
            if (ctx!.measureText(test).width > maxW && line) {
                lines.push(line);
                line = w;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        return lines.length ? lines : [""];
    }

    // calc total height
    let totalH = PAD + 50; // header
    for (const msg of recent) {
        const content = msg.content.slice(0, 300) + (msg.content.length > 300 ? "..." : "");
        const lines = wrapText(content, maxTextW);
        totalH += lines.length * 20 + 28 + MSG_GAP;
    }
    totalH += 50; // footer
    totalH = Math.max(totalH, 300);

    canvas.width = W * 2; // 2x for retina
    canvas.height = totalH * 2;
    ctx.scale(2, 2);

    // bg
    const grad = ctx.createLinearGradient(0, 0, 0, totalH);
    grad.addColorStop(0, "#050510");
    grad.addColorStop(1, "#0a0a1a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, totalH);

    // subtle border
    ctx.strokeStyle = "#39ff1430";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, totalH - 1);

    // header
    ctx.fillStyle = "#39ff14";
    ctx.font = "bold 20px 'IBM Plex Mono', monospace";
    ctx.fillText(">_ N0X", PAD, PAD + 20);

    ctx.fillStyle = "#39ff1460";
    ctx.font = "11px 'IBM Plex Mono', monospace";
    const modelLabel = model || "local model";
    ctx.fillText(`· ${modelLabel}`, PAD + ctx.measureText(">_ N0X  ").width + 10, PAD + 20);

    // separator
    ctx.strokeStyle = "#39ff1420";
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + 35);
    ctx.lineTo(W - PAD, PAD + 35);
    ctx.stroke();

    // messages
    let y = PAD + 55;
    for (const msg of recent) {
        const isUser = msg.role === "user";
        const content = msg.content.slice(0, 300) + (msg.content.length > 300 ? "..." : "");
        const lines = wrapText(content, maxTextW);

        // role label
        ctx.fillStyle = isUser ? "#888" : "#39ff14";
        ctx.font = "bold 11px 'IBM Plex Mono', monospace";
        ctx.fillText(isUser ? "YOU" : "N0X", PAD + 12, y);
        y += 18;

        // message text
        ctx.fillStyle = isUser ? "#ccc" : "#e0e0e0";
        ctx.font = "13px 'IBM Plex Mono', monospace";
        for (const line of lines) {
            ctx.fillText(line, PAD + 12, y);
            y += 19;
        }
        y += MSG_GAP;
    }

    // footer
    ctx.fillStyle = "#39ff1440";
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillText("github.com/ixchio/n0x", PAD, totalH - PAD + 5);

    ctx.fillStyle = "#39ff1425";
    ctx.fillText(
        "local by default · explicit network paths",
        W - PAD - ctx.measureText("local by default · explicit network paths").width,
        totalH - PAD + 5
    );

    return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

export function ShareMenu({ messages = [], modelName, appUrl = REPO, label }: ShareMenuProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [cardStatus, setCardStatus] = useState<"idle" | "generating" | "done">("idle");
    const triggerRef = useRef<HTMLButtonElement>(null);
    const cardRef = useRef<Blob | null>(null);

    const hasChat = messages.length > 0;

    // last Q&A snippet for share text
    const snippet = (() => {
        if (!messages.length) return "";
        const user = [...messages].reverse().find(m => m.role === "user");
        const bot = [...messages].reverse().find(m => m.role === "assistant");
        let s = "";
        if (user) s += `> ${user.content.slice(0, 120)}`;
        if (bot) s += `\n${bot.content.slice(0, 120)}`;
        return s;
    })();

    const texts = shareTexts(snippet, hasChat);
    const enc = encodeURIComponent;

    const links = [
        {
            name: "X (Twitter)",
            icon: "𝕏",
            hover: "hover:text-white",
            href: `https://x.com/intent/tweet?text=${enc(texts.x)}`,
        },
        {
            name: "LinkedIn",
            icon: "in",
            hover: "hover:text-blue-400",
            href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(appUrl)}&summary=${enc(texts.linkedin)}`,
        },
        {
            name: "Reddit",
            icon: "r/",
            hover: "hover:text-orange-400",
            href: `https://reddit.com/submit?url=${enc(appUrl)}&title=${enc(texts.hn)}`,
        },
        {
            name: "Hacker News",
            icon: "Y",
            hover: "hover:text-orange-500",
            href: `https://news.ycombinator.com/submitlink?u=${enc(appUrl)}&t=${enc(texts.hn)}`,
        },
    ];

    const copyText = useCallback(async () => {
        const text = texts.x; // use the X version as default copy
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const el = document.createElement("textarea");
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [texts.x]);

    const genCard = useCallback(async () => {
        if (!hasChat || messages.length < 2) return;
        setCardStatus("generating");
        const blob = await renderCard(messages, modelName || "");
        if (blob) {
            cardRef.current = blob;
            setCardStatus("done");
            // auto-download
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `n0x-convo-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
            setTimeout(() => setCardStatus("idle"), 3000);
        } else {
            setCardStatus("idle");
        }
    }, [messages, modelName, hasChat]);

    const nativeShare = useCallback(async () => {
        if (!navigator.share) return;
        const shareData: ShareData = { title: "N0X", text: texts.x, url: appUrl };

        // if we have a card image, include it
        if (cardRef.current && navigator.canShare) {
            const file = new File([cardRef.current], "n0x-convo.png", { type: "image/png" });
            const withFile = { ...shareData, files: [file] };
            if (navigator.canShare(withFile)) {
                try {
                    await navigator.share(withFile);
                    return;
                } catch {
                    /* fall through */
                }
            }
        }
        try {
            await navigator.share(shareData);
        } catch {
            /* cancelled */
        }
    }, [texts.x, appUrl]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setOpen(false);
            requestAnimationFrame(() => triggerRef.current?.focus());
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open]);

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                onClick={() => setOpen(!open)}
                aria-label="Share or export conversation"
                aria-haspopup="dialog"
                aria-expanded={open}
                className={cn(
                    "flex h-11 items-center justify-center gap-2 rounded-md text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                    label ? "w-full justify-start px-3" : "w-11"
                )}
                title="Share"
            >
                <Share2 className="w-3.5 h-3.5" />
                {label && <span className="text-xs font-medium">{label}</span>}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
                    <div
                        role="dialog"
                        aria-label="Share and export conversation"
                        className="absolute right-0 top-full z-50 mt-2 max-h-[min(32rem,calc(100dvh-5rem))] w-64 overflow-y-auto rounded border border-crt-border bg-crt-surface shadow-lg shadow-black/50"
                    >
                        <div className="px-3 py-2 border-b border-crt-border flex items-center justify-between">
                            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">share n0x</span>
                            <button
                                onClick={() => setOpen(false)}
                                aria-label="Close share menu"
                                className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>

                        <div className="p-1">
                            {links.map(l => (
                                <a
                                    key={l.name}
                                    href={l.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setOpen(false)}
                                    className={cn(
                                        "flex min-h-11 items-center gap-3 rounded px-3 py-2 text-xs font-mono text-zinc-300 transition-all hover:bg-crt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                                        l.hover
                                    )}
                                >
                                    <span className="w-5 text-center font-bold text-[11px]">{l.icon}</span>
                                    <span>{l.name}</span>
                                    <ExternalLink className="w-3 h-3 ml-auto opacity-30" />
                                </a>
                            ))}

                            <div className="my-1 border-t border-crt-border" />

                            {/* Screenshot card — only when there's a conversation */}
                            {hasChat && messages.length >= 2 && (
                                <button
                                    onClick={genCard}
                                    disabled={cardStatus === "generating"}
                                    className="flex min-h-11 w-full items-center gap-3 rounded px-3 py-2 text-xs font-mono text-zinc-300 transition-all hover:bg-crt-hover hover:text-neon-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    {cardStatus === "generating" ? (
                                        <Camera className="w-3.5 h-3.5 ml-0.5 animate-pulse text-neon-cyan" />
                                    ) : cardStatus === "done" ? (
                                        <Check className="w-3.5 h-3.5 ml-0.5 text-phosphor" />
                                    ) : (
                                        <Camera className="w-3.5 h-3.5 ml-0.5" />
                                    )}
                                    <span>
                                        {cardStatus === "generating"
                                            ? "rendering..."
                                            : cardStatus === "done"
                                              ? "saved!"
                                              : "screenshot card"}
                                    </span>
                                    <Download className="w-3 h-3 ml-auto opacity-30" />
                                </button>
                            )}

                            {typeof navigator !== "undefined" && "share" in navigator && (
                                <button
                                    onClick={() => {
                                        nativeShare();
                                        setOpen(false);
                                    }}
                                    className="flex min-h-11 w-full items-center gap-3 rounded px-3 py-2 text-xs font-mono text-zinc-300 transition-all hover:bg-crt-hover hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    <Share2 className="w-3.5 h-3.5 ml-0.5" />
                                    <span>share via...</span>
                                </button>
                            )}

                            <button
                                onClick={copyText}
                                className="flex min-h-11 w-full items-center gap-3 rounded px-3 py-2 text-xs font-mono text-zinc-300 transition-all hover:bg-crt-hover hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                {copied ? (
                                    <Check className="w-3.5 h-3.5 ml-0.5 text-phosphor" />
                                ) : (
                                    <Copy className="w-3.5 h-3.5 ml-0.5" />
                                )}
                                <span>{copied ? "copied!" : "copy share text"}</span>
                            </button>

                            {/* Export section */}
                            {hasChat && messages.length >= 1 && (
                                <>
                                    <div className="my-1 border-t border-crt-border" />
                                    <button
                                        onClick={() => {
                                            const md = messages
                                                .map(m => `**${m.role === "user" ? "You" : "N0X"}:**\n${m.content}`)
                                                .join("\n\n---\n\n");
                                            const header = `# N0X Conversation\n*Model: ${modelName || "unknown"} · ${new Date().toLocaleDateString()}*\n\n---\n\n`;
                                            const blob = new Blob([header + md], { type: "text/markdown" });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement("a");
                                            a.href = url;
                                            a.download = `n0x-chat-${Date.now()}.md`;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                            setOpen(false);
                                        }}
                                        className="flex min-h-11 w-full items-center gap-3 rounded px-3 py-2 text-xs font-mono text-zinc-300 transition-all hover:bg-crt-hover hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                    >
                                        <FileText className="w-3.5 h-3.5 ml-0.5" />
                                        <span>export as Markdown</span>
                                        <Download className="w-3 h-3 ml-auto opacity-30" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            const data = {
                                                model: modelName,
                                                exportedAt: new Date().toISOString(),
                                                messages,
                                            };
                                            const blob = new Blob([JSON.stringify(data, null, 2)], {
                                                type: "application/json",
                                            });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement("a");
                                            a.href = url;
                                            a.download = `n0x-chat-${Date.now()}.json`;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                            setOpen(false);
                                        }}
                                        className="flex min-h-11 w-full items-center gap-3 rounded px-3 py-2 text-xs font-mono text-zinc-300 transition-all hover:bg-crt-hover hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                    >
                                        <FileJson className="w-3.5 h-3.5 ml-0.5" />
                                        <span>export as JSON</span>
                                        <Download className="w-3 h-3 ml-auto opacity-30" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
