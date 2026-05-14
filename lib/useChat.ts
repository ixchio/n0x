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
import { useWebContainer } from "@/lib/useWebContainer";

const CHARS_PER_TOKEN = 4;
function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
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

export function useChat(providerCtx?: { 
    provider: "browser" | "ollama" | "cloud" | "chrome-ai", 
    ollama: any, 
    cloudAI: any,
    chromeAI?: any,
}) {
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
    const webContainer = useWebContainer();
    const tts = useTTS();
    const rag = useRAG();
    const chatStore = useChatStore();
    const persona = useSystemPrompt();
    const agent = useAgent();

    // Determine current provider status for UI
    let activeProviderReady = false;
    if (providerCtx?.provider === "chrome-ai") activeProviderReady = providerCtx.chromeAI?.status === "ready";
    else if (providerCtx?.provider === "ollama") activeProviderReady = providerCtx.ollama.isSupported;
    else if (providerCtx?.provider === "cloud") activeProviderReady = !!providerCtx.cloudAI.apiKey;
    else activeProviderReady = webllm.status === "ready";

    const isStreaming = webllm.status === "generating" || 
        providerCtx?.ollama.status === "generating" || 
        providerCtx?.cloudAI.status === "generating" || 
        providerCtx?.chromeAI?.status === "generating" ||
        deepSearch.isActive || generatingImage || agent.status === "thinking" || agent.status === "acting";

    const getGenerateFn = useCallback(() => {
        if (providerCtx?.provider === "chrome-ai") return providerCtx.chromeAI!.generate;
        if (providerCtx?.provider === "ollama") return providerCtx.ollama.generate;
        if (providerCtx?.provider === "cloud") return providerCtx.cloudAI.generate;
        return webllm.generate;
    }, [providerCtx, webllm.generate]);

    const handleImageGen = useCallback(async (prompt: string) => {
        setGeneratingImage(true);
        setImageProgress({ active: true, phase: "sending to Pollinations..." });

        chatStore.addMessage({ id: Date.now().toString(), role: "user", content: prompt });
        const msgId = (Date.now() + 1).toString();
        chatStore.addMessage({ id: msgId, role: "assistant", content: "🎨 Generating image…" });

        try {
            setImageProgress({ active: true, phase: "generating with Flux…" });
            const res = await fetch("/api/image-gen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: prompt.replace(/^(generate|create|make|draw|image:|\/image)\s*/i, ""),
                }),
            });
            const data = await res.json();

            if (data.success && data.image) {
                const model = data.provider?.replace("pollinations-", "").replace("free-", "") || "ai";
                setImageProgress({ active: true, phase: `done · ${model}`, provider: data.provider });
                chatStore.updateMessage(msgId, { content: `🎨 "${prompt.replace(/^(generate|create|make|draw|paint|render)\s+(an?\s+)?(image|picture|photo)\s+(of\s+)?/i, "").trim()}"`, image: data.image });
            } else {
                chatStore.updateMessage(msgId, { content: `⚠️ Image generation failed: ${data.error || "provider unavailable"}` });
            }
        } catch (err: any) {
            chatStore.updateMessage(msgId, { content: `⚠️ Image generation failed: ${err.message}` });
        } finally {
            setGeneratingImage(false);
            setImageProgress({ active: false });
        }
    }, [chatStore]);

    // ── Helper: Build the agent toolkit from currently available services ──
    const buildAgentToolkit = useCallback((): AgentToolkit => {
        const toolkit: AgentToolkit = {};

        // Web search — always available (it's just an API call)
        toolkit.webSearch = async (q: string) => {
            try {
                const result = await deepSearch.search(q);
                if (!result) return "Search returned no results. Try different search terms.";
                let ctx = "";
                if (result.summary) ctx += result.summary + "\n\n";
                if (result.content?.length > 0) ctx += result.content.slice(0, 3).join("\n\n");
                if (result.sources?.length > 0) ctx += "\n\nSources:\n" + result.sources.slice(0, 5).map((s: string) => `• ${s}`).join("\n");
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
                    return (await rag.getFileContext(q)) || "No relevant content found in the uploaded documents.";
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

        // Memory — wire up if the store is loaded
        if (memory.isLoaded) {
            toolkit.memorySave = async (content: string) => {
                try {
                    await memory.saveMemory(content, ["agent"]);
                    return "Saved to memory.";
                } catch {
                    return "Failed to save memory.";
                }
            };
            toolkit.memoryRecall = (q: string) => memory.getContext(q) || "No relevant memories found.";
        }

        // Image generation — always available (API call)
        toolkit.imageGen = async (prompt: string) => {
            try {
                const res = await fetch("/api/image-gen", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt }),
                });
                const data = await res.json();
                if (data.success && data.image) {
                    // Add the image as a message in the chat
                    chatStore.addMessage({
                        id: (Date.now() + Math.random()).toString(),
                        role: "assistant",
                        content: `Generated image: "${prompt}"`,
                        image: data.image,
                    });
                    return `Image generated successfully via ${data.provider}. The image is now displayed in the chat.`;
                }
                return `Image generation failed: ${data.error || "unknown error"}`;
            } catch (e: any) {
                return `Image generation failed: ${e.message}`;
            }
        };

        return toolkit;
    }, [deepSearch, rag, pyodide, memory, chatStore]);

    const gatherContext = useCallback(async (message: string) => {
        let ragCtx = "";
        const hasDocuments = rag.documents.length > 0;

        if (hasDocuments) {
            setStreamingContent("⟳ reading your documents...");
            try {
                ragCtx = await rag.getFileContext(message);
            } catch (e) {
                console.error("RAG context failed:", e);
                try {
                    const chunks = await rag.search(message, 4);
                    if (chunks.length > 0) {
                        ragCtx = chunks
                            .filter((c: string) => c && c.trim().length > 20)
                            .map((c: string, i: number) => `[Doc ${i + 1}] ${c.trim()}`)
                            .join("\n\n");
                    }
                } catch { /* silently continue without RAG */ }
            }
        }

        const memCtx = memoryEnabled ? memory.getContext(message) : "";

        let searchCtx = "";
        if (deepSearchEnabled) {
            setStreamingContent("⟳ searching the web...");
            try {
                const result = await deepSearch.search(message);
                if (result) {
                    if (result.summary) searchCtx += result.summary + "\n\n";
                    if (result.content?.length > 0) {
                        const cleaned = result.content
                            .map((c: string) => c.replace(/^\[Source:[^\]]+\]\n?/gm, "").replace(/^\[Instant Answer\]\n?/gm, "").trim())
                            .filter((c: string) => c.length > 40)
                            .slice(0, 3);
                        const trimmed = cleaned.map((c: string) => c.length > 1200 ? c.slice(0, 1200) + "..." : c);
                        if (trimmed.length > 0) searchCtx += trimmed.join("\n\n");
                    }
                    if (result.sources?.length > 0)
                        searchCtx += "\n\nSources: " + result.sources.slice(0, 4).join(", ");
                }
            } catch (e) {
                console.error("Deep search error (non-fatal):", e);
            }
        }

        return { ragCtx, memCtx, searchCtx, hasDocuments };
    }, [rag, memoryEnabled, memory, deepSearchEnabled, deepSearch]);

    // ── Helper: Build the message array with context + trimmed history ──
    const buildMessages = useCallback((
        message: string,
        systemContent: string,
        ragCtx: string,
        memCtx: string,
        searchCtx: string,
    ): { role: string; content: string }[] => {
        // Cloud/Ollama models have massive context windows — don't strangle them
        const MAX_CONTEXT_TOKENS = providerCtx?.provider === "cloud" ? 30000
            : providerCtx?.provider === "ollama" ? 12000
            : 3500; // WebGPU/Chrome AI: small models, leave room for generation

        const contextParts: string[] = [];
        if (ragCtx) {
            const fileNames = rag.documents.map(d => d.name).join(", ");
            contextParts.push(`## Attached Files: ${fileNames}\nThe user has uploaded documents. Here is the content:\n${ragCtx}\nYou MUST use this document content to answer. Reference the file names when quoting.`);
        }
        if (searchCtx.trim()) contextParts.push(`## Web Search Results\n${searchCtx.trim()}\nUse these results for an accurate, up-to-date answer. Cite sources.`);
        if (memCtx) contextParts.push(`## Memory\n${memCtx}`);

        let userContextBlock = contextParts.length > 0
            ? `[CONTEXT]\n${contextParts.join("\n\n")}\n[END CONTEXT]\n\nBased on the context above, answer the following:\n`
            : "";

        let baseTokens = estimateTokens(systemContent) + estimateTokens(message);
        if (userContextBlock.length > 0) {
            const ctxTokens = estimateTokens(userContextBlock);
            if (baseTokens + ctxTokens > MAX_CONTEXT_TOKENS) {
                const safeCharLimit = (MAX_CONTEXT_TOKENS - baseTokens) * CHARS_PER_TOKEN;
                userContextBlock = userContextBlock.slice(0, safeCharLimit)
                    + "\n\n...[Context truncated to fit memory window]\n\nBased on the context above, answer the following:\n";
            }
            baseTokens += estimateTokens(userContextBlock);
        }

        const msgs: { role: string; content: string }[] = [{ role: "system", content: systemContent }];
        let currentTokens = baseTokens;
        const history = chatStore.messages.map(m => ({ role: m.role, content: m.content }));
        const trimmedHistory: { role: string; content: string }[] = [];
        for (let i = history.length - 1; i >= 0; i--) {
            const t = estimateTokens(history[i].content);
            if (currentTokens + t > MAX_CONTEXT_TOKENS) break;
            trimmedHistory.unshift(history[i]);
            currentTokens += t;
        }
        if (trimmedHistory.length > 0) msgs.push(...trimmedHistory);
        msgs.push({ role: "user", content: userContextBlock ? userContextBlock + message : message });
        return msgs;
    }, [rag, chatStore]);

    // ── Main send handler ──
    const handleSend = useCallback(async (autoMessage?: string) => {
        if (isStreaming) return;
        const message = typeof autoMessage === "string" ? autoMessage : input.trim();
        if (!message) return;
        if (typeof autoMessage !== "string") setInput("");

        // Route: image generation
        if (IMG_PATTERNS.some(p => p.test(message))) {
            await handleImageGen(message);
            return;
        }

        if (!activeProviderReady) {
            chatStore.addMessage({ id: Date.now().toString(), role: "user", content: message });
            const hint = providerCtx?.provider === "browser"
                ? "Load a model first — pick one from the welcome screen or use the model selector."
                : providerCtx?.provider === "ollama"
                ? "Ollama isn't connected. Download it from [ollama.com/download](https://ollama.com/download), run `ollama serve`, then pull a model with `ollama pull llama3.2`. n0x will auto-detect it."
                : providerCtx?.provider === "cloud"
                ? "Cloud API key not set. Click the provider button and enter your API key."
                : providerCtx?.provider === "chrome-ai"
                ? "Chrome AI is initializing. Please wait a moment and try again."
                : "No AI provider is ready. Select a provider from the toolbar.";
            chatStore.addMessage({ id: (Date.now() + 1).toString(), role: "assistant", content: `⚠️ ${hint}` });
            return;
        }
        chatStore.addMessage({ id: Date.now().toString(), role: "user", content: message });

        // Route: autonomous agent mode
        if (agent.enabled) {
            let streamBuf = "";
            // onThoughtToken: empty string = new iteration boundary (reset the bubble)
            const onThoughtToken = (tok: string) => {
                if (tok === "") {
                    // New iteration — clear the live bubble so the next thought starts fresh
                    streamBuf = "";
                    setStreamingContent("🤔 Thinking…");
                } else {
                    streamBuf += tok;
                    setStreamingContent(streamBuf);
                }
            };
            try {
                agent.reset();
                setStreamingContent("🤖 Agent is working…");
                // Cloud/Ollama have large context windows — give agent more room
                const agentBudget = providerCtx?.provider === "cloud" ? 120_000
                    : providerCtx?.provider === "ollama" ? 48_000
                    : undefined; // use WebLLM's detected limit
                const finalAnswer = await agent.runLoop(
                    message, buildAgentToolkit(), getGenerateFn(), persona.systemPrompt, onThoughtToken, agentBudget,
                );
                chatStore.addMessage({ id: (Date.now() + 1).toString(), role: "assistant", content: finalAnswer });
                setStreamingContent("");
                if (tts.isEnabled) tts.speak(finalAnswer);
            } catch (err: any) {
                console.error("Agent loop error:", err);
                setStreamingContent("");
                chatStore.addMessage({ id: (Date.now() + 1).toString(), role: "assistant", content: `Agent failed: ${err.message}` });
                agent.reset();
            }
            return;
        }

        // Route: direct mode — gather context, build msgs, generate
        const { ragCtx, memCtx, searchCtx, hasDocuments } = await gatherContext(message);
        const msgs = buildMessages(message, persona.systemPrompt, ragCtx, memCtx, searchCtx);

        try {
            setStreamingContent("");
            let full = "";
            let tokCount = 0;
            const generate = getGenerateFn();
            await generate(msgs, (tok: string) => {
                full += tok;
                setStreamingContent(full);
                tokCount++;
                if (tokCount % 3 === 0) keySoundTick();
            });

            chatStore.addMessage({ id: (Date.now() + 1).toString(), role: "assistant", content: full });
            setStreamingContent("");
            deepSearch.reset();
            if (hasDocuments) rag.clearPending();

            // Auto-save to memory if enabled
            if (memoryEnabled && full.length > 50 && !full.startsWith("failed")) {
                memory.saveMemory(`Topic: ${message.slice(0, 80)}\nQ: ${message}\nA: ${full.slice(0, 400)}`, ["chat", "auto"]);
            }

            if (tts.isEnabled) tts.speak(full);
        } catch (err) {
            console.error("gen error:", err);
            chatStore.addMessage({ id: (Date.now() + 1).toString(), role: "assistant", content: "failed to generate response. try again." });
            deepSearch.reset();
        }
    }, [input, isStreaming, activeProviderReady, chatStore, deepSearch, memory, memoryEnabled, handleImageGen, rag, tts, persona, agent, buildAgentToolkit, gatherContext, buildMessages, getGenerateFn]);

    const handleStop = useCallback(() => {
        if (providerCtx?.provider === "chrome-ai") providerCtx.chromeAI?.stop();
        else if (providerCtx?.provider === "ollama") providerCtx.ollama.stop();
        else if (providerCtx?.provider === "cloud") providerCtx.cloudAI.stop();
        else webllm.stop();

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

        webllm, deepSearch, memory, pyodide, tts, rag, chatStore, persona, agent,

        handleSend, handleNewChat, handleStop,
        handlePythonRun: runPython,
    };
}

