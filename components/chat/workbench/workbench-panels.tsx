"use client";

import type { ElementType } from "react";
import {
    AlertTriangle,
    Database,
    ExternalLink,
    FileText,
    HardDrive,
    KeyRound,
    Lock,
    Search,
    Shield,
    Wifi,
} from "lucide-react";

import { PixelNoxMark } from "@/components/brand/pixel-nox-mark";
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
                        <span className="mx-2 text-zinc-400">·</span>
                        <span className="text-zinc-400">{setup.detail}</span>
                    </div>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {setup.actions.map(action => (
                        <button
                            key={action.label}
                            onClick={action.onClick}
                            className={cn(
                                "min-h-11 rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
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

interface EmptyStateCardProps {
    icon: ElementType;
    title: string;
    detail: string;
    onClick: () => void;
    disabled?: boolean;
}

function EmptyStateCard({ icon: Icon, title, detail, onClick, disabled }: EmptyStateCardProps) {
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
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-200" />
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-200">{title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{detail}</span>
            </span>
        </button>
    );
}

interface WorkbenchEmptyStateProps {
    provider: AIProvider;
    recommendedLabel: string;
    recommendedReason: string;
    localModelDisabled: boolean;
    onAttachDocs: () => void;
    onBestLocalModel: () => void;
    onSampleDocDemo: () => void;
    onSearchWeb: () => void;
    onPrivacyInspector: () => void;
}

export function WorkbenchEmptyState({
    provider,
    recommendedLabel,
    recommendedReason,
    localModelDisabled,
    onAttachDocs,
    onBestLocalModel,
    onSampleDocDemo,
    onSearchWeb,
    onPrivacyInspector,
}: WorkbenchEmptyStateProps) {
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
                        <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-400">
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

                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span>{providerNote}</span>
                    <button
                        onClick={onPrivacyInspector}
                        className="min-h-11 rounded-md border border-zinc-800 px-3 py-2 text-zinc-300 transition hover:border-zinc-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        Open privacy inspector
                    </button>
                </div>
            </div>
        </div>
    );
}

interface StartHereStripProps {
    show: boolean;
    localModelDisabled: boolean;
    onBestLocalModel: () => void;
    onAttachDocs: () => void;
    onCloudSetup: () => void;
    onPrivacyInspector: () => void;
}

export function StartHereStrip({
    show,
    localModelDisabled,
    onBestLocalModel,
    onAttachDocs,
    onCloudSetup,
    onPrivacyInspector,
}: StartHereStripProps) {
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
                <span className="text-xs font-semibold text-zinc-400">Start here</span>
                <div className="flex flex-wrap gap-1.5">
                    {actions.map(action => (
                        <button
                            key={action.label}
                            onClick={action.onClick}
                            disabled={action.disabled}
                            className={cn(
                                "min-h-11 rounded-md border border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
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

function DependencyFallbackPanel({ provider, webllm, chromeAI, ollama, cloudAI, searchError }: DependencyProps) {
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
    cloudKeySet: boolean;
    deepSearchEnabled: boolean;
    memoryEnabled: boolean;
}

export function PrivacyInspector({
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
}: PrivacyInspectorProps) {
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
        <div
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
                    onClick={onClose}
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
                <a href="/security" className="inline-flex items-center gap-1 hover:text-white">
                    Security <ExternalLink className="h-3 w-3" />
                </a>
                <a href="/privacy" className="inline-flex items-center gap-1 hover:text-white">
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
