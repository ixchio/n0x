"use client";

import { useRef, useEffect, useCallback, useState } from "react";
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
    Cloud,
    Server,
    Monitor,
    Sparkles,
    MoreHorizontal,
} from "lucide-react";
import { MetricsOverlay } from "@/components/chat/metrics-overlay";
import { Sidebar } from "@/components/layout/sidebar";
import { LazyMessageBubble } from "@/components/chat/lazy-message-bubble";
import { PersistedMessageList } from "@/components/chat/persisted-message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { AgentThinking } from "@/components/chat/agent-thinking";
import { MemoryPanel } from "@/components/chat/memory-panel";
import { WEBLLM_MODELS, MODEL_CATEGORIES, useWebLLM } from "@/lib/providers/useWebLLM";
import { useOllama } from "@/lib/providers/useOllama";
import { useCloudAI } from "@/lib/providers/useCloudAI";
import { useChromeAI } from "@/lib/providers/useChromeAI";
import { cn } from "@/lib/utils";
import { CommandMenu, modelSizeInGB, shouldToggleShortcuts } from "@/components/chat/command-menu";
import { ErrorBoundary } from "@/components/system/error-boundary";
import { PersonaSelector } from "@/components/chat/persona-selector";
import { ShareMenu } from "@/components/chat/share-menu";
import { useChat } from "@/lib/chat/useChat";
import { useSTT } from "@/lib/media/useSTT";
import { AgentTrace } from "@/components/chat/agent-trace";
import { trackFunnelEvent } from "@/lib/core/analytics";
import {
    PrivacyInspector,
    ProviderSetupBanner,
    WorkbenchEmptyState,
    type AIProvider,
    type ProviderSetup,
} from "@/components/chat/workbench/workbench-panels";
import { ModelRuntimeStatus } from "@/components/chat/workbench/model-runtime-status";
import { KeyboardShortcutsDialog } from "@/components/chat/workbench/keyboard-shortcuts-dialog";
import { StorageDurabilityAlert } from "@/components/chat/workbench/storage-durability-alert";
import { useWorkbenchPreferences } from "@/components/chat/workbench/use-workbench-preferences";
import { waitForWebLLMGenerationToSettle } from "@/components/chat/workbench/model-switch";
import { isNetworkedEndpoint } from "@/lib/chat/executionPlan";

const ATTACH_INPUT_ID = "n0x-attach-input";

const SAMPLE_DOC = `# N0X Sample Brief

N0X is a local-first AI workstation that runs chat, document search, Python execution, image generation, and memory in one browser tab.

The privacy-first path uses WebGPU for model inference and IndexedDB for conversations, memory, and vector cache. Users can also switch to Ollama or an OpenAI-compatible cloud endpoint when they need stronger models or larger context windows.

Best-fit workflows:
- Ask questions over PDFs or notes without creating an account.
- Search and summarize public web information with citations.
- Run small Python snippets in a WASM runtime.
- Keep sensitive documents local by using the Browser provider and leaving Cloud API disabled.

Known tradeoffs:
- First model download can take time.
- Large local models need strong GPU memory.
- Deep Search depends on third-party search providers.
- Cloud API sends selected context to the configured provider.
`;

function recommendedModelForDevice(gpuTier: string, isMobile: boolean) {
    if (isMobile || gpuTier === "low") {
        return {
            id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
            label: "SmolLM2 360M",
            reason: "smallest local model; safest for mobile or low-memory GPUs",
        };
    }
    if (gpuTier === "high") {
        return {
            id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
            label: "Qwen 2.5 3B",
            reason: "better quality while still practical for a strong browser GPU",
        };
    }
    return {
        id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
        label: "Qwen 2.5 1.5B",
        reason: "balanced quality and download size for most laptops/desktops",
    };
}

