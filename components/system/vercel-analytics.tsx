"use client";

import { Analytics, type AnalyticsProps } from "@vercel/analytics/next";
import React, { useEffect, useState } from "react";
import { ANALYTICS_CONSENT_EVENT, analyticsEnabled } from "@/lib/core/analytics";

const ATTRIBUTION_PARAMS = new Set(["ref", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);

export const sanitizeAnalyticsEvent: NonNullable<AnalyticsProps["beforeSend"]> = event => {
    try {
        const baseUrl = typeof window === "undefined" ? "https://n0x.invalid" : window.location.origin;
        const incomingUrl = new URL(event.url, baseUrl);
        const sanitizedUrl = new URL(incomingUrl.pathname, incomingUrl.origin);

        for (const [key, value] of incomingUrl.searchParams) {
            if (ATTRIBUTION_PARAMS.has(key)) sanitizedUrl.searchParams.set(key, value.slice(0, 80));
        }

        return { ...event, url: sanitizedUrl.toString() };
    } catch {
        return null;
    }
};

export function VercelAnalytics() {
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        setEnabled(analyticsEnabled());

        const handleConsentChange = (event: Event) => {
            setEnabled((event as CustomEvent<boolean>).detail === true);
        };

        window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsentChange);
        return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsentChange);
    }, []);

    if (!enabled) return null;

    return <Analytics beforeSend={sanitizeAnalyticsEvent} />;
}
