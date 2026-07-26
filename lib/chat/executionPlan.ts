import { routeMessage, type RouteDecision, type RouteResult } from "./useAutoRouter";

export type TextExecutionProvider = "browser" | "ollama" | "cloud" | "chrome-ai";
export type ExecutionProvider = TextExecutionProvider | "image";
export type ExecutionPrivacyPath = "local" | "cloud" | "mixed" | "unknown";
export type ExecutionMode = "direct" | "agent" | "image";

export interface ExecutionSourceFlags {
    readonly search: boolean;
    readonly documents: boolean;
    readonly memory: boolean;
    readonly agent: boolean;
    /** Python may be offered to the autonomous agent for this request. */
    readonly python: boolean;
}

export interface ExecutionProviderState {
    /** The provider has enough configuration to be considered by the router. */
    readonly configured: boolean;
    /** The provider can accept a request right now. */
    readonly ready: boolean;
    /** Exact model identifier used by the provider. */
    readonly model: string | null;
    /** Optional human-readable model name for message badges. */
    readonly modelLabel?: string | null;
    /** True when using this provider sends prompts to a non-loopback endpoint. */
    readonly networked?: boolean;
    /** Total model context capacity, including prompt and completion. */
    readonly contextWindow?: number | null;
    /** Provider/model completion ceiling when known. */
    readonly maxOutputTokens?: number | null;
    /** Changes whenever provider credentials, endpoint, or runtime identity changes. */
    readonly revision?: number;
    /** Normalized endpoint captured for audit/readiness without storing credentials. */
    readonly endpoint?: string | null;
}

export type ExecutionProviderSnapshot = Readonly<Record<TextExecutionProvider, ExecutionProviderState>>;

export interface ExecutionPlan {
    readonly requestId: string;
    /** Conversation that owns every message produced by this request. */
    readonly conversationId: string;
    readonly provider: ExecutionProvider;
    readonly model: string;
    readonly modelLabel: string;
    readonly privacy: ExecutionPrivacyPath;
    /** Total model context window in estimated tokens. */
    readonly contextWindow: number;
    /** Maximum prompt context in estimated tokens. */
    readonly contextBudget: number;
    /** Tokens kept free so the completion cannot overflow the model context. */
    readonly outputReserve: number;
    /** Maximum completion tokens passed to the provider. */
    readonly maxOutputTokens: number;
    readonly providerRevision: number;
    readonly endpoint: string | null;
    readonly sourceFlags: ExecutionSourceFlags;
    readonly route: RouteDecision;
    readonly routeReason: string;
    readonly mode: ExecutionMode;
}

export interface CreateExecutionPlanInput {
    readonly requestId: string;
    readonly conversationId: string;
    readonly message: string;
    readonly selectedProvider: TextExecutionProvider;
    readonly providers: ExecutionProviderSnapshot;
    readonly sourceFlags: ExecutionSourceFlags;
    readonly conversationLength: number;
    readonly autoRouteEnabled: boolean;
    readonly mode: ExecutionMode;
}

export interface ExecutionReadiness {
    readonly ready: boolean;
    readonly reason?: "provider-not-ready" | "model-changed" | "provider-changed";
}

export interface ExecutionMessageMeta {
    readonly requestId: string;
    readonly conversationId: string;
    readonly provider: ExecutionProvider;
    readonly providerLabel: string;
    readonly modelName: string;
    readonly privacy: ExecutionPrivacyPath;
    readonly route: RouteDecision;
    readonly routeReason: string;
    readonly contextBudget: number;
    readonly contextWindow: number;
    readonly outputReserve: number;
    readonly maxOutputTokens: number;
    readonly usedSearch: boolean;
    readonly usedDocs: boolean;
    readonly usedMemory: boolean;
    readonly usedPython: boolean;
    readonly agent: boolean;
}

const LOCAL_PROVIDERS: readonly TextExecutionProvider[] = ["browser", "chrome-ai", "ollama"];

function isLocalProviderState(state: ExecutionProviderState): boolean {
    return !state.networked;
}

export const DEFAULT_CONTEXT_WINDOWS: Readonly<Record<ExecutionProvider, number>> = Object.freeze({
    browser: 4_096,
    "chrome-ai": 4_096,
    ollama: 16_384,
    cloud: 32_768,
    image: 0,
});

