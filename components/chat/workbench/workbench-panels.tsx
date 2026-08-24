"use client";

import React, { useEffect, useRef } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Database,
    ExternalLink,
    FileText,
    KeyRound,
    Lock,
    Shield,
    Wifi,
} from "lucide-react";

import { PixelNoxMark } from "@/components/brand/pixel-nox-mark";
import { isNetworkedEndpoint } from "@/lib/chat/executionPlan";
import { cn } from "@/lib/utils";

export type AIProvider = "browser" | "ollama" | "cloud" | "chrome-ai";

type BannerTone = "blue" | "amber" | "red" | "zinc";

interface BannerAction {
    label: string;
    onClick: () => void;
    primary?: boolean;
}

export interface ProviderSetup {
    title: string;
    detail: string;
    tone: BannerTone;
    actions: BannerAction[];
}

interface WebLlmDependency {
    isSupported: boolean;
    gpuTier: string;
    error: string | null;
}

interface ChromeAIDependency {
    status: string;
    error: string | null;
}

interface OllamaDependency {
    isSupported: boolean;
    models: unknown[];
    error: string | null;
    baseUrl?: string;
}

interface CloudAIDependency {
    apiKey: string;
    error: string | null;
}

interface DependencyProps {
    provider: AIProvider;
    webllm: WebLlmDependency;
    chromeAI: ChromeAIDependency;
    ollama: OllamaDependency;
    cloudAI: CloudAIDependency;
    searchError?: string | null;
}

function statusTone(status: "ready" | "issue" | "optional" | "checking") {
    if (status === "ready") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    if (status === "issue") return "border-red-500/20 bg-red-500/10 text-red-300";
    if (status === "checking") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    return "border-zinc-700 bg-zinc-900/70 text-zinc-400";
}

function setupToneClasses(tone: BannerTone) {
    if (tone === "blue") return "border-blue-500/20 bg-blue-500/5 text-blue-200";
    if (tone === "amber") return "border-amber-500/20 bg-amber-500/5 text-amber-200";
    if (tone === "red") return "border-red-500/20 bg-red-500/5 text-red-200";
    return "border-zinc-800 bg-zinc-950/70 text-zinc-200";
}

