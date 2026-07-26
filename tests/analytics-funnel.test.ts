// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { setAnalyticsEnabled, trackFirstMessage, trackFunnelEvent } from "@/lib/core/analytics";

describe("privacy-preserving funnel tracking", () => {
    const sendBeacon = vi.fn(() => true);

    beforeEach(() => {
        localStorage.clear();
        sendBeacon.mockClear();
        Object.defineProperty(navigator, "sendBeacon", {
            configurable: true,
            value: sendBeacon,
        });
    });

    it("does not consume the first-message event before analytics consent", () => {
        expect(trackFirstMessage({ provider: "browser" })).toBe(false);
        expect(sendBeacon).not.toHaveBeenCalled();
        expect(localStorage.getItem("n0x_first_message_tracked")).toBeNull();

        setAnalyticsEnabled(true);

        expect(trackFirstMessage({ provider: "browser" })).toBe(true);
        expect(sendBeacon).toHaveBeenCalledOnce();
        expect(localStorage.getItem("n0x_first_message_tracked")).toBe("1");
        expect(trackFirstMessage({ provider: "browser" })).toBe(false);
        expect(sendBeacon).toHaveBeenCalledOnce();
    });

    it("falls back to fetch when sendBeacon declines the payload", () => {
        setAnalyticsEnabled(true);
        sendBeacon.mockReturnValueOnce(false);
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));

        expect(trackFunnelEvent("visit", { page: "chat" })).toBe(true);
        expect(fetchSpy).toHaveBeenCalledWith(
            "/api/analytics",
            expect.objectContaining({ method: "POST", keepalive: true })
        );

        fetchSpy.mockRestore();
    });
});