export const DEFAULT_MAX_OUTPUT_TOKENS: Readonly<Record<ExecutionProvider, number>> = Object.freeze({
    browser: 1_024,
    "chrome-ai": 1_024,
    ollama: 2_048,
    cloud: 4_096,
    image: 0,
});

const PROVIDER_LABELS: Readonly<Record<ExecutionProvider, string>> = Object.freeze({
    browser: "WebGPU",
    ollama: "Ollama",
    cloud: "Cloud API",
    "chrome-ai": "Chrome AI",
    image: "Image API",
});

function selectLocalProvider(
    selectedProvider: TextExecutionProvider,
    providers: ExecutionProviderSnapshot
): TextExecutionProvider {
    if (
        selectedProvider !== "cloud" &&
        providers[selectedProvider].ready &&
        isLocalProviderState(providers[selectedProvider])
    ) {
        return selectedProvider;
    }

    const ready = LOCAL_PROVIDERS.find(
        provider => providers[provider].ready && isLocalProviderState(providers[provider])
    );
    if (ready) return ready;

    if (
        selectedProvider !== "cloud" &&
        providers[selectedProvider].configured &&
        isLocalProviderState(providers[selectedProvider])
    ) {
        return selectedProvider;
    }

    return (
        LOCAL_PROVIDERS.find(provider => providers[provider].configured && isLocalProviderState(providers[provider])) ||
        "browser"
    );
}

/** Selects the concrete provider represented by a routing decision. */
export function selectExecutionProvider(
    selectedProvider: TextExecutionProvider,
    route: RouteDecision,
    providers: ExecutionProviderSnapshot
): TextExecutionProvider {
    if (route === "cloud") return "cloud";
    if (route === "local") return selectLocalProvider(selectedProvider, providers);
    return selectedProvider;
}

export interface ExecutionBudgets {
    readonly contextWindow: number;
    readonly contextBudget: number;
    readonly outputReserve: number;
    readonly maxOutputTokens: number;
}

export function resolveExecutionBudgets(
    provider: ExecutionProvider,
    state?: Pick<ExecutionProviderState, "contextWindow" | "maxOutputTokens"> | null
): ExecutionBudgets {
    if (provider === "image") {
        return { contextWindow: 0, contextBudget: 0, outputReserve: 0, maxOutputTokens: 0 };
    }

    const reportedWindow = Math.floor(Number(state?.contextWindow));
    const contextWindow = reportedWindow > 1 ? reportedWindow : DEFAULT_CONTEXT_WINDOWS[provider];
    const reportedOutput = Math.floor(Number(state?.maxOutputTokens));
    const requestedOutput = reportedOutput > 0 ? reportedOutput : DEFAULT_MAX_OUTPUT_TOKENS[provider];
    const maxOutputTokens = Math.max(1, Math.min(requestedOutput, contextWindow - 1));
    const outputReserve = maxOutputTokens;

    return {
        contextWindow,
        contextBudget: Math.max(1, contextWindow - outputReserve),
        outputReserve,
        maxOutputTokens,
    };
}

export function contextBudgetForProvider(
    provider: ExecutionProvider,
    state?: Pick<ExecutionProviderState, "contextWindow" | "maxOutputTokens"> | null
): number {
    return resolveExecutionBudgets(provider, state).contextBudget;
}

export function resolveExecutionPrivacy(
    provider: ExecutionProvider,
    sourceFlags: { search: boolean },
    networked = false
): ExecutionPrivacyPath {
    if (provider === "cloud" || provider === "image") return "cloud";
    return sourceFlags.search || networked ? "mixed" : "local";
}

export function isLoopbackHostname(hostname: string): boolean {
    const normalized = hostname
        .trim()
        .toLowerCase()
        .replace(/^\[|\]$/g, "")
        .replace(/\.$/, "");
    return (
        normalized === "localhost" ||
        normalized.endsWith(".localhost") ||
        normalized === "::1" ||
        normalized === "0.0.0.0" ||
        normalized === "127.0.0.1" ||
        normalized.startsWith("127.")
    );
}

/** Invalid/missing endpoints are treated as networked to avoid a false LOCAL claim. */
export function isNetworkedEndpoint(endpoint?: string | null): boolean {
    if (!endpoint) return true;
    try {
        return !isLoopbackHostname(new URL(endpoint).hostname);
    } catch {
        return true;
    }
}

