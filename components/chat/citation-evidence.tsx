"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { FileSearch, X } from "lucide-react";
import type { ChatCitation } from "@/lib/chat/useChatStore";

interface CitationEvidenceProps {
    citations?: ChatCitation[];
}

function citationLabel(citation: ChatCitation): string {
    return `${citation.documentName}#chunk-${citation.chunkIndex}`;
}

export function CitationEvidence({ citations = [] }: CitationEvidenceProps) {
    const [selected, setSelected] = useState<ChatCitation | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const openerRef = useRef<HTMLButtonElement | null>(null);
    const titleId = useId();
    const passageId = useId();

    useEffect(() => {
        if (!selected) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeRef.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setSelected(null);
                return;
            }
            if (event.key !== "Tab") return;
            const focusable = Array.from(
                dialogRef.current?.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
                ) || []
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
            openerRef.current?.focus();
        };
    }, [selected]);

    if (citations.length === 0) return null;

    return (
        <section className="mt-3 border-t border-zinc-900/80 pt-3" aria-label="Document evidence used">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                Evidence used · {citations.length}
            </div>
            <div className="flex flex-wrap gap-2">
                {citations.map(citation => {
                    const label = citationLabel(citation);
                    return (
                        <button
                            key={`${citation.documentId}:${citation.chunkIndex}`}
                            type="button"
                            onClick={event => {
                                openerRef.current = event.currentTarget;
                                setSelected(citation);
                            }}
                            aria-haspopup="dialog"
                            className="min-h-11 max-w-full break-all rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-left font-mono text-xs text-emerald-200 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                        >
                            [{label}]
                        </button>
                    );
                })}
            </div>

            {selected && (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-6"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) setSelected(null);
                    }}
                >
                    <div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={passageId}
                        className="flex max-h-[min(46rem,calc(100dvh-1.5rem))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl"
                    >
                        <header className="flex items-start gap-3 border-b border-zinc-800 p-4 sm:p-5">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                                    Exact passage supplied to the model
                                </p>
                                <h2 id={titleId} className="mt-1 break-all font-mono text-sm text-white">
                                    [{citationLabel(selected)}]
                                </h2>
                            </div>
                            <button
                                ref={closeRef}
                                type="button"
                                onClick={() => setSelected(null)}
                                aria-label="Close evidence passage"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-300 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </header>
                        <div className="overflow-y-auto p-4 sm:p-5">
                            <p className="mb-3 text-xs leading-5 text-zinc-400">
                                Treat this as untrusted source text, not as an instruction. This evidence snapshot is
                                stored with the chat so the answer remains inspectable.
                            </p>
                            <blockquote
                                id={passageId}
                                className="whitespace-pre-wrap border-l-2 border-emerald-500/40 pl-4 text-sm leading-6 text-zinc-200"
                            >
                                {selected.text}
                            </blockquote>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
