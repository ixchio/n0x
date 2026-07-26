"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { analyticsConsent, setAnalyticsEnabled, trackFunnelEvent } from "@/lib/core/analytics";

export function AnalyticsConsentBanner() {
    const [visible, setVisible] = useState(false);
    const [chatPortal, setChatPortal] = useState<HTMLElement | null>(null);
    const pathname = usePathname();
    const chatRoute = pathname.startsWith("/chat");

    useEffect(() => {
        setVisible(analyticsConsent() === null);
    }, []);

    useEffect(() => {
        setChatPortal(chatRoute ? document.getElementById("analytics-consent-slot") : null);
    }, [chatRoute, pathname]);

    if (!visible) return null;

    const choose = (enabled: boolean) => {
        setAnalyticsEnabled(enabled);
        setVisible(false);
        if (enabled) trackFunnelEvent("visit", { source: "consent_banner", page: window.location.pathname });
    };

    const banner = (
        <aside
            aria-label="Anonymous analytics preference"
            className={`z-30 rounded-xl border border-zinc-700 bg-zinc-950/95 p-4 text-zinc-200 shadow-2xl backdrop-blur ${
                chatRoute ? "relative mx-3 my-2 sm:mx-4 sm:max-w-2xl" : "fixed inset-x-3 bottom-3 mx-auto max-w-2xl"
            }`}
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 text-sm leading-6 text-zinc-300">
                    Optional anonymous usage analytics. Prompts, responses, files, names, memories, and keys are never
                    included.{" "}
                    <Link
                        href="/privacy"
                        className="rounded underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        Details
                    </Link>
                </p>
                <div className="flex shrink-0 gap-2">
                    <button
                        type="button"
                        onClick={() => choose(false)}
                        className="min-h-11 flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:flex-none"
                    >
                        No thanks
                    </button>
                    <button
                        type="button"
                        onClick={() => choose(true)}
                        className="min-h-11 flex-1 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:flex-none"
                    >
                        Allow analytics
                    </button>
                </div>
            </div>
        </aside>
    );

    if (chatRoute) return chatPortal ? createPortal(banner, chatPortal) : null;
    return banner;
}
