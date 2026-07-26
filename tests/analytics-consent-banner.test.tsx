// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsConsentBanner } from "@/components/system/analytics-consent-banner";
import { analyticsConsent } from "@/lib/core/analytics";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

describe("analytics consent banner", () => {
    beforeEach(() => {
        navigation.pathname = "/";
        localStorage.clear();
        Object.defineProperty(navigator, "sendBeacon", {
            configurable: true,
            value: vi.fn(() => true),
        });
    });

    afterEach(() => cleanup());

    it("asks once and records an explicit decline without sending telemetry", async () => {
        render(<AnalyticsConsentBanner />);
        const decline = await screen.findByRole("button", { name: "No thanks" });

        fireEvent.click(decline);

        expect(analyticsConsent()).toBe(false);
        expect(navigator.sendBeacon).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "No thanks" })).toBeNull();
    });

    it("starts a sanitized visit only after explicit opt-in", async () => {
        render(<AnalyticsConsentBanner />);
        fireEvent.click(await screen.findByRole("button", { name: "Allow analytics" }));

        expect(analyticsConsent()).toBe(true);
        await waitFor(() => expect(navigator.sendBeacon).toHaveBeenCalledOnce());
        const [, payload] = vi.mocked(navigator.sendBeacon).mock.calls[0];
        expect(payload).toBeInstanceOf(Blob);
    });

    it("moves into and out of the chat flow across client-side navigation", async () => {
        const { rerender } = render(
            <>
                <div id="analytics-consent-slot" data-testid="consent-slot" />
                <AnalyticsConsentBanner />
            </>
        );
        const slot = screen.getByTestId("consent-slot");
        expect(slot.contains(await screen.findByLabelText("Anonymous analytics preference"))).toBe(false);

        navigation.pathname = "/chat";
        rerender(
            <>
                <div id="analytics-consent-slot" data-testid="consent-slot" />
                <AnalyticsConsentBanner />
            </>
        );
        await waitFor(() => expect(slot.contains(screen.getByLabelText("Anonymous analytics preference"))).toBe(true));

        navigation.pathname = "/privacy";
        rerender(
            <>
                <div id="analytics-consent-slot" data-testid="consent-slot" />
                <AnalyticsConsentBanner />
            </>
        );
        await waitFor(() => expect(slot.children).toHaveLength(0));
        expect(screen.getByLabelText("Anonymous analytics preference").className).toContain("fixed");
    });
});
