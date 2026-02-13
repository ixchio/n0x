"use client";

import { useState, useCallback, useEffect } from "react";

interface Persona {
    id: string;
    name: string;
    prompt: string;
    builtin?: boolean;
}

const PRESETS: Persona[] = [
    {
        id: "default", name: "Default", builtin: true,
        prompt: "You are a helpful AI assistant. Be direct and concise.",
    },
    {
        id: "coder", name: "Senior Engineer", builtin: true,
        prompt: "You are a senior software engineer. Write clean, production-ready code. Use best practices. Explain trade-offs when relevant. Prefer simple solutions over clever ones.",
    },
    {
        id: "writer", name: "Writer", builtin: true,
        prompt: "You are a skilled writer. Write clearly and engagingly. Vary sentence length. Avoid jargon unless the context demands it. Be concise — every word should earn its place.",
    },
    {
        id: "tutor", name: "Tutor", builtin: true,
        prompt: "You are a patient, encouraging tutor. Explain concepts step by step. Use analogies and examples. Check understanding before moving on. Never make the user feel bad for not knowing something.",
    },
    {
        id: "analyst", name: "Analyst", builtin: true,
        prompt: "You are a sharp analytical thinker. Break down problems into components. Consider multiple perspectives. Use data and evidence. Be direct about uncertainty.",
    },
];

const PERSONAS_KEY = "n0x_personas";
const ACTIVE_KEY = "n0x_active_persona";

function loadAll(): Persona[] {
    if (typeof window === "undefined") return PRESETS;
    try {
        const raw = localStorage.getItem(PERSONAS_KEY);
        return [...PRESETS, ...(raw ? JSON.parse(raw) : [])];
    } catch {
        return PRESETS;
    }
}

function saveCustom(all: Persona[]) {
    localStorage.setItem(PERSONAS_KEY, JSON.stringify(all.filter(p => !p.builtin)));
}

export function useSystemPrompt() {
    const [personas, setPersonas] = useState<Persona[]>(PRESETS);
    const [activeId, setActiveId] = useState("default");
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        setPersonas(loadAll());
        const saved = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
        setActiveId(saved || "default");
        setIsLoaded(true);
    }, []);

    const activePersona = personas.find(p => p.id === activeId) || personas[0];

    const selectPersona = useCallback((id: string) => {
        setActiveId(id);
        localStorage.setItem(ACTIVE_KEY, id);
    }, []);

    const addPersona = useCallback((name: string, prompt: string) => {
        const p: Persona = { id: `custom_${Date.now()}`, name, prompt, builtin: false };
        setPersonas(prev => {
            const next = [...prev, p];
            saveCustom(next);
            return next;
        });
        setActiveId(p.id);
        localStorage.setItem(ACTIVE_KEY, p.id);
        return p;
    }, []);

    const updatePersona = useCallback((id: string, name: string, prompt: string) => {
        setPersonas(prev => {
            const next = prev.map(p => p.id === id ? { ...p, name, prompt } : p);
            saveCustom(next);
            return next;
        });
    }, []);

    const deletePersona = useCallback((id: string) => {
        setPersonas(prev => {
            const next = prev.filter(p => p.id !== id);
            saveCustom(next);
            return next;
        });
        if (activeId === id) {
            setActiveId("default");
            localStorage.setItem(ACTIVE_KEY, "default");
        }
    }, [activeId]);

    return {
        personas, activePersona, activeId, isLoaded,
        systemPrompt: activePersona.prompt,
        selectPersona, addPersona, updatePersona, deletePersona,
    };
}
