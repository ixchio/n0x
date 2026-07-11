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

export function analyticsEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return localStorage.getItem(OPT_IN_KEY) === "1";
    } catch {
        return false;
    }
}

export function setAnalyticsEnabled(enabled: boolean) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(OPT_IN_KEY, enabled ? "1" : "0");
    } catch {}
}

export function trackFunnelEvent(event: FunnelEvent, meta: AnalyticsMeta = {}) {
    if (typeof window === "undefined" || !analyticsEnabled()) return;

    const body = JSON.stringify({
        event,
        path: window.location.pathname,
        ts: Date.now(),
        meta: sanitizeMeta(meta),
    });

    try {
        if (navigator.sendBeacon) {
            navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
            return;
        }
        fetch("/api/analytics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
        }).catch(() => {});
    } catch {}
}

export function trackFirstMessage(meta: AnalyticsMeta = {}) {
    if (typeof window === "undefined") return;
    try {
        if (localStorage.getItem(FIRST_MESSAGE_KEY) === "1") return;
        localStorage.setItem(FIRST_MESSAGE_KEY, "1");
        trackFunnelEvent("first_message_sent", meta);
    } catch {
        trackFunnelEvent("first_message_sent", meta);
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
