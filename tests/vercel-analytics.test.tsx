// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsPreferences } from "@/components/system/analytics-preferences";
import { sanitizeAnalyticsEvent, VercelAnalytics } from "@/components/system/vercel-analytics";
import { analyticsEnabled, setAnalyticsEnabled } from "@/lib/core/analytics";

vi.mock("@vercel/analytics/next", () => ({
    Analytics: () => <div data-testid="vercel-analytics" />,
}));

describe("Vercel Analytics consent", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("loads only after telemetry consent and unloads when consent is revoked", async () => {
        render(<VercelAnalytics />);

        await waitFor(() => expect(screen.queryByTestId("vercel-analytics")).toBeNull());

        setAnalyticsEnabled(true);
        expect(await screen.findByTestId("vercel-analytics")).toBeTruthy();

        setAnalyticsEnabled(false);
        await waitFor(() => expect(screen.queryByTestId("vercel-analytics")).toBeNull());
    });

    it("keeps attribution while removing arbitrary query values and URL fragments", () => {
        const event = sanitizeAnalyticsEvent({
            type: "pageview",
            url: "https://n0xth.vercel.app/chat?ref=producthunt&conversation=private#message-2",
        });

        expect(event).toEqual({
            type: "pageview",
            url: "https://n0xth.vercel.app/chat?ref=producthunt",
        });
    });

    it("lets an existing user change consent from the privacy page", async () => {
        render(<AnalyticsPreferences />);
        const toggle = await screen.findByRole("switch", { name: "Anonymous analytics" });

        expect(toggle.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(toggle);

        await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
        expect(analyticsEnabled()).toBe(true);
    });
});
