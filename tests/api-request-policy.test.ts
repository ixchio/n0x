// @vitest-environment node

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { assertSameOriginRequest, readBoundedJson } from "@/lib/server/request-policy";

function request(body: string, headers: Record<string, string> = {}) {
    return new NextRequest("https://n0x.test/api/example", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
    });
}

describe("API request policy", () => {
    it("accepts a bounded same-origin JSON request", async () => {
        const value = request('{"query":"private docs"}', {
            origin: "https://n0x.test",
            "sec-fetch-site": "same-origin",
        });

        expect(() => assertSameOriginRequest(value)).not.toThrow();
        await expect(readBoundedJson(value, 1_024)).resolves.toEqual({ query: "private docs" });
    });

    it("rejects cross-origin and cross-site browser requests", () => {
        expect(() => assertSameOriginRequest(request("{}", { origin: "https://attacker.example" }))).toThrowError(
            expect.objectContaining({ status: 403 })
        );
        expect(() => assertSameOriginRequest(request("{}", { "sec-fetch-site": "cross-site" }))).toThrowError(
            expect.objectContaining({ status: 403 })
        );
    });

    it("requires JSON and rejects malformed JSON", async () => {
        const wrongType = new NextRequest("https://n0x.test/api/example", {
            method: "POST",
            headers: { "content-type": "text/plain" },
            body: "{}",
        });

        await expect(readBoundedJson(wrongType, 1_024)).rejects.toMatchObject({ status: 415 });
        await expect(readBoundedJson(request("{"), 1_024)).rejects.toMatchObject({ status: 400 });
    });

    it("enforces the bytes actually read instead of trusting Content-Length", async () => {
        const oversized = request(JSON.stringify({ query: "x".repeat(2_000) }), { "content-length": "1" });

        await expect(readBoundedJson(oversized, 128)).rejects.toMatchObject({ status: 413 });
    });
});
