"use client";

import React, { useState, useCallback, useRef } from "react";
import { Share2, X, Copy, Check, ExternalLink, Camera, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShareMenuProps {
    messages?: Array<{ role: string; content: string }>;
    modelName?: string;
    appUrl?: string;
}

const REPO = "https://github.com/ixchio/n0x";
const APP = "https://n0x.vercel.app";

// platform-specific share hooks — different vibes for different audiences
function shareTexts(snippet: string, hasChat: boolean) {
    const base = hasChat
        ? `just had this conversation with an AI running 100% in my browser — no server, no API key, no account.\n\n${snippet}\n\n`
        : "";

    return {
        x: hasChat
            ? `${base}built with WebGPU. runs offline after first visit.\n\n${REPO}`
            : `N0X — LLM inference, RAG, code exec, image gen, deep search. all running locally in one browser tab via WebGPU.\n\nno server. no API key. works offline.\n\n${REPO}`,

        linkedin: hasChat
            ? `I've been testing N0X — an open-source project that runs the full AI stack directly in the browser using WebGPU.\n\nNo backend server. No API keys. No data leaves your machine.\n\n${snippet}\n\nThe stack includes: local LLM inference, retrieval-augmented generation, Python execution, image generation, and deep web search. All client-side.\n\n${REPO}`
            : `N0X is an open-source project that puts the full AI stack in one browser tab — LLM inference, RAG, code execution, image generation, and web search. All running locally via WebGPU.\n\nNo server. No API keys. No data transmitted. Works offline after first visit.\n\nWorth checking out if you're interested in local-first AI.\n\n${REPO}`,

        reddit: hasChat
            ? `N0X — full AI stack in one browser tab (WebGPU, local-first)\n\nJust tested this — runs LLMs, RAG, Python sandbox, image gen, deep search all locally in the browser. No backend required.\n\n${snippet}\n\n${REPO}`
            : `N0X — full AI stack in one browser tab. LLMs, RAG, code exec, image gen, search. All local via WebGPU. No server, no API keys.\n\n${REPO}`,

        hn: `N0X – browser-native AI stack (WebGPU): LLM inference, RAG, Python sandbox, image gen, deep search – all local, zero backend`,
    };
}

// render conversation as a branded card image
async function renderCard(
    messages: Array<{ role: string; content: string }>,
    model: string
): Promise<Blob | null> {
    const W = 800, PAD = 40, MSG_GAP = 16;
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
    ctx.fillText(`· ${modelLabel} · in-browser`, PAD + ctx.measureText(">_ N0X  ").width + 10, PAD + 20);

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
    ctx.fillText("the full AI stack, in one browser tab", W - PAD - ctx.measureText("the full AI stack, in one browser tab").width, totalH - PAD + 5);

    return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

export function ShareMenu({ messages = [], modelName, appUrl = REPO }: ShareMenuProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [cardStatus, setCardStatus] = useState<"idle" | "generating" | "done">("idle");
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
            name: "X (Twitter)", icon: "𝕏", hover: "hover:text-white",
            href: `https://x.com/intent/tweet?text=${enc(texts.x)}`,
        },
        {
            name: "LinkedIn", icon: "in", hover: "hover:text-blue-400",
            href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(appUrl)}&summary=${enc(texts.linkedin)}`,
        },
        {
            name: "Reddit", icon: "r/", hover: "hover:text-orange-400",
            href: `https://reddit.com/submit?url=${enc(appUrl)}&title=${enc(texts.hn)}`,
        },
        {
            name: "Hacker News", icon: "Y", hover: "hover:text-orange-500",
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
                try { await navigator.share(withFile); return; } catch { /* fall through */ }
            }
        }
        try { await navigator.share(shareData); } catch { /* cancelled */ }
    }, [texts.x, appUrl]);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 p-1 rounded text-txt-tertiary hover:text-phosphor transition-colors"
                title="Share"
            >
                <Share2 className="w-3.5 h-3.5" />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute top-full right-0 mt-2 w-64 bg-crt-surface border border-crt-border rounded z-50 overflow-hidden shadow-lg shadow-black/50">
                        <div className="px-3 py-2 border-b border-crt-border flex items-center justify-between">
                            <span className="text-[10px] text-txt-tertiary font-mono uppercase tracking-wider">share n0x</span>
                            <button onClick={() => setOpen(false)} className="text-txt-tertiary hover:text-txt-primary">
                                <X className="w-3 h-3" />
                            </button>
                        </div>

                        <div className="p-1">
                            {links.map(l => (
                                <a
                                    key={l.name} href={l.href}
                                    target="_blank" rel="noopener noreferrer"
                                    onClick={() => setOpen(false)}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2 rounded text-xs font-mono text-txt-secondary transition-all hover:bg-crt-hover",
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
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-mono text-txt-secondary hover:bg-crt-hover hover:text-neon-cyan transition-all"
                                >
                                    {cardStatus === "generating" ? (
                                        <Camera className="w-3.5 h-3.5 ml-0.5 animate-pulse text-neon-cyan" />
                                    ) : cardStatus === "done" ? (
                                        <Check className="w-3.5 h-3.5 ml-0.5 text-phosphor" />
                                    ) : (
                                        <Camera className="w-3.5 h-3.5 ml-0.5" />
                                    )}
                                    <span>
                                        {cardStatus === "generating" ? "rendering..." : cardStatus === "done" ? "saved!" : "screenshot card"}
                                    </span>
                                    <Download className="w-3 h-3 ml-auto opacity-30" />
                                </button>
                            )}

                            {typeof navigator !== "undefined" && "share" in navigator && (
                                <button
                                    onClick={() => { nativeShare(); setOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-mono text-txt-secondary hover:bg-crt-hover hover:text-phosphor transition-all"
                                >
                                    <Share2 className="w-3.5 h-3.5 ml-0.5" />
                                    <span>share via...</span>
                                </button>
                            )}

                            <button
                                onClick={copyText}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-mono text-txt-secondary hover:bg-crt-hover hover:text-phosphor transition-all"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 ml-0.5 text-phosphor" /> : <Copy className="w-3.5 h-3.5 ml-0.5" />}
                                <span>{copied ? "copied!" : "copy share text"}</span>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
