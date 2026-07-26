"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useSystemPrompt } from "@/lib/chat/useSystemPrompt";
import { User, Plus, Trash2, Check, Edit2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function PersonaSelector({
    compact,
    menuPlacement = "bottom",
    menuAlign = "left",
}: {
    compact?: boolean;
    menuPlacement?: "top" | "bottom";
    menuAlign?: "left" | "right";
}) {
    const { personas, activeId, selectPersona, addPersona, deletePersona, updatePersona } = useSystemPrompt();
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [prompt, setPrompt] = useState("");
    const triggerRef = useRef<HTMLButtonElement>(null);
    const modalCloseRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const dialogTitleId = useId();

    const current = personas.find(p => p.id === activeId);
    const canSave = name.trim() && prompt.trim();

    const save = () => {
        if (!canSave) return;
        if (editId) {
            updatePersona(editId, name.trim(), prompt.trim());
        } else {
            addPersona(name.trim(), prompt.trim());
        }
        closeModal();
    };

    const startEdit = (id: string) => {
        const p = personas.find(x => x.id === id);
        if (!p) return;
        setEditId(id);
        setName(p.name);
        setPrompt(p.prompt);
    };

    const closeModal = () => {
        setCreating(false);
        setEditId(null);
        setName("");
        setPrompt("");
        requestAnimationFrame(() => triggerRef.current?.focus());
    };

    useEffect(() => {
        if (!open && !creating && !editId) return;

        if (creating || editId) modalCloseRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (creating || editId) closeModal();
            setOpen(false);
            requestAnimationFrame(() => triggerRef.current?.focus());
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [creating, editId, open]);

    const trapDialogFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Tab" || !dialogRef.current) return;
        const focusable = Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
            )
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    if (!compact) {
        // full panel — used in settings if we ever add one
        return (
            <div className="space-y-3">
                <h3 className="text-xs font-mono text-phosphor">System Persona</h3>
                <div className="space-y-1">
                    {personas.map(p => (
                        <div
                            key={p.id}
                            className={cn(
                                "flex min-h-11 items-center rounded text-xs font-mono transition-all",
                                activeId === p.id
                                    ? "bg-phosphor-faint text-phosphor border border-phosphor-dim"
                                    : "text-txt-secondary hover:bg-crt-hover border border-transparent"
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => selectPersona(p.id)}
                                aria-pressed={activeId === p.id}
                                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <User className="h-3 w-3 shrink-0" />
                                <span className="flex-1">{p.name}</span>
                            </button>
                            {!p.builtin && (
                                <div className="flex gap-1">
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            startEdit(p.id);
                                        }}
                                        aria-label={`Edit persona: ${p.name}`}
                                        className="flex h-11 w-11 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                    >
                                        <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            deletePersona(p.id);
                                        }}
                                        aria-label={`Delete persona: ${p.name}`}
                                        className="flex h-11 w-11 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                onClick={() => setOpen(!open)}
                aria-label={`Choose persona. Current persona: ${current?.name || "Default"}`}
                aria-expanded={open}
                className="flex min-h-11 items-center gap-1.5 rounded border border-crt-border px-2.5 py-1 text-xs font-mono text-zinc-300 transition-all hover:border-zinc-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
                <User className="w-3 h-3" />
                {current?.name || "Default"}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
                    <div
                        role="region"
                        data-chat-popover="true"
                        aria-label="Personas"
                        className={cn(
                            "absolute z-50 w-64 overflow-hidden rounded border border-crt-border bg-crt-surface",
                            menuAlign === "left" ? "left-0" : "right-0",
                            menuPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2"
                        )}
                    >
                        <div className="border-b border-crt-border px-3 py-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
                            persona
                        </div>
                        <div className="max-h-48 overflow-y-auto no-scrollbar">
                            {personas.map(p => (
                                <button
                                    key={p.id}
                                    aria-pressed={activeId === p.id}
                                    onClick={() => {
                                        selectPersona(p.id);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs font-mono transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white",
                                        activeId === p.id
                                            ? "bg-phosphor-faint text-phosphor"
                                            : "text-txt-secondary hover:bg-crt-hover hover:text-phosphor"
                                    )}
                                >
                                    <User className="w-3 h-3 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate">{p.name}</div>
                                        <div className="truncate text-xs text-zinc-400">{p.prompt.slice(0, 50)}...</div>
                                    </div>
                                    {activeId === p.id && <Check className="w-3 h-3 text-phosphor shrink-0" />}
                                </button>
                            ))}
                        </div>
                        <div className="border-t border-crt-border p-2">
                            <button
                                onClick={() => {
                                    setCreating(true);
                                    setOpen(false);
                                }}
                                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded border border-crt-border px-3 py-1.5 text-xs font-mono text-zinc-300 transition-all hover:border-phosphor-dim hover:text-phosphor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <Plus className="w-3 h-3" /> new persona
                            </button>
                        </div>
                    </div>
                </>
            )}

            {(creating || editId) && (
                <>
                    <div className="fixed inset-0 z-50 bg-black/50" onClick={closeModal} aria-hidden="true" />
                    <div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={dialogTitleId}
                        className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 space-y-3 overflow-y-auto rounded border border-crt-border bg-crt-surface p-4"
                        onKeyDown={trapDialogFocus}
                    >
                        <div className="flex items-center justify-between">
                            <h3 id={dialogTitleId} className="text-xs font-mono text-phosphor">
                                {editId ? "edit persona" : "new persona"}
                            </h3>
                            <button
                                ref={modalCloseRef}
                                onClick={closeModal}
                                aria-label="Close persona editor"
                                className="flex h-11 w-11 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <label className="block space-y-1 text-xs font-mono text-zinc-300">
                            <span>Name</span>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Persona name"
                                className="min-h-11 w-full rounded border border-crt-border bg-crt-black px-3 py-2 text-xs font-mono text-txt-primary outline-none placeholder:text-zinc-500 focus:border-phosphor-dim focus-visible:ring-2 focus-visible:ring-white"
                            />
                        </label>
                        <label className="block space-y-1 text-xs font-mono text-zinc-300">
                            <span>System prompt</span>
                            <textarea
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                placeholder="Describe how this persona should respond"
                                rows={4}
                                className="w-full resize-none rounded border border-crt-border bg-crt-black px-3 py-2 text-xs font-mono text-txt-primary outline-none placeholder:text-zinc-500 focus:border-phosphor-dim focus-visible:ring-2 focus-visible:ring-white"
                            />
                        </label>
                        <button
                            onClick={save}
                            disabled={!canSave}
                            className="min-h-11 w-full rounded border border-phosphor-dim px-3 py-2 text-xs font-mono text-phosphor transition-all hover:bg-phosphor-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            {editId ? "save" : "create"}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
