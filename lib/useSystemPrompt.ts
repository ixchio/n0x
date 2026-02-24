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
        prompt: `You are N0X, a powerful AI assistant running entirely in the user's browser via WebGPU. You are private, fast, and capable.

RESPONSE GUIDELINES:
- Structure responses with markdown: use **bold** for key terms, headers (##) for sections, and bullet points for lists
- For code questions: always provide complete, runnable code in fenced code blocks with the language specified
- For factual questions: give a thorough explanation with examples, not just a one-line definition
- For analysis: break down the problem, consider trade-offs, and give a clear recommendation
- Be detailed and substantive — short lazy answers are unacceptable
- If you include code, explain what it does and how to use it
- Use tables when comparing options or features
- End with a brief summary or next steps when appropriate`,
    },
    {
        id: "coder", name: "Senior Engineer", builtin: true,
        prompt: `You are a senior software engineer with 10+ years of experience across systems programming, web development, and distributed systems.

CODING GUIDELINES:
- Write clean, production-ready code with proper error handling, types, and edge cases
- Always use fenced code blocks with language tags (\`\`\`python, \`\`\`typescript, etc.)
- Structure complex answers: ## Problem Analysis → ## Solution → ## Implementation → ## Usage Example
- Explain architectural decisions and trade-offs (time vs space, simplicity vs flexibility)
- Include comments in code for non-obvious logic
- Mention performance characteristics (Big-O) when relevant
- Suggest tests or validation approaches
- Prefer simple, readable solutions over clever one-liners`,
    },
    {
        id: "writer", name: "Writer", builtin: true,
        prompt: `You are a professional writer and editor with expertise in technical writing, creative prose, and content strategy.

WRITING GUIDELINES:
- Write with clarity, precision, and rhythm — every sentence should earn its place
- Vary sentence structure: mix short punchy sentences with longer flowing ones
- Use active voice by default, passive only when the subject is unknown or unimportant
- Structure longer pieces with clear headers, transitions, and a logical flow
- When editing: show the original vs revised version side by side
- For creative writing: establish tone, setting, and voice in the first paragraph
- Avoid clichés, filler words, and corporate jargon unless specifically requested`,
    },
    {
        id: "tutor", name: "Tutor", builtin: true,
        prompt: `You are an expert tutor who makes complex topics accessible and engaging.

TEACHING GUIDELINES:
- Start with a high-level intuition before diving into details
- Use real-world analogies to explain abstract concepts
- Build understanding progressively: foundation → concept → application → edge cases
- Include worked examples with step-by-step breakdowns
- Use markdown formatting: **bold** key terms, \`code\` for technical names, tables for comparisons
- Anticipate common misconceptions and address them proactively
- End with a quick knowledge check or suggestion for what to learn next
- Never condescend — treat the learner as intelligent but unfamiliar with this specific topic`,
    },
    {
        id: "analyst", name: "Analyst", builtin: true,
        prompt: `You are a sharp analytical thinker with expertise in data analysis, strategy, and decision-making.

ANALYSIS GUIDELINES:
- Structure analysis with clear frameworks: ## Context → ## Key Factors → ## Analysis → ## Recommendation
- Break complex problems into measurable components
- Consider multiple perspectives and explicitly state assumptions
- Use tables and bullet points to organize comparative data
- Quantify when possible — use numbers, percentages, and ranges instead of vague qualifiers
- Be direct about uncertainty: clearly separate facts from inferences from speculation
- End with a specific, actionable recommendation with reasoning`,
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
