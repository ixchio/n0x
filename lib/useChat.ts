"use client";

import { useCallback, useState } from "react";
import { useWebLLM } from "@/lib/useWebLLM";
import { useDeepSearch } from "@/lib/useDeepSearch";
import { useMemory } from "@/lib/useMemory";
import { usePyodide } from "@/lib/usePyodide";
import { useTTS } from "@/lib/useTTS";
import { useRAG } from "@/lib/useRAG";
import { useChatStore } from "@/lib/useChatStore";
import { useSystemPrompt } from "@/lib/useSystemPrompt";

interface ImageGenProgress {
    active: boolean;
    provider?: string;
    phase?: string;
}

const IMG_PATTERNS = [
    /^(generate|create|make|draw|paint|render)\s+(an?\s+)?(image|picture|photo|art|illustration)/i,
    /^image:\s*/i,
    /^\/image\s+/i,
];

export function useChat() {
    const [input, setInput] = useState("");
    const [streamingContent, setStreamingContent] = useState("");
    const [deepSearchEnabled, setDeepSearchEnabled] = useState(false);
    const [memoryEnabled, setMemoryEnabled] = useState(false);
    const [generatingImage, setGeneratingImage] = useState(false);
    const [imageProgress, setImageProgress] = useState<ImageGenProgress>({ active: false });

    const webllm = useWebLLM();
    const deepSearch = useDeepSearch();
    const memory = useMemory();
    const pyodide = usePyodide();
    const tts = useTTS();
    const rag = useRAG();
    const chatStore = useChatStore();
    const persona = useSystemPrompt();

    const isStreaming = webllm.status === "generating" || deepSearch.isActive || generatingImage;

    const handleImageGen = useCallback(async (prompt: string) => {
        setGeneratingImage(true);
        setImageProgress({ active: true, phase: "submitting..." });

        chatStore.addMessage({ id: Date.now().toString(), role: "user", content: prompt });
        const msgId = (Date.now() + 1).toString();
        chatStore.addMessage({ id: msgId, role: "assistant", content: "generating image..." });

        try {
            setImageProgress({ active: true, phase: "waiting for provider..." });
            const res = await fetch("/api/image-gen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: prompt.replace(/^(generate|create|make|draw|image:|\/image)\s*/i, ""),
                }),
            });
            const data = await res.json();

            if (data.success && data.image) {
                setImageProgress({ active: true, phase: `done (${data.provider})`, provider: data.provider });
                chatStore.updateMessage(msgId, { content: `generated: "${prompt}"`, image: data.image });
            } else {
                chatStore.updateMessage(msgId, { content: `failed: ${data.error || "unknown"}` });
            }
        } catch (err: any) {
            chatStore.updateMessage(msgId, { content: `failed: ${err.message}` });
        } finally {
            setGeneratingImage(false);
            setImageProgress({ active: false });
        }
    }, [chatStore]);

    const buildPrompt = useCallback((searchCtx: string, memCtx: string, ragCtx: string) => {
        let base = persona.systemPrompt;

        if (searchCtx) {
            base += `\n\nYou have web search results. Use them to answer. Rules:
1. Answer directly first, no "based on results" filler
2. Use search data if relevant, otherwise say what you know
3. Cite sources at the end if relevant

Search results:
${searchCtx}`;
        }

        if (memCtx) base += `\n\n${memCtx}`;
        if (ragCtx) base += `\n\n${ragCtx}`;
        return base;
    }, [persona.systemPrompt]);

    const handleSend = useCallback(async () => {
        if (!input.trim() || isStreaming) return;
        const message = input.trim();
        setInput("");

        // check if they want an image
        if (IMG_PATTERNS.some(p => p.test(message))) {
            await handleImageGen(message);
            return;
        }

        if (webllm.status !== "ready") return;

        chatStore.addMessage({ id: Date.now().toString(), role: "user", content: message });

        // gather context from enabled features
        const memCtx = memoryEnabled ? memory.getContext(message) : "";

        let ragCtx = "";
        if (rag.ragEnabled && rag.documents.length > 0) {
            setStreamingContent("searching docs...");
            try {
                const chunks = await rag.search(message, 3);
                if (chunks.length > 0) {
                    ragCtx = `\n\nRelevant Context from User Documents:\n${chunks.join("\n\n")}`;
                }
            } catch (e) {
                console.error("rag search failed:", e);
            }
            setStreamingContent("");
        }

        let searchCtx = "";
        if (deepSearchEnabled) {
            const result = await deepSearch.search(message);
            if (result) {
                if (result.summary) searchCtx += result.summary + "\n\n";
                if (result.content.length > 0) {
                    const cleaned = result.content
                        .map((c: string) => c.replace(/^\[Source:[^\]]+\]\n?/gm, "").replace(/^\[Instant Answer\]\n?/gm, "").trim())
                        .filter((c: string) => c.length > 40)
                        .slice(0, 2);
                    const trimmed = cleaned.map((c: string) => c.length > 1200 ? c.slice(0, 1200) + "..." : c);
                    if (trimmed.length > 0) searchCtx += trimmed.join("\n\n");
                }
                if (result.sources.length > 0) {
                    searchCtx += "\n\nSources: " + result.sources.slice(0, 3).join(", ");
                }
            }
        }

        const sysPrompt = buildPrompt("", memCtx, ragCtx);
        const history = chatStore.messages.map(m => ({ role: m.role, content: m.content }));

        // Build final message list — search context goes right before the last user message
        // so the LLM can't miss it (small models ignore long system prompts)
        const msgs: { role: string; content: string }[] = [
            { role: "system", content: sysPrompt },
        ];

        // Add all messages except the last one (which is the current user message)
        if (history.length > 1) {
            msgs.push(...history.slice(0, -1));
        }

        // Inject search results as a context message right before the user query
        if (searchCtx.trim()) {
            msgs.push({
                role: "system",
                content: `[Web Search Results for "${message}"]\n${searchCtx.trim()}\n\nUse these search results to answer the user's question. Cite sources if relevant. Do NOT say "based on my training data" — use the search results above.`,
            });
        }

        // The current user message (last in chatStore)
        if (history.length > 0) {
            msgs.push(history[history.length - 1]);
        }

        try {
            setStreamingContent("");
            let full = "";
            await webllm.generate(msgs, (tok) => {
                full += tok;
                setStreamingContent(full);
            });

            chatStore.addMessage({ id: (Date.now() + 1).toString(), role: "assistant", content: full });
            setStreamingContent("");
            deepSearch.reset();
            if (tts.isEnabled) tts.speak(full);
        } catch (err) {
            console.error("gen error:", err);
            chatStore.addMessage({
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "failed to generate response. try again.",
            });
            deepSearch.reset();
        }
    }, [input, isStreaming, webllm, chatStore, deepSearchEnabled, deepSearch, memory, memoryEnabled, handleImageGen, rag, tts, buildPrompt]);

    const handleNewChat = useCallback(() => {
        chatStore.newConversation();
        setStreamingContent("");
        deepSearch.reset();
    }, [chatStore, deepSearch]);

    const runPython = useCallback(async (code: string) => {
        if (!pyodide.isReady) await pyodide.load();
        return pyodide.run(code);
    }, [pyodide]);

    return {
        input, setInput, streamingContent, isStreaming,
        generatingImage, imageProgress,
        deepSearchEnabled, setDeepSearchEnabled,
        memoryEnabled, setMemoryEnabled,

        webllm, deepSearch, memory, pyodide, tts, rag, chatStore, persona,

        handleSend, handleNewChat,
        handlePythonRun: runPython,
    };
}
