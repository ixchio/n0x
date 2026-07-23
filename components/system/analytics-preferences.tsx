"use client";

import React, { useEffect, useState } from "react";
import { ANALYTICS_CONSENT_EVENT, analyticsEnabled, setAnalyticsEnabled } from "@/lib/core/analytics";

export function AnalyticsPreferences() {
    const [enabled, setEnabled] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        setEnabled(analyticsEnabled());
        setReady(true);

        const handleConsentChange = (event: Event) => {
            setEnabled((event as CustomEvent<boolean>).detail === true);
        };

        window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsentChange);
        return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsentChange);
    }, []);

    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div>
                <p className="font-medium text-zinc-200">Anonymous analytics</p>
                <p className="mt-1 text-sm text-zinc-500">Change takes effect immediately on this browser.</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="Anonymous analytics"
                disabled={!ready}
                onClick={() => setAnalyticsEnabled(!enabled)}
                className={`relative h-11 w-14 shrink-0 rounded-full border transition-colors disabled:cursor-wait disabled:opacity-50 ${
                    enabled ? "border-purple-400 bg-purple-500" : "border-zinc-700 bg-zinc-800"
                }`}
            >
                <span
                    aria-hidden="true"
                    className={`absolute left-0 top-3 h-5 w-5 rounded-full bg-white transition-transform ${
                        enabled ? "translate-x-7" : "translate-x-2"
                    }`}
                />
            </button>
        </div>
    );
}
