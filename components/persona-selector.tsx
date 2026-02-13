"use client";

import React, { useState } from "react";
import { useSystemPrompt } from "@/lib/useSystemPrompt";
import { User, Plus, Trash2, Check, Edit2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function PersonaSelector({ compact }: { compact?: boolean }) {
    const { personas, activeId, selectPersona, addPersona, deletePersona, updatePersona } = useSystemPrompt();
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [prompt, setPrompt] = useState("");

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
                                "flex items-center gap-2 px-3 py-2 rounded text-xs font-mono transition-all cursor-pointer",
                                activeId === p.id
                                    ? "bg-phosphor-faint text-phosphor border border-phosphor-dim"
                                    : "text-txt-secondary hover:bg-crt-hover border border-transparent"
                            )}
                            onClick={() => selectPersona(p.id)}
                        >
                            <User className="w-3 h-3 shrink-0" />
                            <span className="flex-1">{p.name}</span>
                            {!p.builtin && (
                                <div className="flex gap-1">
                                    <button onClick={e => { e.stopPropagation(); startEdit(p.id); }} className="text-txt-tertiary hover:text-phosphor"><Edit2 className="w-3 h-3" /></button>
                                    <button onClick={e => { e.stopPropagation(); deletePersona(p.id); }} className="text-txt-tertiary hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
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
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border border-crt-border text-txt-tertiary hover:text-txt-secondary hover:border-txt-tertiary transition-all"
            >
                <User className="w-3 h-3" />
                {current?.name || "Default"}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-crt-surface border border-crt-border rounded z-50 overflow-hidden">
                        <div className="px-3 py-2 border-b border-crt-border text-[10px] text-txt-tertiary font-mono uppercase tracking-wider">
                            persona
                        </div>
                        <div className="max-h-48 overflow-y-auto no-scrollbar">
                            {personas.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => { selectPersona(p.id); setOpen(false); }}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-left transition-all",
                                        activeId === p.id ? "bg-phosphor-faint text-phosphor" : "text-txt-secondary hover:bg-crt-hover hover:text-phosphor"
                                    )}
                                >
                                    <User className="w-3 h-3 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate">{p.name}</div>
                                        <div className="text-[10px] text-txt-tertiary truncate">{p.prompt.slice(0, 50)}...</div>
                                    </div>
                                    {activeId === p.id && <Check className="w-3 h-3 text-phosphor shrink-0" />}
                                </button>
                            ))}
                        </div>
                        <div className="border-t border-crt-border p-2">
                            <button
                                onClick={() => { setCreating(true); setOpen(false); }}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono border border-crt-border text-txt-secondary hover:text-phosphor hover:border-phosphor-dim transition-all"
                            >
                                <Plus className="w-3 h-3" /> new persona
                            </button>
                        </div>
                    </div>
                </>
            )}

            {(creating || editId) && (
                <>
                    <div className="fixed inset-0 z-50 bg-black/50" onClick={closeModal} />
                    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 bg-crt-surface border border-crt-border rounded p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-mono text-phosphor">
                                {editId ? "edit persona" : "new persona"}
                            </h3>
                            <button onClick={closeModal} className="text-txt-tertiary hover:text-txt-primary">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <input
                            type="text" value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="name"
                            className="w-full bg-crt-black border border-crt-border rounded px-3 py-2 text-xs font-mono text-txt-primary placeholder:text-txt-tertiary outline-none focus:border-phosphor-dim"
                        />
                        <textarea
                            value={prompt} onChange={e => setPrompt(e.target.value)}
                            placeholder="system prompt..."
                            rows={4}
                            className="w-full bg-crt-black border border-crt-border rounded px-3 py-2 text-xs font-mono text-txt-primary placeholder:text-txt-tertiary outline-none focus:border-phosphor-dim resize-none"
                        />
                        <button
                            onClick={save} disabled={!canSave}
                            className="w-full px-3 py-2 rounded text-xs font-mono border border-phosphor-dim text-phosphor hover:bg-phosphor-faint transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            {editId ? "save" : "create"}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