function ChatPageInner() {
    const onProviderSelected = useCallback((provider: AIProvider) => {
        trackFunnelEvent("provider_selected", { provider });
    }, []);
    const {
        provider,
        setProvider: setProviderPreference,
        ollamaUrl,
        setOllamaUrl,
        sidebarOpen,
        setSidebarOpen,
    } = useWorkbenchPreferences({ onProviderSelected });
    const [cloudApiKey, setCloudApiKey] = useState("");
    const [cloudBaseUrl, setCloudBaseUrl] = useState("https://api.groq.com/openai/v1");

    const ollama = useOllama();
    const cloudAI = useCloudAI();
    const chromeAI = useChromeAI();
    const [pyEnabled, setPyEnabled] = useState(false);

    const chat = useChat({ provider, ollama, cloudAI, chromeAI, pythonEnabled: pyEnabled });
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
        activeExecutionMeta,
        webllm,
        deepSearch,
        memory,
        pyodide,
        tts,
        rag,
        chatStore,
        agent,
        handleSend,
        handleNewChat,
        handleStop,
        handlePythonRun,
    } = chat;
    const stt = useSTT();
    const { init: initSTT } = stt;

    const switchProvider = useCallback(
        (nextProvider: AIProvider) => {
            if (nextProvider === "chrome-ai" && chromeAI.status !== "ready") void chromeAI.load();
            if (nextProvider === provider) return;
            if (isStreaming) handleStop();
            if (provider === "browser" && nextProvider !== "browser" && webllm.status === "loading") {
                void webllm.unload();
            }
            setProviderPreference(nextProvider);
        },
        [chromeAI, handleStop, isStreaming, provider, setProviderPreference, webllm]
    );

    // Detect STT support after hydration so the microphone is reachable
    // without requiring an impossible first call to start().
    useEffect(() => {
        initSTT();
    }, [initSTT]);

    const [headerModelOpen, setHeaderModelOpen] = useState(false);

    useEffect(() => {
        setCloudApiKey(cloudAI.apiKey || "");
        setCloudBaseUrl(cloudAI.baseUrl || "https://api.groq.com/openai/v1");
    }, [cloudAI.apiKey, cloudAI.baseUrl]);

    const [showMemoryPanel, setShowMemoryPanel] = useState(false);
    const [showMetrics, setShowMetrics] = useState(false);
    const [providerMenuOpen, setProviderMenuOpen] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showPrivacyInspector, setShowPrivacyInspector] = useState(false);
    const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const userScrolledUpRef = useRef(false);
    const messageCountRef = useRef(chatStore.messages.length);
    const sampleIntentHandledRef = useRef(false);
    messageCountRef.current = chatStore.messages.length;

    const DEFAULT_MODEL = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

    // Probe local capabilities without downloading either model on first visit.
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
            if (chatStore.messages.length === 0 && !streamingContent && !deepSearch.isActive) {
                el.scrollTop = 0;
                return;
            }
            el.scrollTop = el.scrollHeight;
        }
    }, [chatStore.messages, streamingContent, deepSearch.isActive, deepSearch.phase, deepSearch.streamingText]);

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

    useEffect(() => {
        userScrolledUpRef.current = false;
        const frame = requestAnimationFrame(() => {
            const el = scrollContainerRef.current;
            if (!el) return;
            el.scrollTop = messageCountRef.current === 0 ? 0 : el.scrollHeight;
        });
        return () => cancelAnimationFrame(frame);
    }, [chatStore.activeId]);

    const confirmLocalModelLoad = useCallback(
        (modelId: string) => {
            if (!webllm.isMobile || webllm.loadedModel === modelId) return true;
            const model = WEBLLM_MODELS.find(m => m.id === modelId);
            const sizeInGB = modelSizeInGB(model?.size);
            if (sizeInGB <= 2) return true;
            return window.confirm(
                `⚠️ Mobile Device Warning\n\n` +
                    `${model?.label} (${model?.size}) is large for mobile devices.\n\n` +
                    `This may cause your browser to crash or freeze. Consider:\n` +
                    `• Using a smaller model (< 2GB)\n` +
                    `• Switching to Cloud API (free with Groq)\n\n` +
                    `Continue loading this model anyway?`
            );
        },
        [webllm.isMobile, webllm.loadedModel]
    );

    const handleModelChange = useCallback(
        async (modelId: string, skipConfirmation = false) => {
            setHeaderModelOpen(false);
            if (!skipConfirmation && !confirmLocalModelLoad(modelId)) return;

            if (webllm.loadedModel !== modelId) {
                if (isStreaming || useWebLLM.getState().status === "generating") {
                    handleStop();
                    const settled = await waitForWebLLMGenerationToSettle();
                    if (!settled) return;
                }
                await webllm.loadModel(modelId);
            }
        },
        [confirmLocalModelLoad, handleStop, isStreaming, webllm]
    );

    const handleCommandModelChange = useCallback(
        async (modelId: string) => {
            if (!webllm.isSupported || webllm.status === "loading") return;
            if (!confirmLocalModelLoad(modelId)) return;
            // Command-palette models are WebLLM models. Make that provider
            // transition explicit so a local model is never loaded while the
            // workspace badge still says Cloud, Ollama, or Chrome AI.
            if (provider !== "browser") setProviderPreference("browser");
            await handleModelChange(modelId, true);
        },
        [confirmLocalModelLoad, handleModelChange, provider, setProviderPreference, webllm]
    );

    const handleCloudModelChange = useCallback(
        (modelId: string) => {
            if (cloudAI.loadedModel === modelId) return;
            if (isStreaming) handleStop();
            cloudAI.loadModel(modelId);
        },
        [cloudAI, handleStop, isStreaming]
    );

    const handleOllamaModelChange = useCallback(
        (modelId: string) => {
            if (ollama.loadedModel === modelId) return;
            if (isStreaming) handleStop();
            ollama.loadModel(modelId);
        },
        [handleStop, isStreaming, ollama]
    );

    const handleSampleDocDemo = useCallback(async () => {
        const sampleName = "n0x-sample-private-ai.md";
        let attached = rag.documents.some(document => document.name === sampleName);
        if (!rag.documents.some(document => document.name === sampleName)) {
            const sample = new File([SAMPLE_DOC], sampleName, { type: "text/markdown" });
            attached = await rag.addFile(sample);
        }
        if (!attached) return;
        setInput("Which workflows keep sensitive documents local? Answer with filename and chunk citations.");
    }, [rag, setInput]);

    useEffect(() => {
        if (sampleIntentHandledRef.current) return;
        const url = new URL(window.location.href);
        if (url.searchParams.get("sample") !== "1") return;
        sampleIntentHandledRef.current = true;
        url.searchParams.delete("sample");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        void handleSampleDocDemo();
    }, [handleSampleDocDemo]);

    const localModelRecommendation = recommendedModelForDevice(webllm.gpuTier, webllm.isMobile);
    const localModelRecommendationSize =
        WEBLLM_MODELS.find(model => model.id === localModelRecommendation.id)?.size || "model weights";

    const openAttachPicker = useCallback(() => {
        document.getElementById(ATTACH_INPUT_ID)?.click();
    }, []);

    const openCloudSetup = useCallback(() => {
        switchProvider("cloud");
        setHeaderModelOpen(false);
        setMobileControlsOpen(false);
        setShowPrivacyInspector(false);
        setProviderMenuOpen(true);
    }, [switchProvider]);

    const openOllamaSetup = useCallback(() => {
        switchProvider("ollama");
        ollama.setBaseUrl(ollamaUrl);
        setHeaderModelOpen(false);
        setMobileControlsOpen(false);
        setShowPrivacyInspector(false);
        setProviderMenuOpen(true);
    }, [ollama, ollamaUrl, switchProvider]);

    const switchToWebGPU = useCallback(() => {
        switchProvider("browser");
        setHeaderModelOpen(false);
        setProviderMenuOpen(false);
    }, [switchProvider]);

    const loadBestLocalModel = useCallback(() => {
        if (!webllm.isSupported) return;
        switchProvider("browser");
        void handleModelChange(localModelRecommendation.id);
    }, [handleModelChange, localModelRecommendation.id, switchProvider, webllm.isSupported]);

    const startWebSearch = useCallback(() => {
        setDeepSearchEnabled(true);
        setInput("search the web for ");
    }, [setDeepSearchEnabled, setInput]);

    const openPrivacyInspector = useCallback(() => {
        setHeaderModelOpen(false);
        setProviderMenuOpen(false);
        setMobileControlsOpen(false);
        setShowPrivacyInspector(true);
    }, []);
    const closePrivacyInspector = useCallback(() => setShowPrivacyInspector(false), []);
    const closeShortcuts = useCallback(() => setShowShortcuts(false), []);
    const closeSidebar = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

    const branchContextRef = useRef({
        isStreaming,
        handleStop,
        branchFrom: chatStore.branchFrom,
        switchConversation: chatStore.switchConversation,
    });
    branchContextRef.current = {
        isStreaming,
        handleStop,
        branchFrom: chatStore.branchFrom,
        switchConversation: chatStore.switchConversation,
    };

    const handleBranchMessage = useCallback((messageId: string) => {
        const { isStreaming, handleStop, branchFrom, switchConversation } = branchContextRef.current;
        if (isStreaming) handleStop();
        const newId = branchFrom(messageId);
        if (newId) switchConversation(newId);
    }, []);

    const onNewChat = useCallback(() => {
        handleNewChat();
    }, [handleNewChat]);

    useEffect(() => {
        if (!headerModelOpen && !providerMenuOpen && !mobileControlsOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setHeaderModelOpen(false);
            setProviderMenuOpen(false);
            setMobileControlsOpen(false);
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [headerModelOpen, mobileControlsOpen, providerMenuOpen]);

    // Global keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Don't capture when typing in inputs
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
                if (!shouldToggleShortcuts(showShortcuts)) return;
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
    }, [onNewChat, showShortcuts]);

    const activeModelName =
        provider === "ollama"
            ? ollama.loadedModel || "Ollama"
            : provider === "cloud"
              ? cloudAI.loadedModel || "Cloud API"
              : provider === "chrome-ai"
                ? "Gemini Nano"
                : WEBLLM_MODELS.find(m => m.id === webllm.loadedModel)?.label || webllm.loadedModel || "No model";
    const cloudBlockingError =
        cloudAI.apiKey && cloudAI.error && cloudAI.error !== "API Key required for Cloud AI" ? cloudAI.error : null;

    const providerSetup: ProviderSetup | null =
        provider === "cloud" && !cloudAI.apiKey
            ? {
                  title: "Cloud API not configured",
                  detail: "Add a session key or stay local.",
                  tone: "blue",
                  actions: [
                      { label: "Add key", onClick: openCloudSetup, primary: true },
                      { label: "Switch to WebGPU", onClick: switchToWebGPU },
                      { label: "Use Ollama", onClick: openOllamaSetup },
                  ],
              }
            : provider === "cloud" && cloudBlockingError
              ? {
                    title: "Cloud API needs attention",
                    detail: cloudBlockingError,
                    tone: "red",
                    actions: [
                        { label: "Update key", onClick: openCloudSetup, primary: true },
                        { label: "Switch to WebGPU", onClick: switchToWebGPU },
                        { label: "Use Ollama", onClick: openOllamaSetup },
                    ],
                }
              : provider === "browser" && !webllm.isSupported
                ? {
                      title: "WebGPU unavailable",
                      detail: webllm.error || "This browser cannot run local WebGPU models.",
                      tone: "amber",
                      actions: [
                          { label: "Configure cloud", onClick: openCloudSetup, primary: true },
                          { label: "Use Ollama", onClick: openOllamaSetup },
                          { label: "Privacy inspector", onClick: openPrivacyInspector },
                      ],
                  }
                : provider === "ollama" && !ollama.isSupported
                  ? {
                        title: "Ollama unreachable",
                        detail: ollama.error || "Check your configured Ollama endpoint or pick another provider.",
                        tone: "amber",
                        actions: [
                            { label: "Configure Ollama", onClick: openOllamaSetup, primary: true },
                            { label: "Switch to WebGPU", onClick: switchToWebGPU },
                            { label: "Configure cloud", onClick: openCloudSetup },
                        ],
                    }
                  : provider === "chrome-ai" && chromeAI.status !== "ready"
                    ? {
                          title:
                              chromeAI.status === "downloadable"
                                  ? "Chrome AI needs a local model"
                                  : chromeAI.status === "downloading"
                                    ? "Chrome AI downloading"
                                    : "Chrome AI unavailable",
                          detail:
                              chromeAI.error ||
                              (chromeAI.status === "downloadable"
                                  ? "Nothing downloads until you choose Install Gemini Nano."
                                  : chromeAI.status === "downloading"
                                    ? "Gemini Nano is installing in Chrome after your request."
                                    : "Use another provider for this session."),
                          tone: chromeAI.status === "downloading" ? "zinc" : "amber",
                          actions: [
                              ...(chromeAI.status === "downloadable"
                                  ? [
                                        {
                                            label: "Install Gemini Nano",
                                            onClick: () => void chromeAI.load(),
                                            primary: true,
                                        },
                                    ]
                                  : []),
                              {
                                  label: "Switch to WebGPU",
                                  onClick: switchToWebGPU,
                                  primary: chromeAI.status !== "downloadable",
                              },
                              { label: "Use Ollama", onClick: openOllamaSetup },
                              { label: "Configure cloud", onClick: openCloudSetup },
                          ],
                      }
                    : null;

    const activeProviderReady =
        provider === "browser"
            ? webllm.isSupported && webllm.status === "ready"
            : provider === "ollama"
              ? ollama.isSupported && Boolean(ollama.loadedModel)
              : provider === "cloud"
                ? Boolean(cloudAI.apiKey) && !cloudBlockingError
                : chromeAI.status === "ready";

    const emptyWorkbenchVisible =
        chatStore.messages.length === 0 &&
        !deepSearch.isActive &&
        (provider !== "browser" || webllm.status !== "loading");
    return (
        <div className="flex h-[100dvh] bg-background font-sans overflow-hidden text-foreground selection:bg-white/20">
            <CommandMenu
                onLoadModel={handleCommandModelChange}
                browserModelsAvailable={webllm.isSupported && webllm.status !== "loading"}
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
                providerReady={activeProviderReady}
                busy={isStreaming}
                onClose={closeSidebar}
                onNewChat={onNewChat}
                conversations={chatStore.conversations}
                activeId={chatStore.activeId}
                onSwitch={id => {
                    if (isStreaming) handleStop();
                    chatStore.switchConversation(id);
                }}
                onDelete={id => {
                    if (isStreaming && id === chatStore.activeId) handleStop();
                    void chatStore.deleteConversation(id);
                }}
            />

            <main className="flex-1 flex flex-col min-w-0 relative">
                <h1 className="sr-only">N0X local AI workspace</h1>
                <MetricsOverlay
                    provider={provider}
                    tps={
                        provider === "ollama"
                            ? ollama.stats?.tps || 0
                            : provider === "cloud"
                              ? cloudAI.stats?.tps || 0
                              : provider === "browser"
                                ? webllm.stats?.tps || 0
                                : 0
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
                    isLoaded={activeProviderReady}
                    isLoading={provider === "browser" && webllm.status === "loading"}
                    progress={webllm.loadProgress}
                    estimatedTimeRemaining={webllm.loadingStats?.estimatedTimeRemaining}
                    isOpen={showMetrics && !providerSetup && !chatStore.storageError && !memory.storageError}
                    onToggle={() => setShowMetrics(!showMetrics)}
                />
                {/* Header */}
                <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 border-b border-border bg-background/80 px-2 backdrop-blur-md sm:px-3 lg:px-4">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        aria-label={sidebarOpen ? "Close conversation sidebar" : "Open conversation sidebar"}
                        aria-expanded={sidebarOpen}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:mr-1"
                    >
                        <Menu className="w-4 h-4" />
                    </button>

                    {/* Model selector */}
                    <div className="relative min-w-0 flex-1 lg:max-w-[240px] lg:flex-none">
                        <button
                            onClick={() => {
                                if (
                                    provider !== "chrome-ai" &&
                                    !(provider === "browser" && webllm.status === "loading")
                                ) {
                                    const nextOpen = !headerModelOpen;
                                    setHeaderModelOpen(nextOpen);
                                    if (nextOpen) {
                                        setProviderMenuOpen(false);
                                        setMobileControlsOpen(false);
                                        setShowPrivacyInspector(false);
                                    }
                                }
                            }}
                            disabled={
                                provider === "chrome-ai" || (provider === "browser" && webllm.status === "loading")
                            }
                            aria-label={`Select model. Current model: ${activeModelName}`}
                            aria-expanded={headerModelOpen}
                            className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 text-xs font-mono text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-zinc-300 lg:w-auto"
                        >
                            <Cpu className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
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
                                    "h-3 w-3 shrink-0 opacity-60 transition-transform",
                                    headerModelOpen && "rotate-180"
                                )}
                            />
                        </button>

                        {headerModelOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setHeaderModelOpen(false)} />
                                <div
                                    role="region"
                                    data-chat-popover="true"
                                    aria-label="Available models"
                                    className="fixed inset-x-2 top-14 z-50 mt-2 max-h-[70vh] w-auto overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl no-scrollbar sm:absolute sm:left-0 sm:right-auto sm:top-full sm:w-[min(18rem,calc(100vw-1rem))]"
                                >
                                    {provider === "cloud" ? (
                                        <div className="p-1">
                                            <div className="px-2 py-1.5 flex items-center gap-2">
                                                <Cloud className="w-3 h-3 text-blue-400" />
                                                <span className="text-xs font-mono text-txt-tertiary uppercase tracking-wider">
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
                                                        handleCloudModelChange(m);
                                                        setHeaderModelOpen(false);
                                                    }}
                                                    className={cn(
                                                        "flex min-h-11 min-w-0 w-full items-center rounded px-2 py-2 text-left text-xs font-mono transition-all",
                                                        cloudAI.loadedModel === m
                                                            ? "bg-zinc-800 text-white border border-zinc-700 font-semibold"
                                                            : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                                    )}
                                                >
                                                    <span className="min-w-0 truncate" title={m}>
                                                        {m}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : provider === "ollama" ? (
                                        <div className="p-1">
                                            <div className="px-2 py-1.5 flex items-center gap-2">
                                                <Server className="w-3 h-3 text-orange-400" />
                                                <span className="text-xs font-mono text-txt-tertiary uppercase tracking-wider">
                                                    Ollama Models
                                                </span>
                                            </div>
                                            {ollama.models.map(m => (
                                                <button
                                                    key={m.name}
                                                    onClick={() => {
                                                        handleOllamaModelChange(m.name);
                                                        setHeaderModelOpen(false);
                                                    }}
                                                    className={cn(
                                                        "flex min-h-11 min-w-0 w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-xs font-mono transition-all",
                                                        ollama.loadedModel === m.name
                                                            ? "bg-zinc-800 text-white border border-zinc-700 font-semibold"
                                                            : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                                    )}
                                                >
                                                    <span className="min-w-0 flex-1 truncate" title={m.name}>
                                                        {m.name}
                                                    </span>
                                                    <span className="shrink-0 text-xs text-txt-tertiary">
                                                        {(m.size / 1e9).toFixed(1)}GB
                                                    </span>
                                                </button>
                                            ))}
                                            {ollama.models.length === 0 && (
                                                <div className="px-2 py-3 text-center text-xs text-zinc-400">
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
                                                        <span className="text-xs font-mono text-txt-tertiary uppercase tracking-wider">
                                                            {cat.label}
                                                        </span>
                                                    </div>
                                                    {models.map(m => (
                                                        <button
                                                            key={m.id}
                                                            onClick={() => handleModelChange(m.id)}
                                                            disabled={
                                                                !webllm.isSupported || webllm.status === "loading"
                                                            }
                                                            className={cn(
                                                                "flex min-h-11 min-w-0 w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-xs font-mono transition-all",
                                                                webllm.loadedModel === m.id
                                                                    ? "bg-zinc-800 text-white border border-zinc-700 font-semibold"
                                                                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                                            )}
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <div className="truncate" title={m.label}>
                                                                    {m.label}
                                                                </div>
                                                                <div
                                                                    className="truncate text-xs text-txt-tertiary"
                                                                    title={m.desc}
                                                                >
                                                                    {m.desc}
                                                                </div>
                                                            </div>
                                                            <span className="shrink-0 text-xs text-txt-tertiary">
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
                    <div className="relative shrink-0 lg:ml-1">
                        <button
                            onClick={() => {
                                const nextOpen = !providerMenuOpen;
                                setProviderMenuOpen(nextOpen);
                                if (nextOpen) {
                                    setHeaderModelOpen(false);
                                    setMobileControlsOpen(false);
                                    setShowPrivacyInspector(false);
                                }
                            }}
                            aria-label={`Select provider. Current provider: ${provider}`}
                            aria-expanded={providerMenuOpen}
                            className={cn(
                                "flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-mono transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
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
                            <span className="hidden min-[430px]:inline">
                                {provider === "browser"
                                    ? "WebGPU"
                                    : provider === "chrome-ai"
                                      ? "Chrome AI"
                                      : provider === "ollama"
                                        ? "Ollama"
                                        : "Cloud"}
                            </span>
                        </button>

                        {providerMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setProviderMenuOpen(false)} />
                                <div
                                    role="region"
                                    data-chat-popover="true"
                                    aria-label="AI providers"
                                    className="absolute right-0 top-full z-50 mt-2 w-[min(16rem,calc(100vw-1rem))] space-y-1 rounded-xl border border-border bg-card p-2 shadow-xl lg:left-0 lg:right-auto"
                                >
                                    <button
                                        onClick={() => {
                                            switchProvider("browser");
                                            setProviderMenuOpen(false);
                                        }}
                                        className={cn(
                                            "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-all",
                                            provider === "browser"
                                                ? "bg-emerald-500/10 border border-emerald-500/20 text-white"
                                                : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                        )}
                                    >
                                        <Monitor className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <div>
                                            <div className="font-semibold">Browser (WebGPU)</div>
                                            <div className="text-xs text-zinc-400">
                                                Inference runs in this browser; search and auto-routing are separate
                                                paths
                                            </div>
                                        </div>
                                    </button>
                                    {chromeAI.isSupported && (
                                        <button
                                            onClick={() => {
                                                switchProvider("chrome-ai");
                                                setProviderMenuOpen(false);
                                            }}
                                            className={cn(
                                                "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-all",
                                                provider === "chrome-ai"
                                                    ? "bg-purple-500/10 border border-purple-500/20 text-white"
                                                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                            )}
                                        >
                                            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                                            <div>
                                                <div className="font-semibold">
                                                    Chrome AI{" "}
                                                    <span className="text-xs text-purple-400 font-mono ml-1">
                                                        BUILT-IN
                                                    </span>
                                                </div>
                                                <div className="text-xs text-zinc-400">
                                                    On-device when ready. Selecting this provider may ask Chrome to
                                                    install Gemini Nano first
                                                </div>
                                                {chromeAI.status === "ready" && (
                                                    <div className="text-xs text-emerald-400 mt-0.5">✓ Ready</div>
                                                )}
                                            </div>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            switchProvider("ollama");
                                            setProviderMenuOpen(false);
                                            ollama.setBaseUrl(ollamaUrl);
                                        }}
                                        className={cn(
                                            "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-all",
                                            provider === "ollama"
                                                ? "bg-orange-500/10 border border-orange-500/20 text-white"
                                                : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                        )}
                                    >
                                        <Server className="w-4 h-4 text-orange-400 shrink-0" />
                                        <div>
                                            <div className="font-semibold">Ollama</div>
                                            <div className="text-xs text-zinc-400">
                                                {isNetworkedEndpoint(ollamaUrl)
                                                    ? "Remote HTTPS endpoint — prompts and enabled context leave this device"
                                                    : "Localhost endpoint — prompts stay on this device"}
                                            </div>
                                            {provider === "ollama" && ollama.isSupported && (
                                                <div className="text-xs text-emerald-400 mt-0.5">
                                                    ✓ Connected · {ollama.models.length} models
                                                </div>
                                            )}
                                            {provider === "ollama" && !ollama.isSupported && ollama.error && (
                                                <div className="text-xs text-red-400 mt-0.5">{ollama.error}</div>
                                            )}
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => {
                                            switchProvider("cloud");
                                            setProviderMenuOpen(false);
                                        }}
                                        className={cn(
                                            "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-all",
                                            provider === "cloud"
                                                ? "bg-blue-500/10 border border-blue-500/20 text-white"
                                                : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                                        )}
                                    >
                                        <Cloud className="w-4 h-4 text-blue-400 shrink-0" />
                                        <div>
                                            <div className="font-semibold">Cloud API</div>
                                            <div className="text-xs text-zinc-400">
                                                Sends selected prompt/context to your configured provider
                                            </div>
                                        </div>
                                    </button>

                                    {/* Ollama URL config */}
                                    {provider === "ollama" && (
                                        <div className="pt-2 border-t border-zinc-800 mt-2">
                                            <label
                                                htmlFor="ollama-url"
                                                className="px-1 font-mono text-xs text-zinc-400"
                                            >
                                                Ollama URL
                                            </label>
                                            <input
                                                id="ollama-url"
                                                type="text"
                                                value={ollamaUrl}
                                                onChange={e => {
                                                    setOllamaUrl(e.target.value);
                                                    ollama.setBaseUrl(e.target.value);
                                                    try {
                                                        localStorage.setItem("n0x-ollama-url", e.target.value);
                                                    } catch {}
                                                }}
                                                className="mt-1 min-h-11 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-orange-500/30 focus-visible:ring-2 focus-visible:ring-white"
                                                placeholder="http://localhost:11434"
                                            />
                                        </div>
                                    )}

                                    {/* Cloud API config */}
                                    {provider === "cloud" && (
                                        <div className="pt-2 border-t border-zinc-800 mt-2 space-y-2">
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <label
                                                        htmlFor="cloud-api-key"
                                                        className="px-1 font-mono text-xs text-zinc-400"
                                                    >
                                                        API Key
                                                    </label>
                                                    <a
                                                        href="https://console.groq.com/keys"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex min-h-11 items-center px-1 text-xs font-mono text-blue-400 underline underline-offset-2 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                                    >
                                                        Get free key (Groq) →
                                                    </a>
                                                </div>
                                                <input
                                                    id="cloud-api-key"
                                                    type="password"
                                                    value={cloudApiKey}
                                                    onChange={e => {
                                                        setCloudApiKey(e.target.value);
                                                        cloudAI.setCredentials(cloudBaseUrl, e.target.value);
                                                    }}
                                                    className="mt-1 min-h-11 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-blue-500/30 focus-visible:ring-2 focus-visible:ring-white"
                                                    placeholder="sk-..."
                                                />
                                            </div>
                                            <div>
                                                <label
                                                    htmlFor="cloud-base-url"
                                                    className="px-1 font-mono text-xs text-zinc-400"
                                                >
                                                    Base URL
                                                </label>
                                                <input
                                                    id="cloud-base-url"
                                                    type="text"
                                                    value={cloudBaseUrl}
                                                    onChange={e => {
                                                        setCloudBaseUrl(e.target.value);
                                                        cloudAI.setCredentials(e.target.value, cloudApiKey);
                                                    }}
                                                    className="mt-1 min-h-11 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-blue-500/30 focus-visible:ring-2 focus-visible:ring-white"
                                                    placeholder="https://api.groq.com/openai/v1"
                                                />
                                            </div>
                                            <div>
                                                <label
                                                    htmlFor="cloud-model"
                                                    className="flex items-center gap-1 px-1 font-mono text-xs text-zinc-400"
                                                >
                                                    Model
                                                    {cloudAI.fetchingModels && (
                                                        <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" />
                                                    )}
                                                </label>
                                                <select
                                                    id="cloud-model"
                                                    value={cloudAI.loadedModel || ""}
                                                    onChange={e => handleCloudModelChange(e.target.value)}
                                                    className="mt-1 min-h-11 w-full cursor-pointer appearance-none rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-blue-500/30 focus-visible:ring-2 focus-visible:ring-white"
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
                                                    className="mt-1 min-h-11 w-full rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-2 text-xs font-mono text-blue-300 transition-all hover:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
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

                    {!(provider === "browser" && webllm.status === "loading") && (
                        <div className="relative shrink-0 lg:hidden">
                            <button
                                onClick={() => {
                                    const nextOpen = !mobileControlsOpen;
                                    setMobileControlsOpen(nextOpen);
                                    if (nextOpen) {
                                        setHeaderModelOpen(false);
                                        setProviderMenuOpen(false);
                                        setShowPrivacyInspector(false);
                                    }
                                }}
                                aria-label="More workspace controls"
                                aria-expanded={mobileControlsOpen}
                                className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {mobileControlsOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setMobileControlsOpen(false)}
                                        aria-hidden="true"
                                    />
                                    <div
                                        role="region"
                                        data-chat-popover="true"
                                        aria-label="Workspace controls"
                                        className="absolute right-0 top-full z-50 mt-2 w-[min(17rem,calc(100vw-1rem))] space-y-1 rounded-xl border border-zinc-700 bg-card p-2 shadow-xl"
                                    >
                                        <div className="flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-1 text-xs text-zinc-300">
                                            <span>Persona</span>
                                            <PersonaSelector compact menuPlacement="bottom" menuAlign="right" />
                                        </div>
                                        <button
                                            onClick={() => tts.setEnabled(!tts.isEnabled)}
                                            aria-pressed={tts.isEnabled}
                                            className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                        >
                                            {tts.isEnabled ? (
                                                <Volume2 className="h-4 w-4 text-emerald-300" />
                                            ) : (
                                                <VolumeX className="h-4 w-4" />
                                            )}
                                            Text to speech {tts.isEnabled ? "on" : "off"}
                                        </button>
                                        <button
                                            onClick={openPrivacyInspector}
                                            className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                        >
                                            <Shield className="h-4 w-4 text-emerald-300" />
                                            Privacy inspector
                                        </button>
                                        <ShareMenu
                                            label="Share / export"
                                            messages={chatStore.messages}
                                            modelName={activeModelName}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Only hide toolbar during WebGPU model download */}
                    {!(provider === "browser" && webllm.status === "loading") && (
                        <div className="hidden shrink-0 items-center lg:flex">
                            {/* Persona */}
                            <div className="ml-3">
                                <PersonaSelector compact />
                            </div>

                            {/* TTS */}
                            <button
                                onClick={() => tts.setEnabled(!tts.isEnabled)}
                                aria-label={tts.isEnabled ? "Disable text to speech" : "Enable text to speech"}
                                aria-pressed={tts.isEnabled}
                                className={cn(
                                    "ml-2 flex h-11 w-11 items-center justify-center rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                                    tts.isEnabled ? "text-phosphor" : "text-txt-tertiary hover:text-txt-secondary"
                                )}
                            >
                                {tts.isEnabled ? (
                                    <Volume2 className="w-3.5 h-3.5" />
                                ) : (
                                    <VolumeX className="w-3.5 h-3.5" />
                                )}
                            </button>

                            <button
                                onClick={showPrivacyInspector ? closePrivacyInspector : openPrivacyInspector}
                                title="Privacy inspector"
                                aria-label="Open privacy inspector"
                                aria-expanded={showPrivacyInspector}
                                className={cn(
                                    "flex h-11 w-11 items-center justify-center rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                                    showPrivacyInspector
                                        ? "text-emerald-300"
                                        : "text-txt-tertiary hover:text-txt-secondary"
                                )}
                            >
                                <Shield className="w-3.5 h-3.5" />
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
                                            "ml-3 font-mono text-xs flex items-center gap-1",
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
                        </div>
                    )}

                    {/* Loading — show only spinner + progress (WebGPU model download) */}
                    {provider === "browser" && webllm.status === "loading" && (
                        <div
                            aria-live="polite"
                            className="ml-1 flex shrink-0 items-center gap-2 text-xs font-mono text-phosphor-dim"
                        >
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {Math.round(webllm.loadProgress * 100)}%
                        </div>
                    )}

                    <div className="ml-auto hidden text-xs font-mono text-zinc-400 xl:block">ctrl+k</div>
                </header>

                <PrivacyInspector
                    open={showPrivacyInspector}
                    onClose={closePrivacyInspector}
                    ragCount={rag.documents.length}
                    ragEnabled={rag.ragEnabled}
                    cloudKeySet={Boolean(cloudAI.apiKey)}
                    deepSearchEnabled={deepSearchEnabled}
                    memoryEnabled={memoryEnabled}
                    autoRouteEnabled={autoRouteEnabled}
                    pythonEnabled={pyEnabled && pyodide.isReady}
                    provider={provider}
                    webllm={webllm}
                    chromeAI={chromeAI}
                    ollama={ollama}
                    cloudAI={cloudAI}
                    searchError={deepSearch.error}
                />

                <ProviderSetupBanner setup={providerSetup} />
                <StorageDurabilityAlert chatError={chatStore.storageError} memoryError={memory.storageError} />
                <div id="analytics-consent-slot" />

                {/* Messages */}
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-6">
                    {/* WebGPU unsupported hint is now integrated into the welcome screen */}

                    <ModelRuntimeStatus
                        provider={provider}
                        webllm={webllm}
                        messageCount={chatStore.messages.length}
                        defaultModel={DEFAULT_MODEL}
                        onModelChange={handleModelChange}
                        onUseCloud={() => switchProvider("cloud")}
                    />
                    {emptyWorkbenchVisible ? (
                        <WorkbenchEmptyState
                            provider={provider}
                            recommendedLabel={localModelRecommendation.label}
                            recommendedReason={localModelRecommendation.reason}
                            recommendedSize={localModelRecommendationSize}
                            localModelDisabled={!webllm.isSupported}
                            providerReady={activeProviderReady}
                            ollamaEndpoint={ollama.baseUrl}
                            documentCount={rag.documents.length}
                            documentBusy={rag.isIndexing}
                            onAttachDocs={openAttachPicker}
                            onBestLocalModel={loadBestLocalModel}
                            onSampleDocDemo={handleSampleDocDemo}
                            onSearchWeb={startWebSearch}
                            onPrivacyInspector={openPrivacyInspector}
                        />
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-5 transition-all">
                            <PersistedMessageList
                                messages={chatStore.messages}
                                onRunCode={pyodide.isReady && pyEnabled ? handlePythonRun : undefined}
                                onBranch={handleBranchMessage}
                            />

                            {deepSearch.isActive && (
                                <AgentThinking
                                    phase={deepSearch.phase as any}
                                    query={deepSearch.query}
                                    results={deepSearch.results}
                                    readingUrl={deepSearch.currentUrl}
                                    streamingText={deepSearch.streamingText}
                                    isActive={deepSearch.isActive}
                                    providerStatus={deepSearch.providerStatus}
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

                            {streamingContent && (
                                <LazyMessageBubble
                                    role="assistant"
                                    content={streamingContent}
                                    meta={activeExecutionMeta}
                                />
                            )}

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
                        fileInputId={ATTACH_INPUT_ID}
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
                            const nextEnabled = !memoryEnabled;
                            setMemoryEnabled(nextEnabled);
                            setShowMemoryPanel(nextEnabled);
                        }}
                        ragEnabled={rag.ragEnabled}
                        toggleRag={rag.toggle}
                        pyodideReady={pyodide.isReady}
                        pyodideLoading={pyodide.isLoading}
                        pyodideEnabled={pyEnabled}
                        onPyodideLoad={pyodide.load}
                        onPyodideToggle={enabled => {
                            if (!enabled) pyodide.terminate();
                            setPyEnabled(enabled);
                        }}
                        onFileDrop={rag.addFile}
                        attachedFiles={rag.documents.map(d => ({ id: d.id, name: d.name, size: d.size, type: d.type }))}
                        fileStatus={rag.status}
                        fileBusy={rag.isIndexing}
                        onRemoveFile={id => {
                            void rag.removeFile(id);
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
                busy={isStreaming}
            />

            <KeyboardShortcutsDialog open={showShortcuts} onClose={closeShortcuts} />
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
