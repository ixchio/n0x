import { PYODIDE_URL } from "./pyodideProtocol";
import { lockWorkerCapability } from "./pyodideIsolation";

export const BLOCKED_EGRESS_GLOBALS = [
    "BroadcastChannel",
    "fetchLater",
    "XMLHttpRequest",
    "WebSocket",
    "WebSocketStream",
    "EventSource",
    "WebTransport",
    "Worker",
    "SharedWorker",
    "RTCPeerConnection",
    "webkitRTCPeerConnection",
] as const;

export const BLOCKED_NAVIGATOR_GLOBALS = [
    "bluetooth",
    "clipboard",
    "credentials",
    "gpu",
    "hid",
    "locks",
    "mediaDevices",
    "sendBeacon",
    "serial",
    "serviceWorker",
    "storage",
    "usb",
] as const;

interface NetworkPolicyScope {
    fetch: typeof fetch;
    importScripts: (...urls: string[]) => void;
    navigator?: Record<string, unknown>;
    [key: string]: unknown;
}

function restrictedNavigator(source: Record<string, unknown>): Readonly<Record<string, unknown>> {
    return Object.freeze({
        hardwareConcurrency: source.hardwareConcurrency,
        language: source.language,
        languages: source.languages,
        platform: source.platform,
        userAgent: source.userAgent,
    });
}

function requestUrl(input: RequestInfo | URL): URL {
    if (typeof input === "string") return new URL(input);
    if (input instanceof URL) return new URL(input.href);
    return new URL(input.url);
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
    if (init?.method) return init.method.toUpperCase();
    if (typeof input === "object" && !(input instanceof URL) && "method" in input) {
        return String(input.method).toUpperCase();
    }
    return "GET";
}

export function isAllowedPyodideAsset(url: URL): boolean {
    const allowed = new URL(PYODIDE_URL);
    return (
        url.protocol === "https:" &&
        url.origin === allowed.origin &&
        url.username === "" &&
        url.password === "" &&
        url.pathname.startsWith(allowed.pathname) &&
        url.search === "" &&
        url.hash === ""
    );
}

/**
 * Keep only the transport Pyodide needs for its pinned runtime/package assets.
 * This is an egress policy, not a claim that Pyodide is a general-purpose
 * hardened sandbox.
 */
export function installPyodideNetworkPolicy(target: object): void {
    const scope = target as NetworkPolicyScope;
    if (typeof scope.fetch !== "function" || typeof scope.importScripts !== "function") {
        throw new Error("Python worker network primitives are unavailable");
    }

    const nativeFetch = scope.fetch.bind(target);
    const nativeImportScripts = scope.importScripts.bind(target);

    const restrictedFetch: typeof fetch = async (input, init) => {
        const url = requestUrl(input);
        if (requestMethod(input, init) !== "GET" || !isAllowedPyodideAsset(url)) {
            throw new TypeError("Python worker network access is limited to pinned Pyodide GET assets");
        }

        return nativeFetch(url.href, {
            body: undefined,
            cache: init?.cache,
            credentials: "omit",
            headers: undefined,
            integrity: init?.integrity,
            keepalive: false,
            method: "GET",
            mode: "cors",
            redirect: "error",
            referrerPolicy: "no-referrer",
            signal: init?.signal,
        });
    };

    const restrictedImportScripts = (...urls: string[]): void => {
        const parsed = urls.map(url => new URL(url));
        if (parsed.length === 0 || parsed.some(url => !isAllowedPyodideAsset(url))) {
            throw new TypeError("Python worker scripts are limited to pinned Pyodide assets");
        }
        nativeImportScripts(...parsed.map(url => url.href));
    };

    lockWorkerCapability(scope, "fetch", restrictedFetch);
    lockWorkerCapability(scope, "importScripts", restrictedImportScripts);
    for (const name of BLOCKED_EGRESS_GLOBALS) lockWorkerCapability(scope, name, undefined);

    if (scope.navigator) lockWorkerCapability(scope, "navigator", restrictedNavigator(scope.navigator));
}
