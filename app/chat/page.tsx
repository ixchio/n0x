"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import {
    ChevronDown,
    Loader2,
    Zap,
    Brain,
    Code,
    Shield,
    Volume2,
    VolumeX,
    Cpu,
    Menu,
    AlertTriangle,
    Download,
    Cloud,
    Server,
    Monitor,
    ImageIcon,
    Search,
    Bot,
    FileText,
    Sparkles,
    Shuffle,
} from "lucide-react";
import { MetricsOverlay } from "@/components/metrics-overlay";
import { Sidebar } from "@/components/sidebar";
import { MessageBubble } from "@/components/message-bubble";
import { ChatInput } from "@/components/chat-input";
import { AgentThinking } from "@/components/agent-thinking";
import { MemoryPanel } from "@/components/memory-panel";
import { WEBLLM_MODELS, MODEL_CATEGORIES } from "@/lib/useWebLLM";
import { useOllama } from "@/lib/useOllama";
import { useCloudAI } from "@/lib/useCloudAI";
import { useChromeAI } from "@/lib/useChromeAI";
import { getTotalTokens } from "@/lib/useWebLLM";
import { cn } from "@/lib/utils";
import { CommandMenu } from "@/components/command-menu";
import { ErrorBoundary } from "@/components/error-boundary";
import { PersonaSelector } from "@/components/persona-selector";
import { ShareMenu } from "@/components/share-menu";
import { useChat } from "@/lib/useChat";
import { useSTT } from "@/lib/useSTT";
import { AgentTrace } from "@/components/agent-trace";
import { Onboarding } from "@/components/onboarding";
import { trackFunnelEvent } from "@/lib/analytics";

type AIProvider = "browser" | "ollama" | "cloud" | "chrome-ai";

const SAMPLE_DOC = `# N0X Sample Brief

N0X is a local-first AI workstation that runs chat, document search, Python execution, image generation, and memory in one browser tab.

The privacy-first path uses WebGPU for model inference and IndexedDB for conversations, memory, and vector cache. Users can also switch to Ollama or an OpenAI-compatible cloud endpoint when they need stronger models or larger context windows.

Best-fit workflows:
- Ask questions over PDFs or notes without creating an account.
- Search and summarize public web information with citations.
- Run small Python snippets in a WASM sandbox.
- Keep sensitive documents local by using the Browser provider and leaving Cloud API disabled.

Known tradeoffs:
- First model download can take time.
- Large local models need strong GPU memory.
- Deep Search depends on third-party search providers.
- Cloud API sends selected context to the configured provider.
`;

