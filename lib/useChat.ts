"use client";

import { useCallback, useState } from "react";
import { WEBLLM_MODELS, useWebLLM } from "@/lib/useWebLLM";
import { useDeepSearch } from "@/lib/useDeepSearch";
import { useMemory } from "@/lib/useMemory";
import { usePyodide } from "@/lib/usePyodide";
import { useTTS } from "@/lib/useTTS";
import { useRAG } from "@/lib/useRAG";
import { createChatMessageId, type ChatMessageMeta, type ChatProvider, useChatStore } from "@/lib/useChatStore";
import { useSystemPrompt } from "@/lib/useSystemPrompt";
import { tick as keySoundTick } from "@/lib/useKeySound";
import { useAgent, AgentToolkit } from "@/lib/useAgent";
import { routeMessage, classifyComplexity, type RouteDecision } from "@/lib/useAutoRouter";
import { trackFirstMessage } from "@/lib/analytics";
import { logger } from "@/lib/logger";

const CHARS_PER_TOKEN = 4;
function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function safeHostname(url?: string): string {
    if (!url) return "";
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
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

const RESPONSE_QUALITY_RULES = `## Response Quality Rules
- Answer directly first. Do not start with meta commentary.
- Prefer short paragraphs and clean bullets.
- Do not use markdown tables unless the user explicitly asks for a table.
- For current questions, distinguish source-backed facts from inference.
- If sources disagree or measure different things, say that plainly.
- Use citations like [1], [2] only for claims supported by provided search results.`;

export function useChat(providerCtx?: {
    provider: "browser" | "ollama" | "cloud" | "chrome-ai";
    ollama: any;
    cloudAI: any;
    chromeAI?: any;
}) {
    const [input, setInput] = useState("");
    const [streamingContent, setStreamingContent] = useState("");
    const [deepSearchEnabled, setDeepSearchEnabled] = useState(false);
    const [memoryEnabled, setMemoryEnabled] = useState(false);
    const [generatingImage, setGeneratingImage] = useState(false);
    const [imageProgress, setImageProgress] = useState<ImageGenProgress>({ active: false });
    const [autoRouteEnabled, setAutoRouteEnabled] = useState(false);
    const [lastRouteDecision, setLastRouteDecision] = useState<RouteDecision | null>(null);

    const webllm = useWebLLM();
    const deepSearch = useDeepSearch();
    const memory = useMemory();
    const pyodide = usePyodide();
    const tts = useTTS();
    const rag = useRAG();
    const chatStore = useChatStore();
    const persona = useSystemPrompt();
    const agent = useAgent();

    const getProviderMeta = useCallback(
        (route: RouteDecision = "default", flags: Partial<ChatMessageMeta> = {}): ChatMessageMeta => {
            const resolveProvider = (): ChatProvider => {
                if (route === "cloud") return "cloud";
                if (route === "local") {
                    if (providerCtx?.provider === "ollama" && providerCtx.ollama?.isSupported) return "ollama";
                    if (providerCtx?.provider === "chrome-ai" && providerCtx.chromeAI?.status === "ready") {
                        return "chrome-ai";
                    }
                    return "browser";
                }
                return providerCtx?.provider || "browser";
            };

            const resolvedProvider = resolveProvider();
            const modelName =
                resolvedProvider === "browser"
                    ? WEBLLM_MODELS.find(m => m.id === webllm.loadedModel)?.label || webllm.loadedModel || "No model"
                    : resolvedProvider === "ollama"
                      ? providerCtx?.ollama?.loadedModel || "Ollama"
                      : resolvedProvider === "cloud"
                        ? providerCtx?.cloudAI?.loadedModel || "Cloud API"
                        : resolvedProvider === "chrome-ai"
                          ? "Gemini Nano"
                          : "Image API";

            const providerLabel =
                resolvedProvider === "browser"
                    ? "WebGPU"
                    : resolvedProvider === "ollama"
                      ? "Ollama"
                      : resolvedProvider === "cloud"
                        ? "Cloud API"
                        : resolvedProvider === "chrome-ai"
                          ? "Chrome AI"
                          : "Image API";

            let privacy: ChatMessageMeta["privacy"] =
                resolvedProvider === "cloud" || resolvedProvider === "image" ? "cloud" : "local";
            if (privacy === "local" && flags.usedSearch) privacy = "mixed";

            return {
                provider: resolvedProvider,
                providerLabel,
                modelName,
                privacy,
                route,
                ...flags,
            };
        },
        [
            providerCtx?.provider,
            providerCtx?.ollama?.isSupported,
            providerCtx?.ollama?.loadedModel,
            providerCtx?.cloudAI?.loadedModel,
            providerCtx?.chromeAI?.status,
            webllm.loadedModel,
        ]
    );

    // Determine current provider status for UI
    let activeProviderReady = false;
    if (providerCtx?.provider === "chrome-ai") activeProviderReady = providerCtx?.chromeAI?.status === "ready";
    else if (providerCtx?.provider === "ollama") activeProviderReady = !!providerCtx?.ollama?.isSupported;
    else if (providerCtx?.provider === "cloud") activeProviderReady = !!providerCtx?.cloudAI?.apiKey;
    else activeProviderReady = webllm.status === "ready";

    const isStreaming =
        webllm.status === "generating" ||
        providerCtx?.ollama.status === "generating" ||
        providerCtx?.cloudAI.status === "generating" ||
        providerCtx?.chromeAI?.status === "generating" ||
        deepSearch.isActive ||
        generatingImage ||
        agent.status === "thinking" ||
        agent.status === "acting";

    const getGenerateFn = useCallback(() => {
        if (providerCtx?.provider === "chrome-ai") return providerCtx.chromeAI!.generate;
        if (providerCtx?.provider === "ollama") return providerCtx.ollama.generate;
        if (providerCtx?.provider === "cloud") return providerCtx.cloudAI.generate;
        return webllm.generate;
    }, [providerCtx, webllm.generate]);

    // Get generate function for a SPECIFIC provider (for hybrid routing)
    const getGenerateFnFor = useCallback(
        (target: "local" | "cloud") => {
            if (target === "cloud" && providerCtx?.cloudAI.apiKey) {
                return providerCtx.cloudAI.generate;
            }
            // "local" = whatever local provider is active
            if (providerCtx?.provider === "chrome-ai") return providerCtx.chromeAI!.generate;
            if (providerCtx?.provider === "ollama") return providerCtx.ollama.generate;
            if (webllm.status === "ready") return webllm.generate;
            return null;
        },
        [providerCtx, webllm.generate, webllm.status]
    );

    const handleImageGen = useCallback(
        async (prompt: string) => {
            setGeneratingImage(true);
            setImageProgress({ active: true, phase: "sending to Pollinations..." });

            const meta: ChatMessageMeta = {
                provider: "image",
                providerLabel: "Image API",
                modelName: "Pollinations / AI Horde",
                privacy: "cloud",
            };
            chatStore.addMessage({ role: "user", content: prompt, meta });
            const msgId = createChatMessageId();
            chatStore.addMessage({ id: msgId, role: "assistant", content: "🎨 Generating image…", meta });

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
                    chatStore.updateMessage(msgId, {
                        content: `🎨 "${prompt.replace(/^(generate|create|make|draw|paint|render)\s+(an?\s+)?(image|picture|photo)\s+(of\s+)?/i, "").trim()}"`,
                        image: data.image,
                    });
                } else {
                    chatStore.updateMessage(msgId, {
                        content: `⚠️ Image generation failed: ${data.error || "provider unavailable"}`,
                    });
                }
            } catch (err: any) {
                chatStore.updateMessage(msgId, { content: `⚠️ Image generation failed: ${err.message}` });
            } finally {
                setGeneratingImage(false);
                setImageProgress({ active: false });
            }
        },
        [chatStore]
    );

    // ── Helper: Build the agent toolkit from currently available services ──
    const buildAgentToolkit = useCallback((): AgentToolkit => {
        const toolkit: AgentToolkit = {};

        // Web search — always available (it's just an API call)
        toolkit.webSearch = async (q: string) => {
            try {
                const result = await deepSearch.search(q);
                if (!result || result.noUsefulResults) {
                    deepSearch.reset();
                    return "Search returned no relevant sources. Try more specific search terms.";
                }
                let ctx = "";
                if (result.summary) ctx += result.summary + "\n\n";
                if (result.content?.length > 0) ctx += result.content.slice(0, 3).join("\n\n");
                if (result.sources?.length > 0)
                    ctx +=
                        "\n\nSources:\n" +
                        result.sources
                            .slice(0, 5)
                            .map((s: string) => `• ${s}`)
                            .join("\n");
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

    const gatherContext = useCallback(
        async (message: string) => {
            let ragCtx = "";
            const hasDocuments = rag.documents.length > 0;

            if (hasDocuments) {
                setStreamingContent("⟳ reading your documents...");
                try {
                    ragCtx = await rag.getFileContext(message);
                } catch (e) {
                    logger.error("RAG context failed:", e);
                    try {
                        const chunks = await rag.search(message, 4);
                        if (chunks.length > 0) {
                            ragCtx = chunks
                                .filter((c: string) => c && c.trim().length > 20)
                                .map((c: string, i: number) => `[Doc ${i + 1}] ${c.trim()}`)
                                .join("\n\n");
                        }
                    } catch {
                        /* silently continue without RAG */
                    }
                }
            }

            const memCtx = memoryEnabled ? memory.getContext(message) : "";

            let searchCtx = "";
            if (deepSearchEnabled) {
                setStreamingContent("⟳ searching the web...");
                try {
                    const result = await deepSearch.search(message);
                    if (result && !result.noUsefulResults) {
                        const isSmall = providerCtx?.provider === "browser" || providerCtx?.provider === "chrome-ai";
                        const maxPieces = isSmall ? 2 : 4;
                        const maxChars = isSmall ? 400 : 900;
                        const searchQuery =
                            result.refinedQuery && result.refinedQuery !== message ? result.refinedQuery : message;

                        // Build clean numbered citations — LLM synthesizes, doesn't regurgitate
                        const pieces: string[] = [];

                        // Add instant answer if available (DDG Quick Answer)
                        if (result.summary) {
                            pieces.push(`Quick Answer: ${result.summary.slice(0, maxChars)}`);
                        }

                        const contents = (result.content || [])
                            .map((c: string) =>
                                c
                                    .replace(/^\[Source:[^\]]+\]\n?/gm, "")
                                    .replace(/^\[Instant Answer\]\n?/gm, "")
                                    .trim()
                            )
                            .filter((c: string) => c.length > 40)
                            .slice(0, maxPieces);

                        contents.forEach((c: string, i: number) => {
                            const host = safeHostname(result.sources?.[i]);
                            const src = host ? ` (${host})` : "";
                            pieces.push(`[${i + 1}]${src}\n${c.slice(0, maxChars)}${c.length > maxChars ? "..." : ""}`);
                        });

                        if (pieces.length > 0) {
                            searchCtx = `SEARCH RESULTS for "${message}"${searchQuery !== message ? ` (refined query: "${searchQuery}")` : ""}:\n\n${pieces.join("\n\n")}\n\nUse the numbered search results above for current facts. If the user asks what is "most used" or "most popular", distinguish consumer app usage from API/developer token usage. If search results contain only benchmark rankings (no usage/traffic data), acknowledge this limitation rather than making unsupported usage claims. You may synthesize information from the results but cite sources as [1], [2], etc.`;
                        }

                        // Append source list for reference
                        if (searchCtx && result.sources?.length > 0) {
                            searchCtx += "\n\nSources: " + result.sources.slice(0, maxPieces).join(", ");
                        }
                    }
                } catch (e) {
                    logger.warn("Deep search error (non-fatal):", e);
                }
            }

            return { ragCtx, memCtx, searchCtx, hasDocuments };
        },
        [rag, memoryEnabled, memory, deepSearchEnabled, deepSearch, providerCtx?.provider]
    );

    // ── Helper: Build the message array with context + trimmed history ──
    const buildMessages = useCallback(
        (
            message: string,
            systemContent: string,
            ragCtx: string,
            memCtx: string,
            searchCtx: string
        ): { role: string; content: string }[] => {
            // Cloud/Ollama models have massive context windows — don't strangle them
            // Chrome AI (Gemini Nano) has very small context — be aggressive
            const MAX_CONTEXT_TOKENS =
                providerCtx?.provider === "cloud"
                    ? 30000
                    : providerCtx?.provider === "ollama"
                      ? 12000
                      : providerCtx?.provider === "chrome-ai"
                        ? 2000
                        : 3500; // WebGPU: small models

            // For small models, cap individual context sources to prevent one source from dominating
            const isSmallModel = MAX_CONTEXT_TOKENS <= 3500;
            const maxPerSource = isSmallModel ? 800 : 10000; // chars per context source

            const contextParts: string[] = [];
            if (ragCtx) {
                const fileNames = rag.documents.map(d => d.name).join(", ");
                const cappedRag =
                    ragCtx.length > maxPerSource * 2
                        ? ragCtx.slice(0, maxPerSource * 2) + "\n...[document truncated]"
                        : ragCtx;
                contextParts.push(
                    `## Attached Files: ${fileNames}\nThe user has uploaded documents. Here is the content:\n${cappedRag}\nYou MUST use this document content to answer. Reference the file names when quoting.`
                );
            }
            if (searchCtx.trim()) {
                const cappedSearch =
                    searchCtx.length > maxPerSource
                        ? searchCtx.slice(0, maxPerSource) + "\n...[search results truncated]"
                        : searchCtx;
                contextParts.push(
                    `## Web Search Results\n${cappedSearch.trim()}\nUse these results for an accurate, up-to-date answer. Cite sources.`
                );
            }
            if (memCtx) contextParts.push(`## Memory\n${memCtx}`);

            let userContextBlock =
                contextParts.length > 0
                    ? `[CONTEXT]\n${contextParts.join("\n\n")}\n[END CONTEXT]\n\nBased on the context above, answer the following:\n`
                    : "";

            const systemForModel = `${systemContent.trim()}\n\n${RESPONSE_QUALITY_RULES}`;
            let baseTokens = estimateTokens(systemForModel) + estimateTokens(message);
            if (userContextBlock.length > 0) {
                const ctxTokens = estimateTokens(userContextBlock);
                if (baseTokens + ctxTokens > MAX_CONTEXT_TOKENS) {
                    const safeCharLimit = (MAX_CONTEXT_TOKENS - baseTokens) * CHARS_PER_TOKEN;
                    let truncated = userContextBlock.slice(0, safeCharLimit);

                    // Truncate at sentence/paragraph boundaries to avoid breaking syntax
                    const lastSentence = truncated.lastIndexOf(". ");
                    const lastNewline = truncated.lastIndexOf("\n\n");
                    const cutPoint = Math.max(lastSentence, lastNewline);

                    // Use boundary if it's within 70% of the limit, otherwise hard cut
                    if (cutPoint > safeCharLimit * 0.7) {
                        truncated = truncated.slice(0, cutPoint);
                    }

                    userContextBlock =
                        truncated +
                        "\n\n...[Context truncated to fit memory window]\n\nBased on the context above, answer the following:\n";
                }
                baseTokens += estimateTokens(userContextBlock);
            }

            const msgs: { role: string; content: string }[] = [{ role: "system", content: systemForModel }];
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
        },
        [rag, chatStore, providerCtx?.provider]
    );

    // ── Main send handler ──
    const handleSend = useCallback(
        async (autoMessage?: string) => {
            if (isStreaming) return;
            const message = typeof autoMessage === "string" ? autoMessage : input.trim();
            if (!message) return;
            if (typeof autoMessage !== "string") setInput("");
            trackFirstMessage({
                provider: providerCtx?.provider || "browser",
                deepSearch: deepSearchEnabled,
                hasDocs: rag.documents.length > 0,
                agent: agent.enabled,
            });

            // Route: image generation
            if (IMG_PATTERNS.some(p => p.test(message))) {
                await handleImageGen(message);
                return;
            }

            const requestMeta = getProviderMeta("default", {
                usedSearch: deepSearchEnabled,
                usedDocs: rag.documents.length > 0,
                usedMemory: memoryEnabled,
                agent: agent.enabled,
            });

            if (!activeProviderReady) {
                chatStore.addMessage({ role: "user", content: message, meta: requestMeta });
                const hint =
                    providerCtx?.provider === "browser"
                        ? "Load a model first — pick one from the welcome screen or use the model selector."
                        : providerCtx?.provider === "ollama"
                          ? "Ollama isn't connected. Download it from [ollama.com/download](https://ollama.com/download), run `ollama serve`, then pull a model with `ollama pull llama3.2`. n0x will auto-detect it."
                          : providerCtx?.provider === "cloud"
                            ? "Cloud API key not set. Click the provider button and enter your API key."
                            : providerCtx?.provider === "chrome-ai"
                              ? "Chrome AI is initializing. Please wait a moment and try again."
                              : "No AI provider is ready. Select a provider from the toolbar.";
                chatStore.addMessage({ role: "assistant", content: `⚠️ ${hint}`, meta: requestMeta });
                return;
            }
            chatStore.addMessage({ role: "user", content: message, meta: requestMeta });

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
                    const agentBudget =
                        providerCtx?.provider === "cloud"
                            ? 120_000
                            : providerCtx?.provider === "ollama"
                              ? 48_000
                              : undefined; // use WebLLM's detected limit
                    const finalAnswer = await agent.runLoop(
                        message,
                        buildAgentToolkit(),
                        getGenerateFn(),
                        persona.systemPrompt,
                        onThoughtToken,
                        agentBudget
                    );
                    const agentSteps = useAgent.getState().steps;
                    chatStore.addMessage({
                        role: "assistant",
                        content: finalAnswer,
                        meta: getProviderMeta("default", {
                            usedDocs: rag.documents.length > 0 || agentSteps.some(s => s.tool === "ragSearch"),
                            usedSearch: agentSteps.some(s => s.tool === "webSearch"),
                            usedMemory: memoryEnabled || agentSteps.some(s => s.tool === "memoryRecall"),
                            agent: true,
                        }),
                    });
                    setStreamingContent("");
                    if (tts.isEnabled) tts.speak(finalAnswer);
                } catch (err: any) {
                    logger.error("Agent loop error:", err);
                    setStreamingContent("");
                    chatStore.addMessage({
                        role: "assistant",
                        content: `Agent failed: ${err.message}`,
                        meta: getProviderMeta("default", { agent: true }),
                    });
                    agent.reset();
                }
                return;
            }

            // Route: direct mode
            // AUTO-ROUTE FIRST (before expensive context gathering)
            let generate = getGenerateFn();
            let routeUsed: RouteDecision = "default";

            if (autoRouteEnabled) {
                const localReady =
                    webllm.status === "ready" ||
                    (providerCtx?.provider === "ollama" && providerCtx?.ollama?.isSupported) ||
                    providerCtx?.chromeAI?.status === "ready";
                const cloudReady = !!providerCtx?.cloudAI?.apiKey;

                const route = routeMessage({
                    message,
                    hasDocuments: rag.documents.length > 0,
                    deepSearchEnabled: deepSearchEnabled,
                    conversationLength: chatStore.messages.length,
                    localModelLoaded: localReady,
                    cloudConfigured: cloudReady,
                });

                routeUsed = route.decision;
                setLastRouteDecision(routeUsed);

                if (route.decision !== "default") {
                    const routed = getGenerateFnFor(route.decision);
                    if (routed) generate = routed;
                }
            }

            // NOW gather context (after routing decision is made)
            let ragCtx = "";
            let memCtx = "";
            let searchCtx = "";
            let hasDocuments = false;

            try {
                const context = await gatherContext(message);
                ragCtx = context.ragCtx;
                memCtx = context.memCtx;
                searchCtx = context.searchCtx;
                hasDocuments = context.hasDocuments;
            } catch (ctxErr: any) {
                logger.warn("Context gathering failed (non-fatal):", ctxErr);
                // Continue without context rather than failing completely
            }

            const msgs = buildMessages(message, persona.systemPrompt, ragCtx, memCtx, searchCtx);

            // Retry logic for transient failures
            let retryCount = 0;
            const MAX_RETRIES = 2;

            while (retryCount <= MAX_RETRIES) {
                try {
                    setStreamingContent("");
                    let full = "";
                    let tokCount = 0;

                    await generate(msgs, (tok: string) => {
                        full += tok;
                        setStreamingContent(full);
                        tokCount++;
                        if (tokCount % 3 === 0) keySoundTick();
                    });

                    // Success - save message and break retry loop
                    chatStore.addMessage({
                        role: "assistant",
                        content: full,
                        meta: getProviderMeta(routeUsed, {
                            usedSearch: Boolean(searchCtx),
                            usedDocs: hasDocuments,
                            usedMemory: Boolean(memCtx),
                        }),
                    });
                    setStreamingContent("");
                    deepSearch.reset();
                    if (hasDocuments) rag.clearPending();

                    // Persistent semantic memory: only save when memory is enabled
                    if (memoryEnabled && full.length > 50 && !full.startsWith("⚠️")) {
                        const summary = `Q: ${message.slice(0, 200)}\nA: ${full.slice(0, 500)}`;
                        const tags = ["chat", "auto"];
                        if (routeUsed === "cloud") tags.push("cloud");
                        if (routeUsed === "local") tags.push("local");
                        if (deepSearchEnabled) tags.push("search");
                        if (hasDocuments) tags.push("rag");
                        try {
                            await memory.saveMemory(summary, tags);
                        } catch (memErr) {
                            logger.warn("Memory save failed (non-fatal):", memErr);
                        }
                    }

                    if (tts.isEnabled) {
                        try {
                            tts.speak(full);
                        } catch (ttsErr) {
                            logger.warn("TTS failed (non-fatal):", ttsErr);
                        }
                    }

                    break; // Success - exit retry loop
                } catch (err: any) {
                    // AbortError means user clicked Stop
                    if (err?.name === "AbortError") {
                        setStreamingContent("");
                        deepSearch.reset();
                        return;
                    }

                    retryCount++;
                    logger.error(`Generation error (attempt ${retryCount}/${MAX_RETRIES + 1}):`, err);

                    // Determine if error is retryable
                    const isNetworkError =
                        err?.message?.includes("fetch") ||
                        err?.message?.includes("network") ||
                        err?.message?.includes("timeout");
                    const isServerError =
                        err?.message?.includes("500") || err?.message?.includes("502") || err?.message?.includes("503");
                    const isRetryable = isNetworkError || isServerError;

                    if (retryCount <= MAX_RETRIES && isRetryable) {
                        // Wait before retry with exponential backoff
                        setStreamingContent(`⟳ Retrying (${retryCount}/${MAX_RETRIES})...`);
                        await new Promise(r => setTimeout(r, 1000 * retryCount));
                        continue;
                    }

                    // Final failure - show user-friendly error
                    let errMsg: string;
                    if (
                        err?.message?.includes("API") ||
                        err?.message?.includes("401") ||
                        err?.message?.includes("403")
                    ) {
                        errMsg = `API error: ${err.message}. Check your API key and endpoint.`;
                    } else if (err?.message?.includes("API key")) {
                        errMsg = `API key required. Please configure your Cloud AI settings.`;
                    } else if (isNetworkError) {
                        errMsg = `Network error: ${err.message}. Check your internet connection and try again.`;
                    } else if (err?.message?.includes("memory") || err?.message?.includes("OOM")) {
                        errMsg = `Out of memory. Try a smaller model or use Cloud API.`;
                    } else {
                        errMsg = err?.message || "Generation failed. Please try again.";
                    }

                    chatStore.addMessage({
                        role: "assistant",
                        content: `⚠️ ${errMsg}`,
                        meta: getProviderMeta(routeUsed, {
                            usedSearch: Boolean(searchCtx),
                            usedDocs: hasDocuments,
                            usedMemory: Boolean(memCtx),
                        }),
                    });
                    setStreamingContent("");
                    deepSearch.reset();
                    break;
                }
            }
        },
        [
            input,
            isStreaming,
            activeProviderReady,
            chatStore,
            deepSearch,
            memory,
            memoryEnabled,
            handleImageGen,
            rag,
            tts,
            persona,
            agent,
            buildAgentToolkit,
            gatherContext,
            buildMessages,
            getGenerateFn,
            getProviderMeta,
            autoRouteEnabled,
            getGenerateFnFor,
            deepSearchEnabled,
            providerCtx,
            webllm.status,
        ]
    );

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
                    role: "assistant",
                    content: prev + "\n\n*[generation stopped]*",
                    meta: getProviderMeta("default", {
                        usedSearch: deepSearchEnabled,
                        usedDocs: rag.documents.length > 0,
                        usedMemory: memoryEnabled,
                        agent: agent.enabled,
                    }),
                });
            }
            return "";
        });
        setGeneratingImage(false);
    }, [
        webllm,
        deepSearch,
        chatStore,
        agent,
        providerCtx,
        getProviderMeta,
        deepSearchEnabled,
        rag.documents.length,
        memoryEnabled,
    ]);

    const handleNewChat = useCallback(() => {
        chatStore.newConversation();
        setStreamingContent("");
        deepSearch.reset();
    }, [chatStore, deepSearch]);

    const runPython = useCallback(
        async (code: string, _isSelfHeal = false) => {
            if (!pyodide.isReady) await pyodide.load();
            const res = await pyodide.run(code);

            // Self-Healing — only attempt once to avoid infinite error loops
            if (res.error && !_isSelfHeal) {
                const errorMsg = `Code Execution Failed:\n\`\`\`text\n${res.error}\n\`\`\`\nPlease fix the code and try again.`;
                handleSend(errorMsg);
            }

            return res;
        },
        [pyodide, handleSend]
    );

    return {
        input,
        setInput,
        streamingContent,
        isStreaming,
        generatingImage,
        imageProgress,
        deepSearchEnabled,
        setDeepSearchEnabled,
        memoryEnabled,
        setMemoryEnabled,
        autoRouteEnabled,
        setAutoRouteEnabled,
        lastRouteDecision,

        webllm,
        deepSearch,
        memory,
        pyodide,
        tts,
        rag,
        chatStore,
        persona,
        agent,

        handleSend,
        handleNewChat,
        handleStop,
        handlePythonRun: runPython,
    };
}