export function ProviderSetupBanner({ setup }: { setup: ProviderSetup | null }) {
    if (!setup) return null;

    return (
        <div className="border-b border-zinc-900 bg-background/80 px-2 py-1 backdrop-blur sm:px-4 sm:py-2">
            <div
                role={setup.tone === "red" ? "alert" : "status"}
                aria-live={setup.tone === "red" ? "assertive" : "polite"}
                aria-atomic="true"
                className={cn(
                    "mx-auto flex max-w-5xl flex-col gap-1.5 rounded-lg border px-2 py-1.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-3 sm:py-2",
                    setupToneClasses(setup.tone)
                )}
            >
                <div className="flex min-w-0 items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    <div className="min-w-0">
                        <span className="font-semibold text-zinc-100">{setup.title}</span>
                        <span className="mx-2 text-zinc-400">·</span>
                        <span className="text-zinc-400">{setup.detail}</span>
                    </div>
                </div>
                <div className="flex flex-nowrap gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap sm:justify-end sm:overflow-visible">
                    {setup.actions.map(action => (
                        <button
                            key={action.label}
                            onClick={action.onClick}
                            className={cn(
                                "h-11 shrink-0 whitespace-nowrap rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
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

interface WorkbenchEmptyStateProps {
    provider: AIProvider;
    recommendedLabel: string;
    recommendedReason: string;
    recommendedSize: string;
    localModelDisabled: boolean;
    providerReady: boolean;
    ollamaEndpoint?: string;
    documentCount: number;
    documentBusy?: boolean;
    onAttachDocs: () => void;
    onBestLocalModel: () => void;
    onSampleDocDemo: () => void;
    onSearchWeb?: () => void;
    onPrivacyInspector: () => void;
    chromeStatus?: string;
    onUseChromeAI?: () => void;
}

export function WorkbenchEmptyState({
    provider,
    recommendedLabel,
    recommendedReason,
    recommendedSize,
    localModelDisabled,
    providerReady,
    ollamaEndpoint,
    documentCount,
    documentBusy = false,
    onAttachDocs,
    onSampleDocDemo,
    onPrivacyInspector,
    chromeStatus,
    onUseChromeAI,
}: WorkbenchEmptyStateProps) {
    const providerNote =
        provider === "cloud"
            ? "Cloud answers come from your configured OpenAI-compatible endpoint."
            : provider === "ollama"
              ? isNetworkedEndpoint(ollamaEndpoint)
                  ? "Ollama is using a remote HTTPS endpoint, so prompts and enabled context leave this device."
                  : "Ollama is using localhost, so prompts stay on this machine."
              : provider === "chrome-ai"
                ? "Gemini Nano runs inside Chrome. No download from N0X."
                : "Answers run on your GPU. Documents never leave this device.";

    const hasDocuments = documentCount > 0;
    const chromeInstant =
        !providerReady && chromeStatus === "downloadable" && typeof onUseChromeAI === "function";

    return (
        <section
            aria-labelledby="document-start-title"
            className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-4 px-1 py-4 sm:px-4 sm:py-8"
        >
            <div className="flex items-start gap-3">
                <PixelNoxMark className="mt-1 h-5 w-10 shrink-0 text-emerald-300" />
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                        Private document Q&amp;A
                    </p>
                    <h2 id="document-start-title" className="mt-1 text-xl font-semibold text-zinc-100 sm:text-2xl">
                        {hasDocuments
                            ? "Document ready. Ask a cited question."
                            : "Start with one confidential document."}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
                        {hasDocuments
                            ? documentCount +
                              " document" +
                              (documentCount === 1 ? " is" : "s are") +
                              " indexed in this browser. Write a question below and verify the answer against its citation."
                            : "Pick a file, ask, and verify the answer against its filename/chunk citation. Nothing is uploaded."}
                    </p>
                </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    {hasDocuments ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                    ) : (
                        <FileText className="h-4 w-4 text-zinc-300" aria-hidden="true" />
                    )}
                    {hasDocuments ? "Document indexed" : "One click to start"}
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-400">
                    PDF, DOCX, Markdown, text, CSV, HTML, and JSON are supported. Extraction and retrieval stay on
                    this device.
                </p>
                <div className="mt-4 flex flex-col gap-2 min-[420px]:flex-row">
                    <button
                        onClick={onAttachDocs}
                        disabled={documentBusy}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {hasDocuments ? "Add another document" : "Choose a document"}
                    </button>
                    <button
                        onClick={onSampleDocDemo}
                        disabled={documentBusy}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Try the sample
                    </button>
                </div>
                {!providerReady && (
                    <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3 text-xs leading-5 text-zinc-400">
                        {localModelDisabled ? (
                            <p>
                                WebGPU is unavailable here. Use Chrome AI, Ollama, or Cloud API from the provider
                                menu above.
                            </p>
                        ) : (
                            <p>
                                First answer needs a local model:{" "}
                                <span className="text-zinc-200">{recommendedLabel}</span> downloads{" "}
                                {recommendedSize} once, then stays cached. Picking a file starts the download
                                immediately.
                                <span className="sr-only"> {recommendedReason}</span>
                            </p>
                        )}
                        {chromeInstant && (
                            <div className="flex flex-wrap items-center gap-2">
                                <span>No download option:</span>
                                <button
                                    onClick={onUseChromeAI}
                                    className="inline-flex min-h-9 items-center rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-1.5 font-medium text-purple-200 transition-colors hover:bg-purple-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    Use Chrome&apos;s built-in Gemini Nano
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {providerReady && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-100">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
                    <p>
                        <span className="font-semibold">Provider ready.</span> {providerNote}
                    </p>
                </div>
            )}

            <div className="flex flex-col gap-3 rounded-xl border border-zinc-900 bg-black/20 p-3 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                <p className="leading-5">
                    <strong className="text-zinc-300">Ask and verify.</strong> Supported claims cite{" "}
                    <span className="font-mono text-emerald-300">[filename#chunk-N]</span>. Advanced tools remain in
                    the composer.
                </p>
                <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                        onClick={onPrivacyInspector}
                        className="min-h-11 rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        Privacy details
                    </button>
                </div>
            </div>
        </section>
    );
}

function DependencyFallbackPanel({ provider, webllm, chromeAI, ollama, cloudAI, searchError }: DependencyProps) {
    const ollamaRemote = isNetworkedEndpoint(ollama.baseUrl);
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
                ? `${ollama.models.length} model(s) · ${ollamaRemote ? "remote HTTPS endpoint" : "localhost"}`
                : ollama.error || "Configured endpoint not reachable",
            fallback: "Start or check the configured Ollama endpoint, or use WebGPU/Cloud.",
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
                <AlertTriangle className="h-3.5 w-3.5 text-zinc-400" />
                Dependency fallbacks
            </div>
            <div className="space-y-1.5">
                {rows.map(row => (
                    <div key={row.name} className="rounded-lg bg-zinc-900/40 p-2 text-xs">
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
                        <div className="mt-1 leading-relaxed text-zinc-400">
                            {row.detail} <span className="text-zinc-400">{row.fallback}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface PrivacyInspectorProps extends DependencyProps {
    open: boolean;
    onClose: () => void;
    ragCount: number;
    ragEnabled: boolean;
    cloudKeySet: boolean;
    deepSearchEnabled: boolean;
    memoryEnabled: boolean;
    autoRouteEnabled: boolean;
}

export function PrivacyInspector({
    open,
    onClose,
    ragCount,
    ragEnabled,
    cloudKeySet,
    deepSearchEnabled,
    memoryEnabled,
    autoRouteEnabled,
    provider,
    webllm,
    chromeAI,
    ollama,
    cloudAI,
    searchError,
}: PrivacyInspectorProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const shouldRestoreFocusRef = useRef(true);

    useEffect(() => {
        if (!open) return;

        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        shouldRestoreFocusRef.current = true;
        const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                shouldRestoreFocusRef.current = true;
                onClose();
            }
        };
        const handleOutsideClick = (event: MouseEvent) => {
            if (!dialogRef.current?.contains(event.target as Node)) {
                shouldRestoreFocusRef.current = false;
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("click", handleOutsideClick);
        return () => {
            cancelAnimationFrame(focusFrame);
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("click", handleOutsideClick);
            if (shouldRestoreFocusRef.current) previousFocusRef.current?.focus();
        };
    }, [onClose, open]);

    if (!open) return null;

    const remoteOllama = provider === "ollama" && isNetworkedEndpoint(ollama.baseUrl);
    const currentPath =
        provider === "cloud"
            ? "cloud provider receives the selected prompt and enabled context"
            : remoteOllama
              ? "remote Ollama host receives the selected prompt and enabled context"
              : deepSearchEnabled
                ? "local provider plus a network search query and returned search context"
                : autoRouteEnabled && Boolean(cloudAI.apiKey)
                  ? "local by default; automatic routing may select the configured cloud provider"
                  : provider === "ollama"
                    ? "loopback Ollama path on this device"
                    : "on-device provider path";
    const currentPathWithTools = deepSearchEnabled
        ? `${currentPath}; search also sends the query to N0X search providers`
        : currentPath;

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
            value: currentPathWithTools,
        },
        {
            icon: Wifi,
            label: "Request controls",
            value: `docs ${
                ragEnabled ? `on (${ragCount} attached)` : `off (${ragCount} attached)`
            } · search ${deepSearchEnabled ? "on (network)" : "off"} · memory ${
                memoryEnabled ? "on (local)" : "off"
            } · auto-route ${autoRouteEnabled ? "on" : "off"}`,
        },
    ];

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-label="Privacy inspector"
            className="fixed right-4 top-16 z-50 max-h-[calc(100dvh-5rem)] w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-zinc-700 bg-[#0b0b0b] p-4 shadow-2xl"
        >
            <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Shield className="h-4 w-4 text-emerald-300" />
                        Privacy inspector
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                        What stays in this browser, what can use the network, and how the app degrades.
                    </p>
                </div>
                <button
                    ref={closeRef}
                    onClick={() => {
                        shouldRestoreFocusRef.current = true;
                        onClose();
                    }}
                    aria-label="Close privacy inspector"
                    className="flex min-h-11 items-center rounded-md px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                    Close
                </button>
            </div>
            <div className="space-y-2">
                {rows.map(({ icon: Icon, label, value }) => (
                    <div
                        key={label}
                        className="flex items-start gap-2 rounded-lg border border-zinc-900 bg-zinc-950 p-2.5"
                    >
                        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</div>
                            <div className="mt-0.5 text-xs leading-relaxed text-zinc-400">{value}</div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
                <a
                    href="/security"
                    className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                    Security <ExternalLink className="h-3 w-3" />
                </a>
                <a
                    href="/privacy"
                    className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
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
