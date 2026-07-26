"use client";

import { useCallback, useRef, useState } from "react";
import { useWebLLM } from "@/lib/providers/useWebLLM";
import { useDeepSearch } from "@/lib/retrieval/useDeepSearch";
import { formatRagEvidence, type RAGSearchResult } from "@/lib/retrieval/rag-evidence";
import { useMemory } from "@/lib/memory/useMemory";
import { usePyodide } from "@/lib/runtime/usePyodide";
import { useTTS } from "@/lib/media/useTTS";
import { useRAG } from "@/lib/retrieval/useRAG";
import { createChatMessageId, type ChatMessageMeta, useChatStore } from "@/lib/chat/useChatStore";
import { useSystemPrompt } from "@/lib/chat/useSystemPrompt";
import { tick as keySoundTick } from "@/lib/media/useKeySound";
import { useAgent, type AgentToolkit } from "@/lib/runtime/useAgent";
import { canExposeAgentPython, requestAgentPythonApproval } from "@/lib/runtime/pythonPermission";
import { requestAgentSearchApproval } from "@/lib/runtime/networkPermission";
import {
    createExecutionPlan,
    createExecutionRequestId,
    executionPlanToMessageMeta,
    getExecutionReadiness,
    isNetworkedEndpoint,
    type ExecutionPlan,
    type TextExecutionProvider,
} from "@/lib/chat/executionPlan";
import {
    createActiveExecutionRuntime,
    createLiveContentScheduler,
    getProviderSnapshot,
    isAbortError,
    isRetryableExecutionError,
    providerUnavailableHint,
    type ActiveExecutionRuntime,
    type GatheredContext,
    type ImageGenProgress,
    type ObservedExecutionSources,
} from "@/lib/chat/executionRuntime";
import { buildExecutionMessages, CHARS_PER_TOKEN } from "@/lib/chat/executionPrompt";
import { imageCaption, imageProviderModel, requestImageGeneration } from "@/lib/chat/imageGeneration";
import { getExecutionRequestOptions, shouldUseDocumentContext } from "@/lib/chat/executionRequest";
import { formatAgentSearchContext, formatDirectSearchContext } from "@/lib/chat/searchContext";
import { type RouteDecision } from "@/lib/chat/useAutoRouter";
import { trackFirstMessage } from "@/lib/core/analytics";
import { logger } from "@/lib/core/logger";

export { buildExecutionMessages, type BuildExecutionMessagesInput } from "@/lib/chat/executionPrompt";

function runtimeMessageMeta(plan: ExecutionPlan, execution: ActiveExecutionRuntime): ChatMessageMeta {
    const observed = execution.observedSources;
    const planned = executionPlanToMessageMeta(plan, observed);
    const providerUsesNetwork =
        plan.provider === "cloud" ||
        plan.provider === "image" ||
        (plan.provider === "ollama" && isNetworkedEndpoint(plan.endpoint));
    const privacy =
        plan.provider === "cloud" || plan.provider === "image"
            ? "cloud"
            : providerUsesNetwork || execution.networkUsed
              ? "mixed"
              : "local";

    return {
        ...planned,
        privacy,
        usedSearch: observed.search,
        usedDocs: observed.documents,
        usedMemory: observed.memory,
        usedPython: observed.python,
        ...(execution.documentEvidence.length > 0
            ? { citations: execution.documentEvidence.map(citation => ({ ...citation })) }
            : {}),
    };
}

