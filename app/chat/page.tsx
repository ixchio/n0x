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
    Cloud,
    Server,
    Monitor,
    Search,
    FileText,
    Sparkles,
    Database,
    KeyRound,
    Lock,
    Wifi,
    HardDrive,
    ExternalLink,
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
import { PixelNoxMark } from "@/components/pixel-nox-mark";

type AIProvider = "browser" | "ollama" | "cloud" | "chrome-ai";

const ATTACH_INPUT_ID = "n0x-attach-input";

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

function statusTone(status: "ready" | "issue" | "optional" | "checking") {
    if (status === "ready") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    if (status === "issue") return "border-red-500/20 bg-red-500/10 text-red-300";
    if (status === "checking") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    return "border-zinc-700 bg-zinc-900/70 text-zinc-400";
}

type BannerTone = "blue" | "amber" | "red" | "zinc";

interface BannerAction {
    label: string;
    onClick: () => void;
    primary?: boolean;
}

interface ProviderSetup {
    title: string;
    detail: string;
    tone: BannerTone;
    actions: BannerAction[];
}

function setupToneClasses(tone: BannerTone) {
    if (tone === "blue") return "border-blue-500/20 bg-blue-500/5 text-blue-200";
    if (tone === "amber") return "border-amber-500/20 bg-amber-500/5 text-amber-200";
    if (tone === "red") return "border-red-500/20 bg-red-500/5 text-red-200";
    return "border-zinc-800 bg-zinc-950/70 text-zinc-200";
}

