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
import { tick as keySoundTick } from "@/lib/useKeySound";
import { useAgent, AgentToolkit } from "@/lib/useAgent";

// Very simple heuristic to estimate LLM tokens (1 token ≈ 4 characters)
function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

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
    const [reasoningEnabled, setReasoningEnabled] = useState(false);
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
    const agent = useAgent();

    const isStreaming = webllm.status === "generating" || deepSearch.isActive || generatingImage || agent.status === "thinking" || agent.status === "acting";
    let tokenCounter = 0;

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

    const handleSend = useCallback(async (autoMessage?: string) => {
        if (isStreaming) return;
        const message = typeof autoMessage === "string" ? autoMessage : input.trim();
        if (!message) return;

        if (typeof autoMessage !== "string") setInput("");

        // Check if they want an image
        if (IMG_PATTERNS.some(p => p.test(message))) {
            await handleImageGen(message);
            return;
        }

        if (webllm.status !== "ready") return;

        chatStore.addMessage({ id: Date.now().toString(), role: "user", content: message });

        // ── AGENT MODE: Route through autonomous loop ──
        // In agent mode the LLM decides which tools to use, so we give it
        // access to everything that's physically available — not gated by
        // the user toggles (those only control single-shot mode).
        if (agent.enabled) {
            try {
                agent.reset();
                setStreamingContent("🤖 Agent is working…");

                const toolkit: AgentToolkit = {};

                // Web search — always available (it's just an API call)
                toolkit.webSearch = async (q: string) => {
                    try {
                        const result = await deepSearch.search(q);
                        if (!result) return "Search returned no results. Try different search terms.";
                        let ctx = "";
                        if (result.summary) ctx += result.summary + "\n\n";
                        if (result.content?.length > 0) {
                            ctx += result.content.slice(0, 3).join("\n\n");
                        }
                        if (result.sources?.length > 0) {
                            ctx += "\n\nSources:\n" + result.sources.slice(0, 5).map((s: string) => `• ${s}`).join("\n");
                        }
                        deepSearch.reset();
                        return ctx.trim() || "Search completed but returned no useful content.";
                    } catch (e: any) {
                        deepSearch.reset();
                        return `Search failed: ${e.message}. Try answering from your knowledge.`;
                    }
                };

                // Document search — only if files have been uploaded
                if (rag.documents.length > 0) {
                    toolkit.ragSearch = async (q: string) => {
                        try {
                            const ctx = await rag.getFileContext(q);
                            return ctx || "No relevant content found in the uploaded documents.";
                        } catch (e: any) {
                            return `Document search failed: ${e.message}`;
                        }
                    };
                }

                // Python — only if the runtime has been loaded
                if (pyodide.isReady) {
                    toolkit.python = async (code: string) => {
                        try {
                            const res = await pyodide.run(code);
                            if (res.error) return `Python error:\n${res.error}`;
                            return res.output || "(code ran successfully, no output)";
                        } catch (e: any) {
                            return `Python crashed: ${e.message}`;
                        }
                    };
                }

                // Memory — always wire up if there are any memories saved
                if (memory.isLoaded) {
                    toolkit.memorySave = async (content: string) => {
                        try {
                            await memory.saveMemory(content, ["agent"]);
                            return "Saved to memory.";
                        } catch {
                            return "Failed to save memory.";
                        }
                    };
                    toolkit.memoryRecall = (q: string) => {
                        return memory.getContext(q) || "No relevant memories found.";
                    };
                }

                const finalAnswer = await agent.runLoop(
                    message,
                    toolkit,
                    webllm.generate,
                    persona.systemPrompt,
                );

                chatStore.addMessage({
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: finalAnswer,
                });
                setStreamingContent("");

                if (tts.isEnabled) tts.speak(finalAnswer);
            } catch (err: any) {
                console.error("Agent loop error:", err);
                setStreamingContent("");
                chatStore.addMessage({
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: `Agent failed: ${err.message}`,
                });
                agent.reset();
            }
            return;
        }

        // ── Gather context from all enabled features (parallel where possible) ──

        // 1. RAG — Get file context (direct text for small files, vector search for large)
        let ragCtx = "";
        const hasDocuments = rag.documents.length > 0;
        if (hasDocuments) {
            setStreamingContent("⟳ reading your documents...");
            try {
                ragCtx = await rag.getFileContext(message);
            } catch (e) {
                console.error("RAG context failed:", e);
                // Fallback: try basic search
                try {
                    const chunks = await rag.search(message, 4);
                    if (chunks.length > 0) {
                        ragCtx = chunks
                            .filter(c => c && c.trim().length > 20)
                            .map((c, i) => `[Doc ${i + 1}] ${c.trim()}`)
                            .join("\n\n");
                    }
                } catch {
                    // silently continue without RAG
                }
            }
        }

        // 2. Memory — retrieve relevant context
        const memCtx = memoryEnabled ? memory.getContext(message) : "";

        // 3. Deep Search — web search (with error resilience!)
        let searchCtx = "";
        if (deepSearchEnabled) {
            setStreamingContent("⟳ searching the web...");
            try {
                const result = await deepSearch.search(message);
                if (result) {
                    if (result.summary) searchCtx += result.summary + "\n\n";
                    if (result.content && result.content.length > 0) {
                        const cleaned = result.content
                            .map((c: string) => c.replace(/^\[Source:[^\]]+\]\n?/gm, "").replace(/^\[Instant Answer\]\n?/gm, "").trim())
                            .filter((c: string) => c.length > 40)
                            .slice(0, 3);
                        const trimmed = cleaned.map((c: string) => c.length > 1200 ? c.slice(0, 1200) + "..." : c);
                        if (trimmed.length > 0) searchCtx += trimmed.join("\n\n");
                    }
                    if (result.sources && result.sources.length > 0) {
                        searchCtx += "\n\nSources: " + result.sources.slice(0, 4).join(", ");
                    }
                }
            } catch (e) {
                // Search failed — continue without search context, don't crash
                console.error("Deep search error (non-fatal):", e);
                searchCtx = "";
            }
        }

        // ── Build the message list for the LLM ──
        // IMPORTANT: WebLLM only allows ONE system message and it MUST be first.
        // All context (RAG, search, memory) gets merged into the system prompt.

        // Build context parts
        const contextParts: string[] = [];

        if (ragCtx) {
            const fileNames = rag.documents.map(d => d.name).join(", ");
            contextParts.push(
                `## Attached Files: ${fileNames}\nThe user has uploaded documents. Here is the content:\n${ragCtx}\nYou MUST use this document content to answer. Reference the file names when quoting.`
            );
        }

        if (searchCtx.trim()) {
            contextParts.push(
                `## Web Search Results\n${searchCtx.trim()}\nUse these results for an accurate, up-to-date answer. Cite sources.`
            );
        }

        if (memCtx) {
            contextParts.push(`## Memory\n${memCtx}`);
        }

        // Build the single system prompt
        let systemContent = persona.systemPrompt;
        if (reasoningEnabled) {
            systemContent += "\n\nCRITICAL INSTRUCTION: You must think step-by-step before answering. Enclose your internal reasoning process entirely within <think> and </think> tags. Do not output anything before the <think> tag. After the </think> closing tag, provide your final response to the user.";
        }

        // Build the context block for the user message
        let userContextBlock = "";
        if (contextParts.length > 0) {
            userContextBlock = `[CONTEXT]\n${contextParts.join("\n\n")}\n[END CONTEXT]\n\nBased on the context above, answer the following:\n`;
        }

        // Conversation history (only user/assistant — exclude the message we just added)
        const history = chatStore.messages
            .map(m => ({ role: m.role, content: m.content }));

        const MAX_CONTEXT_TOKENS = 3500; // Leave ~500 for generation in a 4k window
        const newMessageTokens = estimateTokens(message);

        // If the context block is ALREADY too large, truncate it.
        // This prevents the search/rag from blowing up the entire prompt.
        let baseTokens = estimateTokens(systemContent) + newMessageTokens;

        if (userContextBlock.length > 0) {
            const contextTokensEstimate = estimateTokens(userContextBlock);
            if (baseTokens + contextTokensEstimate > MAX_CONTEXT_TOKENS) {
                const safeCharLimit = (MAX_CONTEXT_TOKENS - baseTokens) * 4;
                userContextBlock = userContextBlock.slice(0, safeCharLimit) + "\n\n...[Context truncated to fit memory window]\n\nBased on the context above, answer the following:\n";
            }
            baseTokens += estimateTokens(userContextBlock);
        }

        const msgs: { role: string; content: string }[] = [
            { role: "system", content: systemContent },
        ];

        let currentTokens = baseTokens;

        // Traverse history starting from the newest to keep chronological context
        // and stop when we hit the memory limit.
        const trimmedHistory: { role: string; content: string }[] = [];
        for (let i = history.length - 1; i >= 0; i--) {
            const msgTokens = estimateTokens(history[i].content);
            if (currentTokens + msgTokens > MAX_CONTEXT_TOKENS) {
                break; // Window is full, skip older messages
            }
            trimmedHistory.unshift(history[i]);
            currentTokens += msgTokens;
        }

        if (trimmedHistory.length > 0) {
            msgs.push(...trimmedHistory);
        }

        // ALWAYS append the current user message as final message (with context if applicable)
        const finalUserContent = userContextBlock ? userContextBlock + message : message;
        msgs.push({ role: "user", content: finalUserContent });

        // ── Generate ──
        try {
            setStreamingContent("");
            let full = "";
            tokenCounter = 0;
            await webllm.generate(msgs, (tok) => {
                full += tok;
                setStreamingContent(full);
                // Play key click every ~3 tokens
                tokenCounter++;
                if (tokenCounter % 3 === 0) keySoundTick();
            });

            chatStore.addMessage({ id: (Date.now() + 1).toString(), role: "assistant", content: full });
            setStreamingContent("");
            deepSearch.reset();

            // Clear pending files after response (they've been used)
            if (hasDocuments) {
                rag.clearPending();
            }

            // Auto-save to memory if enabled (only for meaningful responses)
            if (memoryEnabled && full.length > 50 && !full.startsWith("failed")) {
                // Better memory format: structured with topic extraction
                const memContent = `Topic: ${message.slice(0, 80)}\nQ: ${message}\nA: ${full.slice(0, 400)}`;
                memory.saveMemory(memContent, ["chat", "auto"]);
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
    }, [input, isStreaming, webllm, chatStore, deepSearchEnabled, deepSearch, memory, memoryEnabled, handleImageGen, rag, tts, persona, reasoningEnabled, agent, pyodide]);

    const handleStop = useCallback(() => {
        webllm.stop();
        deepSearch.stop();
        agent.reset();
        // Save whatever was streamed so far
        setStreamingContent(prev => {
            if (prev && prev.trim()) {
                chatStore.addMessage({
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: prev + "\n\n*[generation stopped]*",
                });
            }
            return "";
        });
        setGeneratingImage(false);
    }, [webllm, deepSearch, chatStore, agent]);

    const handleNewChat = useCallback(() => {
        chatStore.newConversation();
        setStreamingContent("");
        deepSearch.reset();
    }, [chatStore, deepSearch]);

    const runPython = useCallback(async (code: string) => {
        if (!pyodide.isReady) await pyodide.load();
        const res = await pyodide.run(code);

        // Self-Healing
        if (res.error) {
            const errorMsg = `Code Execution Failed:\n\`\`\`text\n${res.error}\n\`\`\`\nPlease fix the code and try again.`;
            // Trigger automatic retry using the error message
            handleSend(errorMsg);
        }

        return res;
    }, [pyodide, handleSend]);

    return {
        input, setInput, streamingContent, isStreaming,
        generatingImage, imageProgress,
        deepSearchEnabled, setDeepSearchEnabled,
        memoryEnabled, setMemoryEnabled,
        reasoningEnabled, setReasoningEnabled,

        webllm, deepSearch, memory, pyodide, tts, rag, chatStore, persona, agent,

        handleSend, handleNewChat, handleStop,
        handlePythonRun: runPython,
    };
}
