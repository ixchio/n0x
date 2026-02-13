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

        // ── Gather context from all enabled features (parallel where possible) ──

        // 1. RAG — auto-enabled when documents exist, no toggle needed
        let ragCtx = "";
        const hasDocuments = rag.documents.length > 0;
        if (hasDocuments) {
            setStreamingContent("⟳ searching your documents...");
            try {
                const chunks = await rag.search(message, 4);
                if (chunks.length > 0) {
                    ragCtx = chunks
                        .filter(c => c && c.trim().length > 20)
                        .map((c, i) => `[Doc ${i + 1}] ${c.trim()}`)
                        .join("\n\n");
                }
            } catch (e) {
                console.error("RAG search failed:", e);
            }
        }

        // 2. Memory — retrieve relevant context
        const memCtx = memoryEnabled ? memory.getContext(message) : "";

        // 3. Deep Search — web search
        let searchCtx = "";
        if (deepSearchEnabled) {
            setStreamingContent("⟳ searching the web...");
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

        // ── Build the message list for the LLM ──
        // Strategy: system prompt first, then conversation history (minus last message),
        // then inject ALL context as a single focused system message right before the
        // user query. Small models pay most attention to messages near the end.

        const history = chatStore.messages.map(m => ({ role: m.role, content: m.content }));

        const msgs: { role: string; content: string }[] = [
            { role: "system", content: persona.systemPrompt },
        ];

        // Conversation history (everything except the last message, which is the current user message)
        if (history.length > 1) {
            // Keep only last 10 exchanges to avoid blowing context window on small models
            const trimmedHistory = history.slice(0, -1).slice(-20);
            msgs.push(...trimmedHistory);
        }

        // ── Inject all context as ONE combined message right before the user query ──
        // This is the key fix: small models (SmolLM2, Phi-3, Qwen) pay attention to
        // recent messages, not the system prompt. By putting RAG + search + memory
        // context here, the model CAN'T ignore it.
        const contextParts: string[] = [];

        if (ragCtx) {
            contextParts.push(
                `## Your Documents (uploaded by the user)\nThe user has uploaded documents. Here is the relevant content:\n\n${ragCtx}\n\nYou MUST use this document content to answer. Do NOT say "I don't have access to documents." The content is right above.`
            );
        }

        if (searchCtx.trim()) {
            contextParts.push(
                `## Web Search Results\n${searchCtx.trim()}\n\nUse these search results to answer. Do NOT fall back to training data when search results are available.`
            );
        }

        if (memCtx) {
            contextParts.push(`## Conversation Memory\n${memCtx}`);
        }

        if (contextParts.length > 0) {
            msgs.push({
                role: "system",
                content: `[CONTEXT FOR ANSWERING]\n\n${contextParts.join("\n\n---\n\n")}\n\n[END CONTEXT]\n\nAnswer the user's next message using the context above. Be specific and reference the actual content provided.`,
            });
        }

        // The current user message (last in chatStore)
        if (history.length > 0) {
            msgs.push(history[history.length - 1]);
        }

        // ── Generate ──
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

            // Auto-save to memory if enabled
            if (memoryEnabled && full.length > 20) {
                memory.saveMemory(`Q: ${message}\nA: ${full.slice(0, 300)}`, ["chat"]);
            }

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
    }, [input, isStreaming, webllm, chatStore, deepSearchEnabled, deepSearch, memory, memoryEnabled, handleImageGen, rag, tts, persona]);

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