function ChatPageInner() {
    const [provider, _setProvider] = useState<AIProvider>(() => {
        if (typeof window === "undefined") return "browser";
        const saved = localStorage.getItem("n0x-provider") as AIProvider | null;
        return saved && ["browser", "ollama", "cloud", "chrome-ai"].includes(saved) ? saved : "browser";
    });
    const setProvider = useCallback((p: AIProvider) => {
        _setProvider(p);
        localStorage.setItem("n0x-provider", p);
        trackFunnelEvent("provider_selected", { provider: p });
    }, []);
    const [ollamaUrl, setOllamaUrl] = useState(() => {
        if (typeof window === "undefined") return "http://localhost:11434";
        return localStorage.getItem("n0x-ollama-url") || "http://localhost:11434";
    });
    const [cloudApiKey, setCloudApiKey] = useState(() => useCloudAI.getState().apiKey || "");
    const [cloudBaseUrl, setCloudBaseUrl] = useState(
        () => useCloudAI.getState().baseUrl || "https://api.groq.com/openai/v1"
    );

    const ollama = useOllama();
    const cloudAI = useCloudAI();
    const chromeAI = useChromeAI();

    const chat = useChat({ provider, ollama, cloudAI, chromeAI });
    const {
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
        handlePythonRun,
    } = chat;
    const stt = useSTT();

    // Detect STT support on client side (after hydration)
    useEffect(() => {
        if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
            useSTT.setState({ isSupported: true });
        }
    }, []);

    const [headerModelOpen, setHeaderModelOpen] = useState(false);
    // Default sidebar closed on mobile (<768px), open on desktop
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        if (typeof window === "undefined") return true;
        return window.innerWidth >= 768;
    });

    // Sync sidebar state with viewport resizes (desktop ↔ mobile)
    useEffect(() => {
        const mq = window.matchMedia("(min-width: 768px)");
        const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    const [showMemoryPanel, setShowMemoryPanel] = useState(false);
    const [showMetrics, setShowMetrics] = useState(false);
    const [isExploding, setIsExploding] = useState(false);
    const [pyEnabled, setPyEnabled] = useState(false);
    const [providerMenuOpen, setProviderMenuOpen] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const userScrolledUpRef = useRef(false);

    const DEFAULT_MODEL = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

    // Auto-load smallest model on first visit + check Chrome AI
    useEffect(() => {
        trackFunnelEvent("visit", { page: "chat" });
        webllm.init();
        chromeAI.init();
        tts.init();
        // Provider stores are Zustand objects; this boot effect is intentionally once per mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Poll Ollama when selected — auto-detect when user starts the server
    useEffect(() => {
        if (provider === "ollama") {
            ollama.setBaseUrl(ollamaUrl); // ensure persisted URL is used
            ollama.startPolling();
            return () => ollama.stopPolling();
        }
        // Ollama polling should only follow provider switches; URL changes are applied by setBaseUrl.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider]);

    // Initialize Cloud AI when cloud provider is selected
    useEffect(() => {
        if (provider === "cloud") {
            cloudAI.init();
        }
        // Cloud init should only follow provider switches; credentials changes call fetchModels separately.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider]);

    // Auto-scroll
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (el && !userScrolledUpRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [chatStore.messages, streamingContent, deepSearch.phase, deepSearch.streamingText]);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const handleScroll = () => {
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            userScrolledUpRef.current = distanceFromBottom > 150;
        };
        el.addEventListener("scroll", handleScroll, { passive: true });
        return () => el.removeEventListener("scroll", handleScroll);
    }, []);

    const handleModelChange = useCallback(
        async (modelId: string) => {
            setHeaderModelOpen(false);
            if (webllm.loadedModel !== modelId) {
                await webllm.loadModel(modelId);
            }
        },
        [webllm]
    );

    const handleSampleDocDemo = useCallback(async () => {
        const sample = new File([SAMPLE_DOC], "n0x-sample-private-ai.md", { type: "text/markdown" });
        await rag.addFile(sample);
        if (provider === "browser" && webllm.status === "unloaded") {
            await webllm.loadModel("SmolLM2-360M-Instruct-q4f16_1-MLC");
        }
        setInput("Summarize the attached sample brief in 5 bullets and list the privacy tradeoffs.");
    }, [provider, rag, setInput, webllm]);

    const onNewChat = useCallback(() => {
        setIsExploding(true);
        setTimeout(() => {
            handleNewChat();
            setIsExploding(false);
        }, 400);
    }, [handleNewChat]);

    // Global keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Don't capture when typing in inputs
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                setShowShortcuts(s => !s);
            }
            if (e.key === "n" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
                e.preventDefault();
                onNewChat();
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onNewChat]);

    return (
        <div className="h-screen flex bg-background font-sans overflow-hidden text-foreground selection:bg-white/20">
            <Onboarding onComplete={() => {}} chromeAIAvailable={chromeAI.isSupported} />
            <CommandMenu
                onLoadModel={handleModelChange}
                onNewChat={onNewChat}
                ttsEnabled={tts.isEnabled}
                onToggleTTS={() => tts.setEnabled(!tts.isEnabled)}
                ragEnabled={rag.ragEnabled}
                onToggleRAG={rag.toggle}
            />
            <Sidebar
                isOpen={sidebarOpen}
                currentModel={webllm.loadedModel}
                provider={provider}
                onClose={() => setSidebarOpen(false)}
                onNewChat={onNewChat}
                conversations={chatStore.conversations}
                activeId={chatStore.activeId}
                onSwitch={id => {
                    if (isStreaming) handleStop();
                    chatStore.switchConversation(id);
                }}
                onDelete={chatStore.deleteConversation}
            />

            <main className="flex-1 flex flex-col min-w-0 relative">
                <MetricsOverlay
                    tps={
                        provider === "ollama"
                            ? ollama.stats?.tps || 0
                            : provider === "cloud"
                              ? cloudAI.stats?.tps || 0
                              : webllm.stats?.tps || 0
                    }
                    modelName={
                        provider === "ollama"
                            ? ollama.loadedModel || "Ollama"
                            : provider === "cloud"
                              ? cloudAI.loadedModel || "Cloud API"
                              : provider === "chrome-ai"
                                ? "Chrome AI"
                                : WEBLLM_MODELS.find(m => m.id === webllm.loadedModel)?.label ||
                                  webllm.loadedModel ||
                                  ""
                    }
                    isLoaded={
                        provider === "ollama"
                            ? ollama.isSupported
                            : provider === "cloud"
                              ? !!cloudAI.apiKey
                              : provider === "chrome-ai"
                                ? chromeAI?.status === "ready"
                                : webllm.status === "ready"
                    }
                    isLoading={provider === "browser" && webllm.status === "loading"}
                    progress={webllm.loadProgress}
                    isOpen={showMetrics}
                    onToggle={() => setShowMetrics(!showMetrics)}
                />
                {/* Header */}
                <header className="h-14 border-b border-border flex items-center px-4 shrink-0 bg-background/50 backdrop-blur-md sticky top-0 z-40">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="mr-3 text-txt-tertiary hover:text-phosphor transition-colors"
                    >
                        <Menu className="w-4 h-4" />
                    </button>

                    {/* Model selector */}
                    <div className="relative">
                        <button
                            onClick={() => setHeaderModelOpen(!headerModelOpen)}
                            className="flex items-center gap-2 text-xs font-mono text-txt-secondary hover:text-phosphor transition-colors"
                        >
                            <Cpu className="w-3.5 h-3.5" />
                            <span>
                                {provider === "browser"
                                    ? WEBLLM_MODELS.find(m => m.id === webllm.loadedModel)?.label || "Select model"
                                    : provider === "ollama"
                                      ? ollama.loadedModel || "Ollama"
                                      : provider === "cloud"
                                        ? cloudAI.loadedModel || "Cloud API"
                                        : provider === "chrome-ai"
                                          ? "Chrome AI"
                                          : "Select model"}
                            </span>
                            <ChevronDown
                                className={cn(
                                    "w-3 h-3 opacity-40 transition-transform",
                                    headerModelOpen && "rotate-180"
                                )}
                            />
                        </button>

                        {headerModelOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setHeaderModelOpen(false)} />
                                <div className="absolute top-full left-0 mt-2 w-72 max-h-[70vh] overflow-y-auto bg-card border border-border shadow-xl rounded-xl z-50 no-scrollbar p-1">
                                    {provider === "cloud" ? (
                                        <div className="p-1">
                                            <div className="px-2 py-1.5 flex items-center gap-2">
                                                <Cloud className="w-3 h-3 text-blue-400" />
                                                <span className="text-[10px] font-mono text-txt-tertiary uppercase tracking-wider">
                                                    Cloud Models
                                                </span>
                                                {cloudAI.fetchingModels && (
                                                    <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" />
                                                )}
                                            </div>
                                            {cloudAI.models.map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => {
                                                        cloudAI.loadModel(m);
                                                        setHeaderModelOpen(false);
                                                    }}
                                                    className={cn(
                                                        "w-full flex items-center px-2 py-1.5 rounded text-xs text-left transition-all font-mono",
                                                        cloudAI.loadedModel === m
                                                            ? "bg-zinc-800 text-white border border-zinc-700 font-semibold"
                                                            : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                                    )}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    ) : provider === "ollama" ? (
                                        <div className="p-1">
                                            <div className="px-2 py-1.5 flex items-center gap-2">
                                                <Server className="w-3 h-3 text-orange-400" />
                                                <span className="text-[10px] font-mono text-txt-tertiary uppercase tracking-wider">
                                                    Ollama Models
                                                </span>
                                            </div>
                                            {ollama.models.map(m => (
                                                <button
                                                    key={m.name}
                                                    onClick={() => {
                                                        ollama.loadModel(m.name);
                                                        setHeaderModelOpen(false);
                                                    }}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-all font-mono",
                                                        ollama.loadedModel === m.name
                                                            ? "bg-zinc-800 text-white border border-zinc-700 font-semibold"
                                                            : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                                    )}
                                                >
                                                    <span>{m.name}</span>
                                                    <span className="text-[10px] text-txt-tertiary">
                                                        {(m.size / 1e9).toFixed(1)}GB
                                                    </span>
                                                </button>
                                            ))}
                                            {ollama.models.length === 0 && (
                                                <div className="px-2 py-3 text-[10px] text-zinc-500 text-center">
                                                    No models found
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        Object.entries(MODEL_CATEGORIES).map(([key, cat]) => {
                                            const models = WEBLLM_MODELS.filter(m => m.category === key);
                                            if (models.length === 0) return null;
                                            return (
                                                <div key={key} className="p-1">
                                                    <div className="px-2 py-1.5 flex items-center gap-2">
                                                        {key === "fast" && <Zap className="w-3 h-3 text-neon-amber" />}
                                                        {key === "balanced" && (
                                                            <Cpu className="w-3 h-3 text-neon-cyan" />
                                                        )}
                                                        {key === "powerful" && (
                                                            <Brain className="w-3 h-3 text-neon-magenta" />
                                                        )}
                                                        {key === "coding" && <Code className="w-3 h-3 text-phosphor" />}
                                                        {key === "uncensored" && (
                                                            <Shield className="w-3 h-3 text-neon-pink" />
                                                        )}
                                                        <span className="text-[10px] font-mono text-txt-tertiary uppercase tracking-wider">
                                                            {cat.label}
                                                        </span>
                                                    </div>
                                                    {models.map(m => (
                                                        <button
                                                            key={m.id}
                                                            onClick={() => handleModelChange(m.id)}
                                                            disabled={!webllm.isSupported}
                                                            className={cn(
                                                                "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-all font-mono",
                                                                webllm.loadedModel === m.id
                                                                    ? "bg-zinc-800 text-white border border-zinc-700 font-semibold"
                                                                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                                            )}
                                                        >
                                                            <div>
                                                                <div>{m.label}</div>
                                                                <div className="text-[10px] text-txt-tertiary">
                                                                    {m.desc}
                                                                </div>
                                                            </div>
                                                            <span className="text-[10px] text-txt-tertiary">
                                                                {m.size}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Provider switcher */}
                    <div className="relative ml-2">
                        <button
                            onClick={() => setProviderMenuOpen(!providerMenuOpen)}
                            className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono transition-all border",
                                provider === "browser"
                                    ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                                    : provider === "chrome-ai"
                                      ? "text-purple-400 border-purple-500/20 bg-purple-500/5"
                                      : provider === "ollama"
                                        ? "text-orange-400 border-orange-500/20 bg-orange-500/5"
                                        : "text-blue-400 border-blue-500/20 bg-blue-500/5"
                            )}
                        >
                            {provider === "browser" && <Monitor className="w-3 h-3" />}
                            {provider === "chrome-ai" && <Sparkles className="w-3 h-3" />}
                            {provider === "ollama" && <Server className="w-3 h-3" />}
                            {provider === "cloud" && <Cloud className="w-3 h-3" />}
                            {provider === "browser"
                                ? "WebGPU"
                                : provider === "chrome-ai"
                                  ? "Chrome AI"
                                  : provider === "ollama"
                                    ? "Ollama"
                                    : "Cloud"}
                        </button>

                        {providerMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setProviderMenuOpen(false)} />
                                <div className="absolute top-full left-0 mt-2 w-64 bg-card border border-border shadow-xl rounded-xl z-50 p-2 space-y-1">
                                    <button
                                        onClick={() => {
                                            setProvider("browser");
                                            setProviderMenuOpen(false);
                                        }}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-left transition-all",
                                            provider === "browser"
                                                ? "bg-emerald-500/10 border border-emerald-500/20 text-white"
                                                : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                        )}
                                    >
                                        <Monitor className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <div>
                                            <div className="font-semibold">Browser (WebGPU)</div>
                                            <div className="text-[10px] text-zinc-500">
                                                Runs in your browser — zero server, max privacy
                                            </div>
                                        </div>
                                    </button>
                                    {chromeAI.isSupported && (
                                        <button
                                            onClick={() => {
                                                setProvider("chrome-ai");
                                                setProviderMenuOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-left transition-all",
                                                provider === "chrome-ai"
                                                    ? "bg-purple-500/10 border border-purple-500/20 text-white"
                                                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                            )}
                                        >
                                            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                                            <div>
                                                <div className="font-semibold">
                                                    Chrome AI{" "}
                                                    <span className="text-[9px] text-purple-400 font-mono ml-1">
                                                        INSTANT
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-zinc-500">
                                                    Gemini Nano — zero download, on-device
                                                </div>
                                                {chromeAI.status === "ready" && (
                                                    <div className="text-[10px] text-emerald-400 mt-0.5">✓ Ready</div>
                                                )}
                                            </div>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setProvider("ollama");
                                            setProviderMenuOpen(false);
                                            ollama.setBaseUrl(ollamaUrl);
                                        }}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-left transition-all",
                                            provider === "ollama"
                                                ? "bg-orange-500/10 border border-orange-500/20 text-white"
                                                : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                        )}
                                    >
                                        <Server className="w-4 h-4 text-orange-400 shrink-0" />
                                        <div>
                                            <div className="font-semibold">Ollama (Local)</div>
                                            <div className="text-[10px] text-zinc-500">
                                                Use any model from your Ollama server
                                            </div>
                                            {provider === "ollama" && ollama.isSupported && (
                                                <div className="text-[10px] text-emerald-400 mt-0.5">
                                                    ✓ Connected · {ollama.models.length} models
                                                </div>
                                            )}
                                            {provider === "ollama" && !ollama.isSupported && ollama.error && (
                                                <div className="text-[10px] text-red-400 mt-0.5">{ollama.error}</div>
                                            )}
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setProvider("cloud");
                                            setProviderMenuOpen(false);
                                        }}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-left transition-all",
                                            provider === "cloud"
                                                ? "bg-blue-500/10 border border-blue-500/20 text-white"
                                                : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                        )}
                                    >
                                        <Cloud className="w-4 h-4 text-blue-400 shrink-0" />
                                        <div>
                                            <div className="font-semibold">Cloud API</div>
                                            <div className="text-[10px] text-zinc-500">
                                                Groq, OpenRouter, or any OpenAI-compatible API
                                            </div>
                                        </div>
                                    </button>

                                    {/* Ollama URL config */}
                                    {provider === "ollama" && (
                                        <div className="pt-2 border-t border-zinc-800 mt-2">
                                            <label className="text-[10px] text-zinc-500 font-mono px-1">
                                                Ollama URL
                                            </label>
                                            <input
                                                type="text"
                                                value={ollamaUrl}
                                                onChange={e => {
                                                    setOllamaUrl(e.target.value);
                                                    ollama.setBaseUrl(e.target.value);
                                                    try {
                                                        localStorage.setItem("n0x-ollama-url", e.target.value);
                                                    } catch {}
                                                }}
                                                className="w-full mt-1 px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 focus:border-orange-500/30 outline-none"
                                                placeholder="http://localhost:11434"
                                            />
                                        </div>
                                    )}

                                    {/* Cloud API config */}
                                    {provider === "cloud" && (
                                        <div className="pt-2 border-t border-zinc-800 mt-2 space-y-2">
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] text-zinc-500 font-mono px-1">
                                                        API Key
                                                    </label>
                                                    <a
                                                        href="https://console.groq.com/keys"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[9px] text-blue-400 hover:text-blue-300 font-mono px-1 underline underline-offset-2"
                                                    >
                                                        Get free key (Groq) →
                                                    </a>
                                                </div>
                                                <input
                                                    type="password"
                                                    value={cloudApiKey}
                                                    onChange={e => {
                                                        setCloudApiKey(e.target.value);
                                                        cloudAI.setCredentials(cloudBaseUrl, e.target.value);
                                                    }}
                                                    className="w-full mt-1 px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 focus:border-blue-500/30 outline-none"
                                                    placeholder="sk-..."
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-zinc-500 font-mono px-1">
                                                    Base URL
                                                </label>
                                                <input
                                                    type="text"
                                                    value={cloudBaseUrl}
                                                    onChange={e => {
                                                        setCloudBaseUrl(e.target.value);
                                                        cloudAI.setCredentials(e.target.value, cloudApiKey);
                                                    }}
                                                    className="w-full mt-1 px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 focus:border-blue-500/30 outline-none"
                                                    placeholder="https://api.groq.com/openai/v1"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-zinc-500 font-mono px-1 flex items-center gap-1">
                                                    Model
                                                    {cloudAI.fetchingModels && (
                                                        <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" />
                                                    )}
                                                </label>
                                                <select
                                                    value={cloudAI.loadedModel || ""}
                                                    onChange={e => cloudAI.loadModel(e.target.value)}
                                                    className="w-full mt-1 px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 focus:border-blue-500/30 outline-none appearance-none cursor-pointer"
                                                >
                                                    {cloudAI.models.map(m => (
                                                        <option key={m} value={m}>
                                                            {m}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            {cloudAI.apiKey && (
                                                <button
                                                    onClick={() => cloudAI.fetchModels()}
                                                    disabled={cloudAI.fetchingModels}
                                                    className="w-full mt-1 px-2 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-mono text-blue-300 hover:bg-blue-500/20 transition-all disabled:opacity-50"
                                                >
                                                    {cloudAI.fetchingModels ? "Fetching…" : "Refresh Models"}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Only hide toolbar during WebGPU model download */}
                    {!(provider === "browser" && webllm.status === "loading") && (
                        <>
                            {/* Persona */}
                            <div className="ml-3">
                                <PersonaSelector compact />
                            </div>

                            {/* TTS */}
                            <button
                                onClick={() => tts.setEnabled(!tts.isEnabled)}
                                className={cn(
                                    "ml-3 p-1 rounded transition-all",
                                    tts.isEnabled ? "text-phosphor" : "text-txt-tertiary hover:text-txt-secondary"
                                )}
                            >
                                {tts.isEnabled ? (
                                    <Volume2 className="w-3.5 h-3.5" />
                                ) : (
                                    <VolumeX className="w-3.5 h-3.5" />
                                )}
                            </button>

                            {/* TPS — provider-aware */}
                            {(() => {
                                const tps =
                                    provider === "ollama"
                                        ? ollama.stats?.tps
                                        : provider === "cloud"
                                          ? cloudAI.stats?.tps
                                          : webllm.stats?.tps;
                                return tps > 0 ? (
                                    <div
                                        className={cn(
                                            "ml-3 font-mono text-[11px] flex items-center gap-1",
                                            tps > 50
                                                ? "text-phosphor text-glow-sm"
                                                : tps > 20
                                                  ? "text-phosphor-dim"
                                                  : "text-txt-tertiary"
                                        )}
                                    >
                                        <Zap className="w-3 h-3" />
                                        {tps} t/s
                                    </div>
                                ) : null;
                            })()}

                            {/* Share */}
                            <div className="ml-3">
                                <ShareMenu
                                    messages={chatStore.messages}
                                    modelName={
                                        provider === "ollama"
                                            ? ollama.loadedModel || "Ollama"
                                            : provider === "cloud"
                                              ? cloudAI.loadedModel || "Cloud API"
                                              : provider === "chrome-ai"
                                                ? "Chrome AI"
                                                : WEBLLM_MODELS.find(m => m.id === webllm.loadedModel)?.label
                                    }
                                />
                            </div>
                        </>
                    )}

                    {/* Loading — show only spinner + progress (WebGPU model download) */}
                    {provider === "browser" && webllm.status === "loading" && (
                        <div className="ml-auto text-[11px] font-mono text-phosphor-dim flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {Math.round(webllm.loadProgress * 100)}%
                        </div>
                    )}

                    <div className="ml-auto text-[10px] text-txt-tertiary font-mono">ctrl+k</div>
                </header>

                {/* Messages */}
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
                    {/* WebGPU unsupported hint is now integrated into the welcome screen */}

                    {/* WebLLM Error Banner — with actionable recovery options */}
                    {provider === "browser" && webllm.error && webllm.status === "error" && (
                        <div className="max-w-lg mx-auto mt-12 mb-6">
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 text-center space-y-4">
                                <AlertTriangle className="w-7 h-7 text-red-400 mx-auto" />
                                <h3 className="text-sm font-mono text-red-400 font-bold">Model Load Failed</h3>
                                <p className="text-xs text-red-300/80 font-mono leading-relaxed max-w-sm mx-auto">
                                    {webllm.error}
                                </p>

                                {/* Recovery actions */}
                                <div className="flex flex-col gap-2 pt-2">
                                    {/* Try a smaller model */}
                                    <button
                                        onClick={() => handleModelChange("SmolLM2-360M-Instruct-q4f16_1-MLC")}
                                        className="w-full px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-mono rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Zap className="w-3.5 h-3.5 text-neon-amber" /> Try SmolLM2 360M (tiny, works
                                        everywhere)
                                    </button>

                                    {/* Switch to Cloud API — the fast path */}
                                    <button
                                        onClick={() => setProvider("cloud")}
                                        className="w-full px-4 py-2.5 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-xs font-mono font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Cloud className="w-3.5 h-3.5" /> Switch to Cloud API (instant, free via Groq)
                                    </button>

                                    {/* Force load (if hardware restricted) */}
                                    {webllm.error.includes("Hardware Restricted") && (
                                        <button
                                            onClick={() => {
                                                const modelToForce =
                                                    webllm.loadingModel ||
                                                    webllm.loadedModel ||
                                                    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
                                                webllm.loadModel(modelToForce, true);
                                            }}
                                            className="px-4 py-2 text-red-400/60 hover:text-red-300 text-[10px] font-mono transition-colors"
                                        >
                                            Force Load Anyway (may crash)
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Loading screen — only show for WebGPU provider */}
                    {provider === "browser" &&
                        webllm.isSupported &&
                        webllm.status === "loading" &&
                        chatStore.messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center">
                                <div className="space-y-6 text-center max-w-sm">
                                    <h2 className="text-xl text-white font-bold tracking-tight">N0X Engine</h2>

                                    {/* Progress bar */}
                                    <div className="w-64 mx-auto">
                                        <div className="h-1.5 bg-crt-surface rounded-full overflow-hidden border border-crt-border">
                                            <div
                                                className="h-full bg-phosphor rounded-full transition-all duration-300 shadow-glow-sm"
                                                style={{ width: `${Math.round(webllm.loadProgress * 100)}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between mt-2">
                                            <span className="text-[10px] text-txt-tertiary font-mono">
                                                downloading{" "}
                                                {WEBLLM_MODELS.find(
                                                    m =>
                                                        m.id ===
                                                        (webllm.loadingModel || webllm.loadedModel || DEFAULT_MODEL)
                                                )?.label || "model"}
                                            </span>
                                            <span className="text-[10px] text-phosphor-dim font-mono">
                                                {Math.round(webllm.loadProgress * 100)}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* Tips + stall warning */}
                                    <div className="space-y-2 pt-2">
                                        {webllm.error ? (
                                            <>
                                                <p className="text-[11px] text-amber-300/80 font-mono">
                                                    ⚠ {webllm.error}
                                                </p>
                                                <div className="flex gap-2 justify-center pt-1">
                                                    <button
                                                        onClick={() =>
                                                            handleModelChange("SmolLM2-360M-Instruct-q4f16_1-MLC")
                                                        }
                                                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] text-zinc-300 font-mono rounded transition-colors"
                                                    >
                                                        Try smaller model
                                                    </button>
                                                    <button
                                                        onClick={() => setProvider("cloud")}
                                                        className="px-3 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/25 text-[10px] text-blue-300 font-mono font-bold rounded transition-colors"
                                                    >
                                                        Switch to Cloud API
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-[11px] text-txt-secondary font-mono">
                                                    first time? this downloads once, then it's instant forever.
                                                </p>
                                                <p className="text-[10px] text-txt-tertiary font-mono">
                                                    the model weights are cached in your browser —<br />
                                                    no server, no account, everything stays on your machine.
                                                </p>
                                                <p className="text-[10px] text-txt-tertiary font-mono opacity-60">
                                                    don't refresh — download will restart
                                                </p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                    {/* Welcome screen (no messages yet) */}
                    {chatStore.messages.length === 0 && !deepSearch.isActive && webllm.status !== "loading" ? (
                        <div className="h-full flex flex-col items-center justify-center">
                            <div className="space-y-6 text-center max-w-md w-full">
                                <h2 className="text-3xl text-white font-bold tracking-tight">N0X</h2>
                                <p className="text-sm text-zinc-400 font-medium mt-2 max-w-xs mx-auto">
                                    {provider === "browser" && !webllm.isSupported
                                        ? "Your browser doesn't support WebGPU yet — switch to Ollama or Cloud below, or try Chrome 113+."
                                        : provider === "browser" && webllm.status === "unloaded"
                                          ? "Select a model to begin. All inference runs locally on your GPU — zero cloud, zero latency."
                                          : provider === "browser" && webllm.status === "ready"
                                            ? "Model loaded. Ask me anything — code, analysis, research. Everything stays on your machine."
                                            : provider === "ollama" && ollama.isSupported
                                              ? `Connected to Ollama · ${ollama.models.length} model${ollama.models.length !== 1 ? "s" : ""} available. Ask me anything.`
                                              : provider === "ollama" && !ollama.isSupported
                                                ? "Can't reach Ollama — make sure it's installed and running on your machine."
                                                : provider === "cloud" && cloudAI.apiKey
                                                  ? `Cloud API ready · ${cloudAI.loadedModel || "no model"}. Ask me anything — fast inference, unlimited context.`
                                                  : provider === "cloud"
                                                    ? "Set your API key to get started — click the Cloud button in the header to configure."
                                                    : provider === "chrome-ai" && chromeAI.status === "ready"
                                                      ? "Chrome AI ready. Ask me anything — instant inference, zero download, fully private."
                                                      : provider === "chrome-ai" && chromeAI.status === "downloading"
                                                        ? "Chrome AI is downloading the Gemini Nano model. This only happens once — please wait."
                                                        : provider === "chrome-ai"
                                                          ? "Chrome AI is initializing. Make sure you're on Chrome 138+ with Gemini Nano enabled."
                                                          : "Ready to go. Ask me anything."}
                                </p>

                                {provider === "browser" && webllm.isSupported && webllm.status === "unloaded" && (
                                    <>
                                        <button
                                            onClick={handleSampleDocDemo}
                                            className="w-full rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-left transition-all hover:border-emerald-400/40 hover:bg-emerald-500/15"
                                        >
                                            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                                                <FileText className="h-4 w-4" />
                                                30-second private docs demo
                                            </div>
                                            <div className="mt-1 text-[11px] leading-relaxed text-emerald-100/60">
                                                Attaches a sample brief, loads the tiny local model, and prepares a
                                                useful first question.
                                            </div>
                                        </button>

                                        <div className="grid grid-cols-3 gap-2 pt-4">
                                            <button
                                                onClick={() => handleModelChange("SmolLM2-360M-Instruct-q4f16_1-MLC")}
                                                className="p-3 rounded bg-crt-surface border border-crt-border hover:border-phosphor-dim transition-all text-left group"
                                            >
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <Zap className="w-3 h-3 text-neon-amber" />
                                                    <span className="text-[11px] text-txt-secondary group-hover:text-phosphor">
                                                        SmolLM2 360M
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-txt-tertiary">ultra-fast · 360MB</div>
                                            </button>

                                            <button
                                                onClick={() =>
                                                    handleModelChange(
                                                        webllm.gpuTier === "low"
                                                            ? "SmolLM2-360M-Instruct-q4f16_1-MLC"
                                                            : "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
                                                    )
                                                }
                                                className="p-3 rounded bg-crt-surface border border-phosphor-dim hover:border-phosphor transition-all text-left group relative"
                                            >
                                                <div className="absolute -top-2 right-2 text-[8px] bg-phosphor text-crt-black px-1.5 py-0.5 rounded font-mono font-bold">
                                                    recommended
                                                </div>
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <Brain className="w-3 h-3 text-neon-cyan" />
                                                    <span className="text-[11px] text-txt-secondary group-hover:text-phosphor">
                                                        {webllm.gpuTier === "low" ? "SmolLM2 360M" : "Qwen 1.5B"}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-txt-tertiary">
                                                    {webllm.gpuTier === "low" ? "safe for your GPU" : "balanced · 1GB"}
                                                </div>
                                            </button>

                                            <button
                                                onClick={() =>
                                                    handleModelChange("Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC")
                                                }
                                                className="p-3 rounded bg-crt-surface border border-crt-border hover:border-phosphor-dim transition-all text-left group"
                                            >
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <Code className="w-3 h-3 text-phosphor" />
                                                    <span className="text-[11px] text-txt-secondary group-hover:text-phosphor">
                                                        Coder 1.5B
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-txt-tertiary">code · 1GB</div>
                                            </button>
                                        </div>

                                        {/* GPU tier hint + alternative provider suggestion */}
                                        {webllm.gpuTier === "low" && (
                                            <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15 text-center">
                                                <p className="text-[10px] text-amber-300/80 font-mono mb-2">
                                                    {webllm.isMobile
                                                        ? "📱 Mobile device — only tiny models work in-browser. For full power, use Cloud API."
                                                        : "⚡ Low GPU memory detected — browser models will be limited."}
                                                </p>
                                                <button
                                                    onClick={() => setProvider("cloud")}
                                                    className="text-[10px] text-blue-400 hover:text-blue-300 font-mono font-bold underline underline-offset-2"
                                                >
                                                    Try Cloud API instead → 70B quality, instant, free via Groq
                                                </button>
                                            </div>
                                        )}
                                        {(webllm.gpuTier === "unknown" || webllm.gpuTier === "medium") && (
                                            <p className="text-[10px] text-zinc-600 font-mono mt-2">
                                                Want faster responses?{" "}
                                                <button
                                                    onClick={() => setProvider("cloud")}
                                                    className="text-blue-400/80 hover:text-blue-300 underline underline-offset-2"
                                                >
                                                    Try Cloud API
                                                </button>{" "}
                                                — instant inference, free tier available.
                                            </p>
                                        )}
                                        {webllm.gpuLabel && (
                                            <p className="text-[9px] text-zinc-700 font-mono mt-1">
                                                Detected: {webllm.gpuLabel}
                                            </p>
                                        )}
                                    </>
                                )}

                                {/* Provider switch when WebGPU unavailable */}
                                {provider === "browser" && !webllm.isSupported && (
                                    <div className="flex flex-col items-center gap-3 pt-4">
                                        <p className="text-xs text-zinc-500">
                                            WebGPU isn't available in this browser. Try another provider:
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setProvider("cloud")}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-xs text-blue-300 font-bold hover:bg-blue-500/25 transition-all"
                                            >
                                                <Cloud className="w-3.5 h-3.5" /> Cloud API (recommended)
                                            </button>
                                            <button
                                                onClick={() => setProvider("ollama")}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300 hover:bg-orange-500/20 transition-all"
                                            >
                                                <Server className="w-3.5 h-3.5" /> Ollama
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Cloud API quick setup on welcome screen */}
                                {provider === "cloud" && !cloudAI.apiKey && (
                                    <div className="flex flex-col items-center gap-3 pt-4 max-w-sm mx-auto">
                                        <div className="w-full rounded-xl bg-blue-500/5 border border-blue-500/15 p-4 space-y-3 text-left">
                                            <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold">
                                                <Cloud className="w-3.5 h-3.5" />
                                                Quick setup — 30 seconds:
                                            </div>
                                            <ol className="text-[11px] text-zinc-400 space-y-2 list-decimal list-inside leading-relaxed">
                                                <li>
                                                    Get a free API key from{" "}
                                                    <a
                                                        href="https://console.groq.com/keys"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-300 underline underline-offset-2 hover:text-blue-200 font-bold"
                                                    >
                                                        console.groq.com
                                                    </a>{" "}
                                                    (free tier, no credit card)
                                                </li>
                                                <li>
                                                    Click the <span className="text-blue-300 font-bold">Cloud</span>{" "}
                                                    button in the header ↑
                                                </li>
                                                <li>Paste your key → pick a model → start chatting</li>
                                            </ol>
                                            <div className="pt-2 border-t border-zinc-800/50 text-[10px] text-zinc-500 space-y-1">
                                                <p>
                                                    🚀 <span className="text-zinc-400">Groq</span>: Llama 3.3 70B @ 330
                                                    tok/s — free
                                                </p>
                                                <p>
                                                    🔥 <span className="text-zinc-400">OpenRouter</span>: 200+ models,
                                                    pay-as-you-go
                                                </p>
                                                <p>Works with any OpenAI-compatible endpoint.</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Ollama setup guide — shown when Ollama provider is selected but not reachable */}
                                {provider === "ollama" && !ollama.isSupported && (
                                    <div className="flex flex-col items-center gap-3 pt-4 max-w-sm mx-auto">
                                        <div className="w-full rounded-xl bg-orange-500/5 border border-orange-500/15 p-4 space-y-3 text-left">
                                            <div className="flex items-center gap-2 text-orange-300 text-xs font-semibold">
                                                <Download className="w-3.5 h-3.5" />
                                                Ollama not found — quick setup:
                                            </div>
                                            <ol className="text-[11px] text-zinc-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                                                <li>
                                                    Download from{" "}
                                                    <a
                                                        href="https://ollama.com/download"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-orange-300 underline underline-offset-2 hover:text-orange-200"
                                                    >
                                                        ollama.com/download
                                                    </a>
                                                </li>
                                                <li>
                                                    Install and run:{" "}
                                                    <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] text-zinc-300 font-mono">
                                                        ollama serve
                                                    </code>
                                                </li>
                                                <li>
                                                    Pull a model:{" "}
                                                    <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] text-zinc-300 font-mono">
                                                        ollama pull llama3.2
                                                    </code>
                                                </li>
                                            </ol>
                                            <p className="text-[10px] text-zinc-500">
                                                n0x auto-detects when Ollama starts — no refresh needed.
                                            </p>
                                            {ollama.error && (
                                                <div className="flex items-start gap-1.5 text-[10px] text-red-400/80 pt-1 border-t border-zinc-800">
                                                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                                    <span>{ollama.error}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Suggestion Chips — always visible for image gen, web search, etc. */}
                                <div className="grid grid-cols-2 gap-2 pt-6 max-w-sm mx-auto">
                                    <button
                                        onClick={() => {
                                            setInput("generate an image of ");
                                        }}
                                        className="flex items-center gap-2 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-pink-500/30 hover:bg-zinc-900/80 transition-all text-left group"
                                    >
                                        <ImageIcon className="w-4 h-4 text-pink-400" />
                                        <div>
                                            <div className="text-xs text-zinc-300 font-medium">Generate Image</div>
                                            <div className="text-[10px] text-zinc-600">AI-powered, free</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setDeepSearchEnabled(true);
                                            setInput("search the web for ");
                                        }}
                                        className="flex items-center gap-2 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-blue-500/30 hover:bg-zinc-900/80 transition-all text-left group"
                                    >
                                        <Search className="w-4 h-4 text-blue-400" />
                                        <div>
                                            <div className="text-xs text-zinc-300 font-medium">Web Search</div>
                                            <div className="text-[10px] text-zinc-600">DDG + Wikipedia</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => {
                                            agent.toggle();
                                            setInput("");
                                        }}
                                        className="flex items-center gap-2 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-emerald-500/30 hover:bg-zinc-900/80 transition-all text-left group"
                                    >
                                        <Bot className="w-4 h-4 text-emerald-400" />
                                        <div>
                                            <div className="text-xs text-zinc-300 font-medium">Agent Mode</div>
                                            <div className="text-[10px] text-zinc-600">Autonomous tools</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() =>
                                            document.querySelector<HTMLInputElement>('input[type="file"]')?.click()
                                        }
                                        className="flex items-center gap-2 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-amber-500/30 hover:bg-zinc-900/80 transition-all text-left group"
                                    >
                                        <FileText className="w-4 h-4 text-amber-400" />
                                        <div>
                                            <div className="text-xs text-zinc-300 font-medium">Upload Docs</div>
                                            <div className="text-[10px] text-zinc-600">PDF, DOCX, CSV</div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            className={cn(
                                "max-w-3xl mx-auto space-y-5 transition-all",
                                isExploding && "opacity-0 scale-95"
                            )}
                        >
                            {chatStore.messages.map(msg => (
                                <MessageBubble
                                    key={msg.id}
                                    role={msg.role}
                                    content={msg.content}
                                    image={msg.image}
                                    onRunCode={pyodide.isReady && pyEnabled ? handlePythonRun : undefined}
                                    onBranch={() => {
                                        const newId = chatStore.branchFrom(msg.id);
                                        if (newId) chatStore.switchConversation(newId);
                                    }}
                                />
                            ))}

                            {deepSearch.isActive && (
                                <AgentThinking
                                    phase={deepSearch.phase as any}
                                    query={deepSearch.query}
                                    results={deepSearch.results}
                                    readingUrl={deepSearch.currentUrl}
                                    streamingText={deepSearch.streamingText}
                                    isActive={deepSearch.isActive}
                                />
                            )}

                            {generatingImage && (
                                <div className="flex items-center gap-3 p-3 bg-crt-surface border border-crt-border rounded text-xs font-mono">
                                    <Loader2 className="w-4 h-4 text-phosphor animate-spin" />
                                    <div>
                                        <span className="text-txt-secondary">generating image</span>
                                        {imageProgress.phase && (
                                            <span className="text-txt-tertiary ml-2">· {imageProgress.phase}</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {streamingContent && <MessageBubble role="assistant" content={streamingContent} />}

                            {/* Agent Trace */}
                            {agent.enabled && (agent.steps.length > 0 || agent.status !== "idle") && (
                                <AgentTrace
                                    steps={agent.steps}
                                    status={agent.status}
                                    iteration={agent.currentIteration}
                                    isActive={agent.status !== "idle"}
                                    elapsedMs={agent.elapsedMs}
                                    onAbort={handleStop}
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* Input */}
                <div className="max-w-3xl mx-auto w-full">
                    <ChatInput
                        input={input}
                        setInput={setInput}
                        onSend={() => {
                            if (stt.isListening) stt.stop();
                            handleSend();
                        }}
                        onStop={handleStop}
                        isStreaming={isStreaming}
                        deepSearchEnabled={deepSearchEnabled}
                        toggleDeepSearch={() => setDeepSearchEnabled(!deepSearchEnabled)}
                        memoryEnabled={memoryEnabled}
                        toggleMemory={() => {
                            setMemoryEnabled(!memoryEnabled);
                            if (!memoryEnabled) setShowMemoryPanel(true);
                        }}
                        ragEnabled={rag.ragEnabled}
                        toggleRag={rag.toggle}
                        pyodideReady={pyodide.isReady}
                        pyodideLoading={pyodide.isLoading}
                        pyodideEnabled={pyEnabled}
                        onPyodideLoad={pyodide.load}
                        onPyodideToggle={setPyEnabled}
                        onFileDrop={rag.addFile}
                        attachedFiles={rag.documents.map(d => ({ id: d.id, name: d.name, size: d.size, type: d.type }))}
                        onRemoveFile={id => {
                            rag.removeFile(id);
                        }}
                        agentEnabled={agent.enabled}
                        toggleAgent={agent.toggle}
                        sttSupported={stt.isSupported}
                        sttListening={stt.isListening}
                        onSttToggle={() => {
                            if (stt.isListening) {
                                stt.stop();
                                // Append final transcript to input
                                if (stt.transcript) {
                                    setInput((input ? input + " " : "") + stt.transcript);
                                    stt.clear();
                                }
                            } else {
                                stt.clear();
                                stt.start();
                            }
                        }}
                        onImagePrefill={() => {
                            setInput("generate an image of ");
                        }}
                        autoRouteEnabled={autoRouteEnabled}
                        toggleAutoRoute={() => setAutoRouteEnabled(!autoRouteEnabled)}
                        lastRouteDecision={lastRouteDecision}
                    />
                </div>
            </main>

            <MemoryPanel
                isOpen={showMemoryPanel}
                onClose={() => setShowMemoryPanel(false)}
                memories={memory.memories}
                onSave={memory.saveMemory}
                onDelete={memory.deleteMemory}
                onSearch={memory.searchMemories}
            />

            {/* Keyboard shortcuts overlay */}
            {showShortcuts && (
                <>
                    <div className="fixed inset-0 bg-black/80 z-50" onClick={() => setShowShortcuts(false)} />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-white">Keyboard Shortcuts</h3>
                                <button
                                    onClick={() => setShowShortcuts(false)}
                                    className="text-zinc-500 hover:text-white"
                                >
                                    <span className="text-lg">×</span>
                                </button>
                            </div>
                            <div className="space-y-2 text-xs">
                                {[
                                    ["⌘/Ctrl + K", "Command palette"],
                                    ["⌘/Ctrl + Shift + N", "New conversation"],
                                    ["?", "Toggle this help"],
                                    ["Enter", "Send message"],
                                    ["Shift + Enter", "New line in input"],
                                ].map(([key, desc]) => (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0"
                                    >
                                        <span className="text-zinc-400">{desc}</span>
                                        <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono text-[10px]">
                                            {key}
                                        </kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// Wrap in ErrorBoundary
export default function ChatPage() {
    return (
        <ErrorBoundary>
            <ChatPageInner />
        </ErrorBoundary>
    );
}
