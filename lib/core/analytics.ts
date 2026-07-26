"use client";

export type FunnelEvent =
    | "visit"
    | "provider_selected"
    | "model_load_started"
    | "model_load_succeeded"
    | "model_load_failed"
    | "first_message_sent"
    | "document_uploaded"
    | "search_used";

type AnalyticsMeta = Record<string, string | number | boolean | null | undefined>;

const OPT_IN_KEY = "n0x_analytics_opt_in";
const FIRST_MESSAGE_KEY = "n0x_first_message_tracked";
export const ANALYTICS_CONSENT_EVENT = "n0x:analytics-consent";
const META_KEYS = new Set([
    "source",
    "page",
    "provider",
    "modelCategory",
    "force",
    "reason",
    "deepSearch",
    "hasDocs",
    "agent",
    "type",
    "sizeBucket",
]);

export function analyticsConsent(): boolean | null {
    if (typeof window === "undefined") return null;
    try {
        const stored = localStorage.getItem(OPT_IN_KEY);
        if (stored === "1") return true;
        if (stored === "0") return false;
        return null;
    } catch {
        return null;
    }
}

export function analyticsEnabled(): boolean {
    return analyticsConsent() === true;
}

export function setAnalyticsEnabled(enabled: boolean) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(OPT_IN_KEY, enabled ? "1" : "0");
        window.dispatchEvent(new CustomEvent<boolean>(ANALYTICS_CONSENT_EVENT, { detail: enabled }));
    } catch {}
}

export function trackFunnelEvent(event: FunnelEvent, meta: AnalyticsMeta = {}): boolean {
    if (typeof window === "undefined" || !analyticsEnabled()) return false;

    const body = JSON.stringify({
        event,
        path: window.location.pathname,
        ts: Date.now(),
        meta: sanitizeMeta(meta),
    });

    try {
        if (navigator.sendBeacon) {
            const queued = navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
            if (queued) return true;
        }
        void fetch("/api/analytics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
        }).catch(() => {});
        return true;
    } catch {
        return false;
    }
}

export function trackFirstMessage(meta: AnalyticsMeta = {}): boolean {
    if (typeof window === "undefined" || !analyticsEnabled()) return false;
    try {
        if (localStorage.getItem(FIRST_MESSAGE_KEY) === "1") return false;
        const tracked = trackFunnelEvent("first_message_sent", meta);
        if (tracked) localStorage.setItem(FIRST_MESSAGE_KEY, "1");
        return tracked;
    } catch {
        return trackFunnelEvent("first_message_sent", meta);
    }
}

function sanitizeMeta(meta: AnalyticsMeta) {
    const safe: AnalyticsMeta = {};
    for (const [key, value] of Object.entries(meta)) {
        if (!META_KEYS.has(key)) continue;
        if (typeof value === "string") safe[key] = value.slice(0, 80);
        else if (typeof value === "number" || typeof value === "boolean" || value == null) safe[key] = value;
    }
    return safe;
}