export function useChat(providerCtx?: {
    provider: TextExecutionProvider;
    ollama: any;
    cloudAI: any;
    chromeAI?: any;
    pythonEnabled?: boolean;
}) {
    const [input, setInput] = useState("");
    const [streamingContent, setStreamingContent] = useState("");
    const [deepSearchEnabled, setDeepSearchEnabled] = useState(false);
    const [memoryEnabled, setMemoryEnabled] = useState(false);
    const [generatingImage, setGeneratingImage] = useState(false);
    const [imageProgress, setImageProgress] = useState<ImageGenProgress>({ active: false });
    const [autoRouteEnabled, setAutoRouteEnabled] = useState(false);
    const [lastRouteDecision, setLastRouteDecision] = useState<RouteDecision | null>(null);
    const [activeExecutionPlan, setActiveExecutionPlan] = useState<ExecutionPlan | null>(null);
    const [activeExecutionMeta, setActiveExecutionMeta] = useState<ChatMessageMeta | undefined>();
    const activeExecutionRef = useRef<ActiveExecutionRuntime | null>(null);

    const webllm = useWebLLM();
    const deepSearch = useDeepSearch();
    const memory = useMemory();
    const pyodide = usePyodide();
    const tts = useTTS();
    const rag = useRAG();
    const chatStore = useChatStore();
    const persona = useSystemPrompt();
    const agent = useAgent();

    const isCurrentExecution = useCallback((plan: Pick<ExecutionPlan, "requestId">): boolean => {
        return activeExecutionRef.current?.plan.requestId === plan.requestId;
    }, []);

    const setLiveContent = useCallback((plan: Pick<ExecutionPlan, "requestId">, content: string) => {
        const execution = activeExecutionRef.current;
        if (execution?.plan.requestId !== plan.requestId) return;
        execution.liveContent?.schedule(content);
    }, []);

    const flushLiveContent = useCallback((plan: Pick<ExecutionPlan, "requestId">, content?: string) => {
        const execution = activeExecutionRef.current;
        if (execution?.plan.requestId !== plan.requestId) return;
        execution.liveContent?.flush(content);
    }, []);

    const markExecutionSources = useCallback(
        (requestId: string, sources: Partial<ObservedExecutionSources>, options: { networkUsed?: boolean } = {}) => {
            const execution = activeExecutionRef.current;
            if (execution?.plan.requestId !== requestId) return;
            execution.observedSources = { ...execution.observedSources, ...sources };
            if (options.networkUsed) execution.networkUsed = true;
            setActiveExecutionMeta(runtimeMessageMeta(execution.plan, execution));
        },
        []
    );

    const getExecutionMeta = useCallback((plan: ExecutionPlan): ChatMessageMeta => {
        const execution = activeExecutionRef.current;
        let meta: ChatMessageMeta = executionPlanToMessageMeta(plan);
        if (execution?.plan.requestId === plan.requestId) {
            meta = runtimeMessageMeta(plan, execution);
        }
        return meta;
    }, []);

    const recordDocumentEvidence = useCallback((plan: Pick<ExecutionPlan, "requestId">, results: RAGSearchResult[]) => {
        const execution = activeExecutionRef.current;
        if (execution?.plan.requestId !== plan.requestId) return;
        const existing = new Map(
            execution.documentEvidence.map(citation => [`${citation.documentId}:${citation.chunkIndex}`, citation])
        );
        for (const result of results) {
            existing.set(`${result.documentId}:${result.chunkIndex}`, {
                documentId: result.documentId,
                documentName: result.documentName,
                chunkIndex: result.chunkIndex,
                text: result.text,
                relevance: { ...result.relevance },
            });
        }
        execution.documentEvidence = [...existing.values()];
    }, []);

    const finishExecution = useCallback((plan: Pick<ExecutionPlan, "requestId">) => {
        if (activeExecutionRef.current?.plan.requestId !== plan.requestId) return;
        activeExecutionRef.current.liveContent?.cancel();
        activeExecutionRef.current = null;
        setActiveExecutionPlan(current => (current?.requestId === plan.requestId ? null : current));
        setActiveExecutionMeta(current => (current?.requestId === plan.requestId ? undefined : current));
        setStreamingContent("");
    }, []);

    const buildAgentToolkit = useCallback(
        (plan: ExecutionPlan): AgentToolkit => {
            const toolkit: AgentToolkit = {};

            if (plan.sourceFlags.search) {
                toolkit.webSearch = async (query: string, signal?: AbortSignal) => {
                    try {
                        if (!requestAgentSearchApproval(query)) {
                            return "[Permission denied] The search query stayed in this browser.";
                        }
                        if (signal?.aborted) return "[Cancelled]";
                        markExecutionSources(plan.requestId, { search: true }, { networkUsed: true });
                        const result = await deepSearch.search(query, signal);
                        if (!result || result.noUsefulResults) {
                            if (isCurrentExecution(plan)) deepSearch.reset();
                            return "Search returned no relevant sources. Try more specific search terms.";
                        }
                        const context = formatAgentSearchContext(result);
                        if (isCurrentExecution(plan)) deepSearch.reset();
                        return context.trim() || "Search completed but returned no useful content.";
                    } catch (error: any) {
                        if (isCurrentExecution(plan)) deepSearch.reset();
                        return `Search failed: ${error.message}. Try answering from your knowledge.`;
                    }
                };
            }

            if (plan.sourceFlags.documents) {
                toolkit.ragSearch = async (query: string, signal?: AbortSignal) => {
                    markExecutionSources(plan.requestId, { documents: true });
                    try {
                        if (signal?.aborted) return "[Cancelled]";
                        const evidence = await rag.search(query, 4);
                        if (signal?.aborted) return "[Cancelled]";
                        recordDocumentEvidence(plan, evidence);
                        const result = formatRagEvidence(evidence);
                        return signal?.aborted
                            ? "[Cancelled]"
                            : result || "No relevant content found in the uploaded documents.";
                    } catch (error: any) {
                        return `Document search failed: ${error.message}`;
                    }
                };
            }

            if (plan.sourceFlags.python) {
                toolkit.requestPythonApproval = requestAgentPythonApproval;
                toolkit.python = async (code: string, signal?: AbortSignal) => {
                    try {
                        markExecutionSources(plan.requestId, { python: true });
                        const result = await pyodide.run(code, { signal, timeoutMs: 45_000 });
                        if (result.error) return `Python error:\n${result.error}`;
                        return result.output || "(code ran successfully, no output)";
                    } catch (error: any) {
                        return `Python crashed: ${error.message}`;
                    }
                };
            }

            if (plan.sourceFlags.memory && memory.isLoaded) {
                toolkit.memorySave = async (content: string, signal?: AbortSignal) => {
                    try {
                        if (signal?.aborted) return "[Cancelled]";
                        const saved = await memory.saveMemory(content, ["agent"]);
                        if (signal?.aborted) return "[Cancelled]";
                        return saved ? "Saved to memory." : "Failed to save memory.";
                    } catch {
                        return "Failed to save memory.";
                    }
                };
                toolkit.memoryRecall = (query: string) => {
                    markExecutionSources(plan.requestId, { memory: true });
                    return memory.getContext(query) || "No relevant memories found.";
                };
            }

            return toolkit;
        },
        [deepSearch, isCurrentExecution, markExecutionSources, memory, pyodide, rag, recordDocumentEvidence]
    );

    const gatherContext = useCallback(
        async (plan: ExecutionPlan, message: string): Promise<GatheredContext> => {
            let ragCtx = "";
            let documentEvidence: RAGSearchResult[] = [];
            const hasDocuments = plan.sourceFlags.documents;

            if (hasDocuments) {
                markExecutionSources(plan.requestId, { documents: true });
                setLiveContent(plan, "⟳ reading your documents...");
                try {
                    documentEvidence = await rag.search(message, 4);
                    recordDocumentEvidence(plan, documentEvidence);
                    ragCtx = formatRagEvidence(documentEvidence);
                } catch (error) {
                    logger.error("RAG context failed:", error);
                    // Continue without document context.
                }
            }

            const memCtx = plan.sourceFlags.memory ? memory.getContext(message) : "";
            if (memCtx) markExecutionSources(plan.requestId, { memory: true });
            let searchCtx = "";

            if (plan.sourceFlags.search && isCurrentExecution(plan)) {
                setLiveContent(plan, "⟳ searching the web...");
                markExecutionSources(plan.requestId, { search: true }, { networkUsed: true });
                try {
                    const result = await deepSearch.search(message);
                    if (result && !result.noUsefulResults) {
                        searchCtx = formatDirectSearchContext(message, result, plan.contextBudget);
                    }
                } catch (error) {
                    logger.warn("Deep search error (non-fatal):", error);
                }
            }

            return { ragCtx, memCtx, searchCtx, hasDocuments, documentEvidence };
        },
        [deepSearch, isCurrentExecution, markExecutionSources, memory, rag, recordDocumentEvidence, setLiveContent]
    );

    const handleImageGen = useCallback(
        async (plan: ExecutionPlan, prompt: string, signal: AbortSignal) => {
            setGeneratingImage(true);
            setImageProgress({ active: true, phase: "sending to Pollinations..." });
            const meta = getExecutionMeta(plan);
            const messageId = createChatMessageId();
            const execution = activeExecutionRef.current;
            if (execution?.plan.requestId === plan.requestId) execution.assistantMessageId = messageId;
            chatStore.addMessageToConversation(plan.conversationId, {
                id: messageId,
                role: "assistant",
                content: "🎨 Generating image…",
                meta,
            });

            try {
                setImageProgress({ active: true, phase: "generating with Flux…" });
                const data = await requestImageGeneration(prompt, {
                    signal,
                    normalizePrompt: true,
                });
                if (!isCurrentExecution(plan)) return;

                if (data.success && data.image) {
                    const model = imageProviderModel(data.provider);
                    setImageProgress({ active: true, phase: `done · ${model}`, provider: data.provider });
                    chatStore.updateMessageInConversation(plan.conversationId, messageId, {
                        content: `🎨 "${imageCaption(prompt)}"`,
                        image: data.image,
                    });
                } else {
                    chatStore.updateMessageInConversation(plan.conversationId, messageId, {
                        content: `⚠️ Image generation failed: ${data.error || "provider unavailable"}`,
                    });
                }
            } catch (error: any) {
                if (isCurrentExecution(plan)) {
                    chatStore.updateMessageInConversation(plan.conversationId, messageId, {
                        content: isAbortError(error)
                            ? "*[image generation stopped]*"
                            : `⚠️ Image generation failed: ${error.message}`,
                    });
                }
            } finally {
                if (isCurrentExecution(plan)) {
                    setGeneratingImage(false);
                    setImageProgress({ active: false });
                    finishExecution(plan);
                }
            }
        },
        [chatStore, finishExecution, getExecutionMeta, isCurrentExecution]
    );

    const isStreaming =
        activeExecutionPlan !== null ||
        webllm.status === "generating" ||
        providerCtx?.ollama?.status === "generating" ||
        providerCtx?.cloudAI?.status === "generating" ||
        providerCtx?.chromeAI?.status === "generating" ||
        deepSearch.isActive ||
        generatingImage ||
        agent.status === "thinking" ||
        agent.status === "acting";

    const handleSend = useCallback(
        async (autoMessage?: string) => {
            if (activeExecutionRef.current) return;
            const message = typeof autoMessage === "string" ? autoMessage : input.trim();
            if (!message) return;
            if (typeof autoMessage !== "string") setInput("");

            const conversationId = chatStore.pinConversation();
            const history = chatStore.getConversationMessages(conversationId);
            const { mode, sourceFlags } = getExecutionRequestOptions({
                message,
                agentEnabled: agent.enabled,
                deepSearchEnabled,
                hasDocuments: shouldUseDocumentContext(rag.ragEnabled, rag.documents.length),
                memoryEnabled,
                pythonEnabled: canExposeAgentPython(providerCtx?.pythonEnabled === true, pyodide.isReady),
            });
            const providers = getProviderSnapshot();

            // Planning (including routing) intentionally precedes readiness and context work.
            const plan = createExecutionPlan({
                requestId: createExecutionRequestId(),
                conversationId,
                message,
                selectedProvider: providerCtx?.provider || "browser",
                providers,
                sourceFlags,
                conversationLength: history.length,
                autoRouteEnabled,
                mode,
            });
            const execution = createActiveExecutionRuntime(plan);
            execution.liveContent = createLiveContentScheduler(content => {
                if (activeExecutionRef.current?.plan.requestId === plan.requestId) setStreamingContent(content);
            });
            activeExecutionRef.current = execution;
            setActiveExecutionPlan(plan);
            setActiveExecutionMeta(runtimeMessageMeta(plan, execution));
            setLastRouteDecision(plan.route);

            trackFirstMessage({
                provider: plan.provider,
                deepSearch: plan.sourceFlags.search,
                hasDocs: plan.sourceFlags.documents,
                agent: plan.sourceFlags.agent,
            });

            const requestMeta = executionPlanToMessageMeta(plan);
            chatStore.addMessageToConversation(plan.conversationId, {
                role: "user",
                content: message,
                meta: requestMeta,
            });

            if (plan.mode === "image") {
                await handleImageGen(plan, message, execution.imageSignal!);
                return;
            }

            const readiness = getExecutionReadiness(plan, providers);
            if (!readiness.ready || !execution.generate) {
                chatStore.addMessageToConversation(plan.conversationId, {
                    role: "assistant",
                    content: `⚠️ ${providerUnavailableHint(plan.provider)}`,
                    meta: requestMeta,
                });
                finishExecution(plan);
                return;
            }

            if (plan.mode === "agent") {
                let streamBuffer = "";
                const onThoughtToken = (token: string) => {
                    if (!isCurrentExecution(plan)) return;
                    if (token === "") {
                        streamBuffer = "";
                        setLiveContent(plan, "🤔 Thinking…");
                    } else {
                        streamBuffer += token;
                        setLiveContent(plan, streamBuffer);
                    }
                };

                try {
                    agent.reset();
                    setLiveContent(plan, "🤖 Agent is working…");
                    const finalAnswer = await agent.runLoop(
                        message,
                        buildAgentToolkit(plan),
                        execution.generate,
                        persona.systemPrompt,
                        onThoughtToken,
                        // ExecutionPlan budgets are tokens; the agent budgets in characters.
                        plan.contextBudget * CHARS_PER_TOKEN
                    );
                    if (!isCurrentExecution(plan)) return;

                    const agentSteps = useAgent.getState().steps;
                    if (agentSteps.some(step => step.tool === "webSearch")) {
                        markExecutionSources(plan.requestId, { search: true }, { networkUsed: true });
                    }
                    if (agentSteps.some(step => step.tool === "ragSearch")) {
                        markExecutionSources(plan.requestId, { documents: true });
                    }
                    if (agentSteps.some(step => step.tool === "memoryRecall")) {
                        markExecutionSources(plan.requestId, { memory: true });
                    }

                    chatStore.addMessageToConversation(plan.conversationId, {
                        role: "assistant",
                        content: finalAnswer,
                        meta: getExecutionMeta(plan),
                    });
                    flushLiveContent(plan, finalAnswer);
                    finishExecution(plan);
                    if (tts.isEnabled) tts.speak(finalAnswer);
                } catch (error: any) {
                    if (!isCurrentExecution(plan) || isAbortError(error)) return;
                    logger.error("Agent loop error:", error);
                    chatStore.addMessageToConversation(plan.conversationId, {
                        role: "assistant",
                        content: `Agent failed: ${error.message}`,
                        meta: getExecutionMeta(plan),
                    });
                    agent.reset();
                    finishExecution(plan);
                }
                return;
            }

            let context: GatheredContext = {
                ragCtx: "",
                memCtx: "",
                searchCtx: "",
                hasDocuments: false,
                documentEvidence: [],
            };
            try {
                context = await gatherContext(plan, message);
            } catch (error) {
                logger.warn("Context gathering failed (non-fatal):", error);
            }
            if (!isCurrentExecution(plan)) return;

            const messages = buildExecutionMessages({
                plan,
                message,
                systemContent: persona.systemPrompt,
                history,
                ragCtx: context.ragCtx,
                memCtx: context.memCtx,
                searchCtx: context.searchCtx,
                fileNames: rag.documents.map(document => document.name),
            });
            const maxRetries = 2;
            let retryCount = 0;

            while (retryCount <= maxRetries && isCurrentExecution(plan)) {
                try {
                    setLiveContent(plan, "");
                    execution.partialContent = "";
                    let tokenCount = 0;
                    const generated = await execution.generate(messages, (token: string) => {
                        if (!isCurrentExecution(plan)) return;
                        execution.partialContent += token;
                        setLiveContent(plan, execution.partialContent);
                        tokenCount += 1;
                        if (tokenCount % 3 === 0) keySoundTick();
                    });
                    if (!isCurrentExecution(plan)) return;
                    const full = execution.partialContent || generated;
                    flushLiveContent(plan, full);
                    const finalizedMeta = getExecutionMeta(plan);

                    chatStore.addMessageToConversation(plan.conversationId, {
                        role: "assistant",
                        content: full,
                        meta: finalizedMeta,
                    });
                    deepSearch.reset();
                    if (context.hasDocuments) rag.clearPending();
                    finishExecution(plan);

                    if (memoryEnabled && full.length > 50 && !full.startsWith("⚠️")) {
                        const summary = `Q: ${message.slice(0, 200)}\nA: ${full.slice(0, 500)}`;
                        const tags = ["chat", "auto", finalizedMeta.privacy || plan.privacy];
                        if (finalizedMeta.usedSearch) tags.push("search");
                        if (context.hasDocuments) tags.push("rag");
                        try {
                            const saved = await memory.saveMemory(summary, tags);
                            if (!saved) logger.warn("Memory auto-save failed: browser storage rejected the write.");
                        } catch (error) {
                            logger.warn("Memory save failed (non-fatal):", error);
                        }
                    }
                    if (tts.isEnabled) {
                        try {
                            tts.speak(full);
                        } catch (error) {
                            logger.warn("TTS failed (non-fatal):", error);
                        }
                    }
                    return;
                } catch (error: any) {
                    if (isAbortError(error) || !isCurrentExecution(plan)) return;
                    retryCount += 1;
                    logger.error(`Generation error (attempt ${retryCount}/${maxRetries + 1}):`, error);
                    const errorMessage = String(error?.message || "");
                    const isNetworkError = /fetch|network|timeout/i.test(errorMessage);

                    if (retryCount <= maxRetries && isRetryableExecutionError(plan, error)) {
                        setLiveContent(plan, `⟳ Retrying (${retryCount}/${maxRetries})...`);
                        await new Promise(resolve => setTimeout(resolve, 1_000 * retryCount));
                        continue;
                    }

                    const friendlyError = /API|401|403/i.test(errorMessage)
                        ? `API error: ${errorMessage}. Check your API key and endpoint.`
                        : /API key/i.test(errorMessage)
                          ? "API key required. Please configure your Cloud AI settings."
                          : isNetworkError
                            ? `Network error: ${errorMessage}. Check your connection and try again.`
                            : /memory|OOM/i.test(errorMessage)
                              ? "Out of memory. Try a smaller model or use Cloud API."
                              : errorMessage || "Generation failed. Please try again.";

                    chatStore.addMessageToConversation(plan.conversationId, {
                        role: "assistant",
                        content: `⚠️ ${friendlyError}`,
                        meta: getExecutionMeta(plan),
                    });
                    deepSearch.reset();
                    finishExecution(plan);
                    return;
                }
            }
        },
        [
            agent,
            autoRouteEnabled,
            buildAgentToolkit,
            chatStore,
            deepSearch,
            deepSearchEnabled,
            finishExecution,
            flushLiveContent,
            gatherContext,
            getExecutionMeta,
            handleImageGen,
            input,
            isCurrentExecution,
            markExecutionSources,
            memory,
            memoryEnabled,
            persona.systemPrompt,
            providerCtx?.provider,
            providerCtx?.pythonEnabled,
            pyodide.isReady,
            rag,
            setLiveContent,
            tts,
        ]
    );

    const handleStop = useCallback(() => {
        const execution = activeExecutionRef.current;
        if (!execution) return;
        execution.stopped = true;
        const { plan } = execution;
        const meta = getExecutionMeta(plan);

        execution.stop();
        flushLiveContent(plan, execution.partialContent);
        if (execution.observedSources.search || deepSearch.isActive) deepSearch.stop();
        if (plan.mode === "agent") agent.abort();

        if (plan.mode === "image" && execution.assistantMessageId) {
            chatStore.updateMessageInConversation(plan.conversationId, execution.assistantMessageId, {
                content: "*[image generation stopped]*",
                meta,
            });
        } else {
            const stoppedContent = execution.partialContent.trim()
                ? `${execution.partialContent}\n\n*[generation stopped]*`
                : plan.mode === "agent"
                  ? "*[agent stopped]*"
                  : "*[generation stopped]*";
            chatStore.addMessageToConversation(plan.conversationId, {
                role: "assistant",
                content: stoppedContent,
                meta,
            });
        }

        setGeneratingImage(false);
        setImageProgress({ active: false });
        finishExecution(plan);
    }, [agent, chatStore, deepSearch, finishExecution, flushLiveContent, getExecutionMeta]);

    const handleNewChat = useCallback(() => {
        if (activeExecutionRef.current) handleStop();
        chatStore.newConversation();
        setStreamingContent("");
        deepSearch.reset();
    }, [chatStore, deepSearch, handleStop]);

    const runPython = useCallback(
        async (code: string, isSelfHeal = false) => {
            if (!pyodide.isReady) await pyodide.load();
            const result = await pyodide.run(code);
            if (result.error && !isSelfHeal) {
                const errorMessage = `Code Execution Failed:\n\`\`\`text\n${result.error}\n\`\`\`\nPlease fix the code and try again.`;
                void handleSend(errorMessage);
            }
            return result;
        },
        [handleSend, pyodide]
    );

    const visibleStreamingContent =
        activeExecutionPlan && activeExecutionPlan.conversationId !== chatStore.activeId ? "" : streamingContent;

    return {
        input,
        setInput,
        streamingContent: visibleStreamingContent,
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
        activeExecutionPlan,
        activeExecutionMeta,

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