function ProviderSetupBanner({ setup }: { setup: ProviderSetup | null }) {
    if (!setup) return null;

    return (
        <div className="border-b border-zinc-900 bg-background/80 px-4 py-2 backdrop-blur">
            <div
                className={cn(
                    "mx-auto flex max-w-5xl flex-col gap-2 rounded-lg border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between",
                    setupToneClasses(setup.tone)
                )}
            >
                <div className="flex min-w-0 items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    <div className="min-w-0">
                        <span className="font-semibold text-zinc-100">{setup.title}</span>
                        <span className="mx-2 text-zinc-600">·</span>
                        <span className="text-zinc-400">{setup.detail}</span>
                    </div>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {setup.actions.map(action => (
                        <button
                            key={action.label}
                            onClick={action.onClick}
                            className={cn(
                                "rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                                action.primary
                                    ? "border-zinc-200 bg-zinc-100 text-black hover:bg-white"
                                    : "border-zinc-800 bg-black/20 text-zinc-300 hover:border-zinc-700 hover:text-white"
                            )}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function EmptyStateCard({
    icon: Icon,
    title,
    detail,
    onClick,
    disabled,
}: {
    icon: React.ElementType;
    title: string;
    detail: string;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "group flex min-h-[86px] items-start gap-3 rounded-lg border border-zinc-900 bg-zinc-950/45 p-3 text-left transition-colors",
                disabled
                    ? "cursor-not-allowed opacity-45"
                    : "hover:border-zinc-700 hover:bg-zinc-900/70 focus:outline-none focus:ring-1 focus:ring-zinc-700"
            )}
        >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-200" />
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-200">{title}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">{detail}</span>
            </span>
        </button>
    );
}

function WorkbenchEmptyState({
    provider,
    recommendedLabel,
    recommendedReason,
    localModelDisabled,
    onAttachDocs,
    onBestLocalModel,
    onSampleDocDemo,
    onSearchWeb,
    onPrivacyInspector,
}: {
    provider: AIProvider;
    recommendedLabel: string;
    recommendedReason: string;
    localModelDisabled: boolean;
    onAttachDocs: () => void;
    onBestLocalModel: () => void;
    onSampleDocDemo: () => void;
    onSearchWeb: () => void;
    onPrivacyInspector: () => void;
}) {
    const providerNote =
        provider === "cloud"
            ? "Cloud only runs after you add a key. Local paths stay available."
            : provider === "ollama"
              ? "Ollama stays on your machine when the local server is reachable."
              : provider === "chrome-ai"
                ? "Chrome AI is local when Gemini Nano is ready in this browser."
                : "Browser mode keeps docs and prompts on this machine.";

    return (
        <div className="min-h-full px-1 py-8 sm:px-4">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
                <div className="flex items-start gap-3">
                    <PixelNoxMark className="mt-1 h-5 w-10 text-zinc-300" />
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold text-zinc-100">Drop files or ask a question</h2>
                        <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-500">
                            Start with docs, notes, logs, or a plain question. The provider badge tells you when context
                            stays local or goes to a configured cloud endpoint.
                        </p>
                    </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                    <EmptyStateCard
                        icon={FileText}
                        title="Attach docs"
                        detail="PDFs, notes, CSVs, logs. Build context before you ask."
                        onClick={onAttachDocs}
                    />
                    <EmptyStateCard
                        icon={HardDrive}
                        title="Best local model"
                        detail={`${recommendedLabel}. ${recommendedReason}.`}
                        onClick={onBestLocalModel}
                        disabled={localModelDisabled}
                    />
                    <EmptyStateCard
                        icon={FileText}
                        title="Private docs demo"
                        detail="Load a sample brief and get a useful first prompt."
                        onClick={onSampleDocDemo}
                    />
                    <EmptyStateCard
                        icon={Search}
                        title="Search web"
                        detail="Turn on web context when local docs are not enough."
                        onClick={onSearchWeb}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
                    <span>{providerNote}</span>
                    <button
                        onClick={onPrivacyInspector}
                        className="rounded-md border border-zinc-900 px-2 py-1 text-zinc-400 transition hover:border-zinc-700 hover:text-white"
                    >
                        Open privacy inspector
                    </button>
                </div>
            </div>
        </div>
    );
}

function StartHereStrip({
    show,
    localModelDisabled,
    onBestLocalModel,
    onAttachDocs,
    onCloudSetup,
    onPrivacyInspector,
}: {
    show: boolean;
    localModelDisabled: boolean;
    onBestLocalModel: () => void;
    onAttachDocs: () => void;
    onCloudSetup: () => void;
    onPrivacyInspector: () => void;
}) {
    if (!show) return null;

    const actions = [
        { label: "Best local model", onClick: onBestLocalModel, disabled: localModelDisabled },
        { label: "Attach docs", onClick: onAttachDocs },
        { label: "Configure cloud", onClick: onCloudSetup },
        { label: "Open privacy inspector", onClick: onPrivacyInspector },
    ];

    return (
        <div className="px-4 pb-1">
            <div className="mx-auto flex max-w-4xl flex-col gap-2 rounded-lg border border-zinc-900 bg-zinc-950/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[11px] font-semibold text-zinc-400">Start here</span>
                <div className="flex flex-wrap gap-1.5">
                    {actions.map(action => (
                        <button
                            key={action.label}
                            onClick={action.onClick}
                            disabled={action.disabled}
                            className={cn(
                                "rounded-md border border-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors",
                                action.disabled
                                    ? "cursor-not-allowed opacity-45"
                                    : "hover:border-zinc-700 hover:bg-zinc-900 hover:text-white"
                            )}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function DependencyFallbackPanel({
    provider,
    webllm,
    chromeAI,
    ollama,
    cloudAI,
    searchError,
}: {
    provider: AIProvider;
    webllm: any;
    chromeAI: any;
    ollama: any;
    cloudAI: any;
    searchError?: string | null;
}) {
    const rows = [
        {
            name: "WebGPU",
            status: !webllm.isSupported ? "issue" : webllm.gpuTier === "unknown" ? "checking" : "ready",
            detail: !webllm.isSupported
                ? webllm.error || "Unavailable in this browser"
                : `Detected ${webllm.gpuTier} tier`,
            fallback: "Use Chrome AI, Ollama, or Cloud API.",
        },
        {
            name: "Chrome AI",
            status: chromeAI.status === "ready" ? "ready" : provider === "chrome-ai" ? "issue" : "optional",
            detail:
                chromeAI.status === "ready"
                    ? "Gemini Nano ready"
                    : chromeAI.error || "Requires Chrome Prompt API and local model availability",
            fallback: "Use WebGPU, Ollama, or Cloud API.",
        },
        {
            name: "Ollama",
            status: ollama.isSupported ? "ready" : provider === "ollama" ? "issue" : "optional",
            detail: ollama.isSupported
                ? `${ollama.models.length} local model(s)`
                : ollama.error || "Local server not reachable",
            fallback: "Run ollama serve, or use WebGPU/Cloud.",
        },
        {
            name: "Cloud key",
            status: cloudAI.apiKey ? (cloudAI.error ? "issue" : "ready") : "optional",
            detail: cloudAI.apiKey ? cloudAI.error || "Configured for this browser session" : "No key stored",
            fallback: "Stay local, or paste a valid OpenAI-compatible key.",
        },
        {
            name: "Search",
            status: searchError ? "issue" : "ready",
            detail: searchError || "DDG, SearXNG, Wikipedia; Brave/Tavily if server keys exist",
            fallback: "Answer from local model and uploaded docs.",
        },
    ] as const;

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-left">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <AlertTriangle className="h-3.5 w-3.5 text-zinc-500" />
                Dependency fallbacks
            </div>
            <div className="space-y-1.5">
                {rows.map(row => (
                    <div key={row.name} className="rounded-lg bg-zinc-900/40 p-2 text-[10px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span
                                className={cn(
                                    "rounded border px-1.5 py-0.5 font-semibold uppercase",
                                    statusTone(row.status)
                                )}
                            >
                                {row.status}
                            </span>
                            <span className="font-semibold text-zinc-300">{row.name}</span>
                        </div>
                        <div className="mt-1 leading-relaxed text-zinc-500">
                            {row.detail} <span className="text-zinc-600">{row.fallback}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PrivacyInspector({
    open,
    onClose,
    ragCount,
    cloudKeySet,
    deepSearchEnabled,
    memoryEnabled,
    provider,
    webllm,
    chromeAI,
    ollama,
    cloudAI,
    searchError,
}: {
    open: boolean;
    onClose: () => void;
    ragCount: number;
    cloudKeySet: boolean;
    deepSearchEnabled: boolean;
    memoryEnabled: boolean;
    provider: AIProvider;
    webllm: any;
    chromeAI: any;
    ollama: any;
    cloudAI: any;
    searchError?: string | null;
}) {
    if (!open) return null;

    const rows = [
        {
            icon: Database,
            label: "IndexedDB",
            value: `${ragCount} attached file${ragCount === 1 ? "" : "s"} · conversations, memory, vector cache`,
        },
        {
            icon: KeyRound,
            label: "Cloud keys",
            value: cloudKeySet ? "sessionStorage for this browser session" : "not configured",
        },
        {
            icon: Lock,
            label: "Current chat path",
            value:
                provider === "cloud"
                    ? "cloud provider receives selected prompt/context"
                    : deepSearchEnabled
                      ? "local model plus network search context"
                      : "local provider path",
        },
        {
            icon: Wifi,
            label: "Network toggles",
            value: `search ${deepSearchEnabled ? "on" : "off"} · memory recall ${memoryEnabled ? "on" : "off"}`,
        },
    ];

    return (
        <div className="fixed right-4 top-16 z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-zinc-800 bg-[#0b0b0b] p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Shield className="h-4 w-4 text-emerald-300" />
                        Privacy inspector
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                        Shows where the next prompt and local data can go.
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-white"
                >
                    Close
                </button>
            </div>
            <div className="space-y-2">
                {rows.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex gap-3 rounded-lg border border-zinc-900 bg-zinc-950/60 p-3">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        <div>
                            <div className="text-[11px] font-semibold text-zinc-300">{label}</div>
                            <div className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">{value}</div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-3 flex gap-3 border-t border-zinc-900 pt-3 text-[10px] font-mono">
                <a href="/security" className="inline-flex items-center gap-1 text-zinc-500 hover:text-white">
                    Security <ExternalLink className="h-3 w-3" />
                </a>
                <a href="/privacy" className="inline-flex items-center gap-1 text-zinc-500 hover:text-white">
                    Privacy <ExternalLink className="h-3 w-3" />
                </a>
            </div>
            <div className="mt-4">
                <DependencyFallbackPanel
                    provider={provider}
                    webllm={webllm}
                    chromeAI={chromeAI}
                    ollama={ollama}
                    cloudAI={cloudAI}
                    searchError={searchError}
                />
            </div>
        </div>
    );
}

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
    const [showPrivacyInspector, setShowPrivacyInspector] = useState(false);

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

    const handleModelChange = useCallback(
        async (modelId: string) => {
            setHeaderModelOpen(false);

            // Mobile warning for large models
            if (webllm.isMobile && webllm.loadedModel !== modelId) {
                const model = WEBLLM_MODELS.find(m => m.id === modelId);
                const sizeInGB = parseFloat(model?.size?.replace(/[^0-9.]/g, "") || "0");

                if (sizeInGB > 2) {
                    const proceed = window.confirm(
                        `⚠️ Mobile Device Warning\n\n` +
                            `${model?.label} (${model?.size}) is large for mobile devices.\n\n` +
                            `This may cause your browser to crash or freeze. Consider:\n` +
                            `• Using a smaller model (< 2GB)\n` +
                            `• Switching to Cloud API (free with Groq)\n\n` +
                            `Continue loading this model anyway?`
                    );
                    if (!proceed) return;
                }
            }

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

    const localModelRecommendation = recommendedModelForDevice(webllm.gpuTier, webllm.isMobile);

    const openAttachPicker = useCallback(() => {
        document.getElementById(ATTACH_INPUT_ID)?.click();
    }, []);

    const openCloudSetup = useCallback(() => {
        setProvider("cloud");
        setHeaderModelOpen(false);
        setProviderMenuOpen(true);
    }, [setProvider]);

    const openOllamaSetup = useCallback(() => {
        setProvider("ollama");
        ollama.setBaseUrl(ollamaUrl);
        setHeaderModelOpen(false);
        setProviderMenuOpen(true);
    }, [ollama, ollamaUrl, setProvider]);

    const switchToWebGPU = useCallback(() => {
        setProvider("browser");
        setHeaderModelOpen(false);
        setProviderMenuOpen(false);
    }, [setProvider]);

    const loadBestLocalModel = useCallback(() => {
        if (!webllm.isSupported) return;
        setProvider("browser");
        void handleModelChange(localModelRecommendation.id);
    }, [handleModelChange, localModelRecommendation.id, setProvider, webllm.isSupported]);

    const startWebSearch = useCallback(() => {
        setDeepSearchEnabled(true);
        setInput("search the web for ");
    }, [setDeepSearchEnabled, setInput]);

    const openPrivacyInspector = useCallback(() => {
        setShowPrivacyInspector(true);
    }, []);

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

    const activeModelName =
        provider === "ollama"
            ? ollama.loadedModel || "Ollama"
            : provider === "cloud"
              ? cloudAI.loadedModel || "Cloud API"
              : provider === "chrome-ai"
                ? "Gemini Nano"
                : WEBLLM_MODELS.find(m => m.id === webllm.loadedModel)?.label || webllm.loadedModel || "No model";
    const liveMessageMeta = {
        provider,
        providerLabel:
            provider === "browser"
                ? "WebGPU"
                : provider === "chrome-ai"
                  ? "Chrome AI"
                  : provider === "ollama"
                    ? "Ollama"
                    : "Cloud API",
        modelName: activeModelName,
        privacy: provider === "cloud" ? "cloud" : deepSearchEnabled ? "mixed" : "local",
        usedSearch: deepSearchEnabled,
        usedDocs: rag.documents.length > 0,
        usedMemory: memoryEnabled,
        agent: agent.enabled,
    } as const;

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
                        detail: ollama.error || "Start your local Ollama server or pick another provider.",
                        tone: "amber",
                        actions: [
                            { label: "Configure Ollama", onClick: openOllamaSetup, primary: true },
                            { label: "Switch to WebGPU", onClick: switchToWebGPU },
                            { label: "Configure cloud", onClick: openCloudSetup },
                        ],
                    }
                  : provider === "chrome-ai" && chromeAI.status !== "ready"
                    ? {
                          title: chromeAI.status === "downloading" ? "Chrome AI downloading" : "Chrome AI unavailable",
                          detail:
                              chromeAI.error ||
                              (chromeAI.status === "downloading"
                                  ? "Gemini Nano is still installing in Chrome."
                                  : "Use another provider for this session."),
                          tone: chromeAI.status === "downloading" ? "zinc" : "amber",
                          actions: [
                              { label: "Switch to WebGPU", onClick: switchToWebGPU, primary: true },
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
        chatStore.messages.length === 0 && !deepSearch.isActive && webllm.status !== "loading";
    const showStartHereStrip = emptyWorkbenchVisible && !activeProviderReady;

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
                    estimatedTimeRemaining={webllm.loadingStats?.estimatedTimeRemaining}
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
                                                Sends selected prompt/context to your configured provider
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

                            <button
                                onClick={() => setShowPrivacyInspector(open => !open)}
                                title="Privacy inspector"
                                className={cn(
                                    "ml-2 p-1 rounded transition-all",
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

                <PrivacyInspector
                    open={showPrivacyInspector}
                    onClose={() => setShowPrivacyInspector(false)}
                    ragCount={rag.documents.length}
                    cloudKeySet={Boolean(cloudAI.apiKey)}
                    deepSearchEnabled={deepSearchEnabled}
                    memoryEnabled={memoryEnabled}
                    provider={provider}
                    webllm={webllm}
                    chromeAI={chromeAI}
                    ollama={ollama}
                    cloudAI={cloudAI}
                    searchError={deepSearch.error}
                />

                <ProviderSetupBanner setup={providerSetup} />

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
                                        <Cloud className="w-3.5 h-3.5" /> Use Cloud API for this session
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
                                                        Use Cloud API
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

                    {emptyWorkbenchVisible ? (
                        <WorkbenchEmptyState
                            provider={provider}
                            recommendedLabel={localModelRecommendation.label}
                            recommendedReason={localModelRecommendation.reason}
                            localModelDisabled={!webllm.isSupported}
                            onAttachDocs={openAttachPicker}
                            onBestLocalModel={loadBestLocalModel}
                            onSampleDocDemo={handleSampleDocDemo}
                            onSearchWeb={startWebSearch}
                            onPrivacyInspector={openPrivacyInspector}
                        />
                    ) : (
                        <div
                            className={cn(
                                "max-w-3xl mx-auto space-y-5 transition-all",
                                isExploding && "opacity-0 scale-95"
                            )}
                        >
                            {chatStore.messages.map((msg, index) => {
                                const previousPrompt =
                                    msg.role === "assistant"
                                        ? [...chatStore.messages]
                                              .slice(0, index)
                                              .reverse()
                                              .find(m => m.role === "user")?.content
                                        : undefined;
                                const messageMeta =
                                    msg.meta ||
                                    ({
                                        provider: "browser",
                                        providerLabel: "Saved message",
                                        modelName: "provider not recorded",
                                        privacy: "unknown",
                                    } as const);

                                return (
                                    <MessageBubble
                                        key={msg.id}
                                        role={msg.role}
                                        content={msg.content}
                                        image={msg.image}
                                        meta={messageMeta}
                                        timestamp={msg.timestamp}
                                        previousPrompt={previousPrompt}
                                        onRunCode={pyodide.isReady && pyEnabled ? handlePythonRun : undefined}
                                        onBranch={() => {
                                            const newId = chatStore.branchFrom(msg.id);
                                            if (newId) chatStore.switchConversation(newId);
                                        }}
                                    />
                                );
                            })}

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
                                <MessageBubble role="assistant" content={streamingContent} meta={liveMessageMeta} />
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
                    <StartHereStrip
                        show={showStartHereStrip}
                        localModelDisabled={!webllm.isSupported}
                        onBestLocalModel={loadBestLocalModel}
                        onAttachDocs={openAttachPicker}
                        onCloudSetup={openCloudSetup}
                        onPrivacyInspector={openPrivacyInspector}
                    />
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
