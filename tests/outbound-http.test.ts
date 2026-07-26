// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createRequestBudget,
    isAllowedHttpsUrl,
    normalizePublicHttpsUrl,
    OutboundResponseTooLargeError,
    readBoundedResponseJson,
} from "@/lib/server/outbound-http";
import { checkRateLimit } from "@/lib/server/rate-limit";

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe("bounded outbound responses", () => {
    it("bounds bytes read even when an upstream omits Content-Length", async () => {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('{"value":"'));
                controller.enqueue(new TextEncoder().encode("x".repeat(64)));
                controller.enqueue(new TextEncoder().encode('"}'));
                controller.close();
            },
        });

        await expect(readBoundedResponseJson(new Response(body), 32)).rejects.toBeInstanceOf(
            OutboundResponseTooLargeError
        );
    });

    it("rejects a declared oversized body before buffering it", async () => {
        const response = new Response("{}", { headers: { "content-length": "1000" } });

        await expect(readBoundedResponseJson(response, 100)).rejects.toMatchObject({ maxBytes: 100 });
    });
});

describe("outbound request budgets and URL policy", () => {
    it("propagates client aborts and the shared route deadline to child signals", () => {
        vi.useFakeTimers();
        const parent = new AbortController();
        const budget = createRequestBudget(parent.signal, 1_000);
        const child = budget.childSignal(10_000);

        parent.abort(new DOMException("client left", "AbortError"));
        expect(budget.signal.aborted).toBe(true);
        expect(child.aborted).toBe(true);
        budget.dispose();

        const timedBudget = createRequestBudget(new AbortController().signal, 500);
        vi.advanceTimersByTime(500);
        expect(timedBudget.signal.aborted).toBe(true);
        expect(timedBudget.signal.reason).toMatchObject({ name: "TimeoutError" });
        timedBudget.dispose();
    });

    it("allows public HTTPS URLs but rejects credentials, local networks, and unapproved asset hosts", () => {
        expect(normalizePublicHttpsUrl("https://Example.com/path?q=1")).toBe("https://example.com/path?q=1");
        expect(normalizePublicHttpsUrl("http://example.com/path")).toBeNull();
        expect(normalizePublicHttpsUrl("https://user:secret@example.com/path")).toBeNull();
        expect(normalizePublicHttpsUrl("https://127.0.0.1/private")).toBeNull();
        expect(normalizePublicHttpsUrl("https://169.254.169.254/latest/meta-data")).toBeNull();
        expect(normalizePublicHttpsUrl("https://service.internal/private")).toBeNull();
        expect(isAllowedHttpsUrl("https://cdn.stablehorde.net/image.webp", ["stablehorde.net"])).toBe(true);
        expect(isAllowedHttpsUrl("https://attacker.example/image.webp", ["stablehorde.net"])).toBe(false);
    });
});

describe("rate-limit client identity", () => {
    function request(headers: Record<string, string>) {
        return new NextRequest("https://n0x.test/api/deep-search", { headers });
    }

    it("ignores spoofable forwarded IPs unless deployment proxy trust is explicit", () => {
        vi.stubEnv("VERCEL", "");
        vi.stubEnv("CF_PAGES", "");
        vi.stubEnv("CF_WORKER", "");
        vi.stubEnv("N0X_TRUST_PROXY_HEADERS", "");
        const key = `untrusted-forwarding-${Date.now()}`;
        const config = { key, limit: 1, windowMs: 60_000 };
        const common = { "user-agent": "same browser", "accept-language": "en" };

        expect(checkRateLimit(request({ ...common, "x-forwarded-for": "198.51.100.1" }), config).allowed).toBe(true);
        expect(checkRateLimit(request({ ...common, "x-forwarded-for": "203.0.113.2" }), config).allowed).toBe(false);

        vi.stubEnv("VERCEL", "1");
        const trustedConfig = { key: `trusted-forwarding-${Date.now()}`, limit: 1, windowMs: 60_000 };
        expect(checkRateLimit(request({ ...common, "x-real-ip": "203.0.113.10" }), trustedConfig).allowed).toBe(true);
        expect(checkRateLimit(request({ ...common, "x-real-ip": "203.0.113.11" }), trustedConfig).allowed).toBe(true);
    });
});
