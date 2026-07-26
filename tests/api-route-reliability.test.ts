// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as deepSearch } from "@/app/api/deep-search/route";
import { POST as imageGeneration } from "@/app/api/image-gen/route";
import { logger } from "@/lib/core/logger";

function apiRequest(path: string, body: unknown, userAgent: string) {
    return new NextRequest(`https://n0x.test${path}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            origin: "https://n0x.test",
            "sec-fetch-site": "same-origin",
            "user-agent": userAgent,
        },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("deep-search upstream reliability", () => {
    it("hedges SearX instances, aborts the loser, rejects redirects, and filters unsafe result URLs", async () => {
        vi.stubEnv("BRAVE_API_KEY", "");
        vi.stubEnv("TAVILY_API_KEY", "");
        let firstSearxAborted = false;
        const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
            if (url.startsWith("https://search.sapti.me")) {
                return new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener(
                        "abort",
                        () => {
                            firstSearxAborted = true;
                            reject(init.signal?.reason);
                        },
                        { once: true }
                    );
                });
            }
            if (url.startsWith("https://searx.be")) {
                return Promise.resolve(
                    Response.json({
                        results: [
                            {
                                title: "AI model leaderboard one",
                                url: "https://public.example/models/one",
                                content:
                                    "AI model leaderboard benchmark ranking with current intelligence scores and comparisons.",
                            },
                            {
                                title: "AI model leaderboard two",
                                url: "https://public.example/models/two",
                                content:
                                    "Current LLM benchmark leaderboard compares reasoning, intelligence, and model quality.",
                            },
                            {
                                title: "AI model leaderboard three",
                                url: "https://public.example/models/three",
                                content:
                                    "Latest AI model ranking and arena benchmark results for leading language models.",
                            },
                            {
                                title: "unsafe local result",
                                url: "https://127.0.0.1/admin",
                                content: "AI model benchmark leaderboard that must not be returned as a source.",
                            },
                        ],
                    })
                );
            }
            if (url.startsWith("https://api.duckduckgo.com")) return Promise.resolve(Response.json({}));
            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        });
        vi.stubGlobal("fetch", fetchMock);

        const response = await deepSearch(
            apiRequest("/api/deep-search", { query: "best current AI model leaderboard" }, "deep-route-test")
        );
        if (!response) throw new Error("Deep-search route returned no response");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(firstSearxAborted).toBe(true);
        expect(body.results.some((result: { url: string }) => result.url.includes("127.0.0.1"))).toBe(false);
        expect(body.sources.every((source: string) => source.startsWith("https://"))).toBe(true);
        const searxCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/search?"));
        expect(searxCalls).toHaveLength(2);
        expect(searxCalls.every(([, init]) => init?.redirect === "error")).toBe(true);
        expect(fetchMock.mock.calls.every(([, init]) => init?.cache === "no-store")).toBe(true);
    });
});

describe("image-generation upstream reliability", () => {
    it("rejects oversized authenticated images and falls back without exposing provider credentials", async () => {
        vi.stubEnv("POLLINATIONS_API_KEY", "server-secret-key");
        const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
            if (url.startsWith("https://gen.pollinations.ai")) {
                return Promise.resolve(
                    new Response(new Uint8Array([1, 2, 3]), {
                        headers: {
                            "content-type": "image/png",
                            "content-length": String(12 * 1024 * 1024 + 1),
                        },
                    })
                );
            }
            if (url === "https://stablehorde.net/api/v2/generate/async") {
                return Promise.resolve(new Response(null, { status: 503 }));
            }
            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        });
        vi.stubGlobal("fetch", fetchMock);

        const response = await imageGeneration(
            apiRequest("/api/image-gen", { prompt: "a calm lake" }, "image-route-test")
        );
        if (!response) throw new Error("Image route returned no response");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(body.provider).toBe("pollinations-free-turbo");
        expect(body.image).toMatch(/^https:\/\/image\.pollinations\.ai\//);
        expect(JSON.stringify(body)).not.toContain("server-secret-key");
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(fetchMock.mock.calls.every(([, init]) => init?.redirect === "error")).toBe(true);
        expect(fetchMock.mock.calls.every(([, init]) => init?.cache === "no-store")).toBe(true);
    });

    it("refuses an untrusted Horde asset URL instead of returning it to the browser", async () => {
        vi.useFakeTimers();
        vi.stubEnv("POLLINATIONS_API_KEY", "server-secret-key");
        const fetchMock = vi.fn((input: string | URL | Request) => {
            const url = String(input);
            if (url.startsWith("https://gen.pollinations.ai")) {
                return Promise.resolve(new Response(null, { status: 503 }));
            }
            if (url.endsWith("/generate/async")) return Promise.resolve(Response.json({ id: "job-123" }));
            if (url.endsWith("/generate/check/job-123")) return Promise.resolve(Response.json({ done: true }));
            if (url.endsWith("/generate/status/job-123")) {
                return Promise.resolve(
                    Response.json({
                        done: true,
                        generations: [{ img: "https://127.0.0.1/private-image", model: "unsafe model" }],
                    })
                );
            }
            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        });
        vi.stubGlobal("fetch", fetchMock);

        const responsePromise = imageGeneration(
            apiRequest("/api/image-gen", { prompt: "a forest" }, "image-horde-policy-test")
        );
        await vi.advanceTimersByTimeAsync(3_000);
        const response = await responsePromise;
        if (!response) throw new Error("Image route returned no response");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.provider).toBe("pollinations-free-turbo");
        expect(body.image).not.toContain("127.0.0.1");
        expect(fetchMock).toHaveBeenCalledTimes(6);
    });
});