function calculateRoute(input: CreateExecutionPlanInput): RouteResult {
    if (input.mode === "image") return { decision: "default", reason: "image request" };
    if (!input.autoRouteEnabled) return { decision: "default", reason: "automatic routing disabled" };

    return routeMessage({
        message: input.message,
        hasDocuments: input.sourceFlags.documents,
        deepSearchEnabled: input.sourceFlags.search,
        conversationLength: input.conversationLength,
        localModelLoaded: LOCAL_PROVIDERS.some(
            provider => input.providers[provider].ready && isLocalProviderState(input.providers[provider])
        ),
        cloudConfigured: input.providers.cloud.configured,
    });
}

/**
 * Pure request planner. Routing and provider selection happen here, before any
 * readiness check or asynchronous context gathering begins.
 */
export function createExecutionPlan(input: CreateExecutionPlanInput): Readonly<ExecutionPlan> {
    const sourceFlags = Object.freeze({ ...input.sourceFlags });
    const route = calculateRoute(input);
    const provider: ExecutionProvider =
        input.mode === "image"
            ? "image"
            : selectExecutionProvider(input.selectedProvider, route.decision, input.providers);
    const providerState = provider === "image" ? null : input.providers[provider];
    const model = provider === "image" ? "pollinations-ai-horde" : providerState?.model || "";
    const modelLabel =
        provider === "image"
            ? "Pollinations / AI Horde"
            : providerState?.modelLabel || providerState?.model || PROVIDER_LABELS[provider];
    const budgets = resolveExecutionBudgets(provider, providerState);

    return Object.freeze({
        requestId: input.requestId,
        conversationId: input.conversationId,
        provider,
        model,
        modelLabel,
        privacy: resolveExecutionPrivacy(provider, sourceFlags, providerState?.networked),
        ...budgets,
        providerRevision: providerState?.revision || 0,
        endpoint: providerState?.endpoint || null,
        sourceFlags,
        route: route.decision,
        routeReason: route.reason,
        mode: input.mode,
    });
}

/** Checks the provider/model pinned in a plan against a provider snapshot. */
export function getExecutionReadiness(
    plan: Pick<ExecutionPlan, "provider" | "model" | "providerRevision">,
    providers: ExecutionProviderSnapshot
): ExecutionReadiness {
    if (plan.provider === "image") return { ready: true };

    const current = providers[plan.provider];
    if (!current.ready) return { ready: false, reason: "provider-not-ready" };
    if ((current.model || "") !== plan.model) return { ready: false, reason: "model-changed" };
    if ((current.revision || 0) !== plan.providerRevision) return { ready: false, reason: "provider-changed" };
    return { ready: true };
}

export function isExecutionPlanReady(
    plan: Pick<ExecutionPlan, "provider" | "model" | "providerRevision">,
    providers: ExecutionProviderSnapshot
): boolean {
    return getExecutionReadiness(plan, providers).ready;
}

/** Builds persisted/live message metadata from the immutable request plan. */
export function executionPlanToMessageMeta(
    plan: ExecutionPlan,
    observedSources: Partial<ExecutionSourceFlags> = {}
): ExecutionMessageMeta {
    const sourceFlags: ExecutionSourceFlags = { ...plan.sourceFlags, ...observedSources };
    const observedNetworkTool = Boolean(observedSources.search);
    return {
        requestId: plan.requestId,
        conversationId: plan.conversationId,
        provider: plan.provider,
        providerLabel: PROVIDER_LABELS[plan.provider],
        modelName: plan.modelLabel,
        // Observed network use may upgrade local -> mixed, but never downgrade
        // the privacy path declared when the request began.
        privacy: plan.privacy === "local" && observedNetworkTool ? "mixed" : plan.privacy,
        route: plan.route,
        routeReason: plan.routeReason,
        contextBudget: plan.contextBudget,
        contextWindow: plan.contextWindow,
        outputReserve: plan.outputReserve,
        maxOutputTokens: plan.maxOutputTokens,
        usedSearch: sourceFlags.search,
        usedDocs: sourceFlags.documents,
        usedMemory: sourceFlags.memory,
        usedPython: Boolean(observedSources.python),
        agent: sourceFlags.agent,
    };
}

let requestIdCounter = 0;

export function createExecutionRequestId(): string {
    if (globalThis.crypto?.randomUUID) return `req_${globalThis.crypto.randomUUID()}`;
    requestIdCounter += 1;
    return `req_${Date.now()}_${requestIdCounter}_${Math.random().toString(36).slice(2, 10)}`;
}
