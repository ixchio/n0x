import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

interface RateLimitConfig {
    key: string;
    limit: number;
    windowMs: number;
}

interface Bucket {
    count: number;
    resetAt: number;
}

type RateLimitResult =
    | { allowed: true; headers: Record<string, string> }
    | { allowed: false; headers: Record<string, string>; response: NextResponse };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function normalizeIp(value: string | null): string | null {
    if (!value) return null;
    let candidate = value.split(",", 1)[0].trim();
    if (candidate.startsWith("[") && candidate.includes("]")) candidate = candidate.slice(1, candidate.indexOf("]"));
    else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) candidate = candidate.split(":", 1)[0];
    return isIP(candidate) ? candidate.toLowerCase() : null;
}

function stableFingerprint(value: string): string {
    let hash = 2_166_136_261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0).toString(36);
}

function clientId(request: NextRequest): string {
    // Forwarded IP headers are user-controlled unless a known deployment
    // proxy (or an explicit self-host opt-in) guarantees that it overwrites them.
    const trustVercel = process.env.VERCEL === "1";
    const trustCloudflare = Boolean(process.env.CF_PAGES || process.env.CF_WORKER);
    const trustSelfHostedProxy = process.env.N0X_TRUST_PROXY_HEADERS === "1";

    const trustedIp = trustVercel
        ? normalizeIp(request.headers.get("x-vercel-forwarded-for")) ||
          normalizeIp(request.headers.get("x-forwarded-for")) ||
          normalizeIp(request.headers.get("x-real-ip"))
        : trustCloudflare
          ? normalizeIp(request.headers.get("cf-connecting-ip"))
          : trustSelfHostedProxy
            ? normalizeIp(request.headers.get("x-forwarded-for")) || normalizeIp(request.headers.get("x-real-ip"))
            : null;
    if (trustedIp) return `ip:${trustedIp}`;

    // Avoid one global "unknown" bucket while keeping spoofable IP headers out
    // of the key. This is a best-effort fallback, not a security identity.
    const fingerprint = [
        request.headers.get("user-agent") || "unknown-agent",
        request.headers.get("accept-language") || "unknown-language",
        request.headers.get("sec-ch-ua") || "unknown-client",
    ].join("\n");
    return `client:${stableFingerprint(fingerprint)}`;
}

function cleanup(now: number) {
    if (buckets.size < 1000) return;
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}

function ensureCapacity() {
    while (buckets.size >= MAX_BUCKETS) {
        const oldest = buckets.keys().next().value;
        if (typeof oldest !== "string") break;
        buckets.delete(oldest);
    }
}

export function checkRateLimit(request: NextRequest, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    cleanup(now);

    const id = `${config.key}:${clientId(request)}`;
    const current = buckets.get(id);
    const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + config.windowMs };

    bucket.count += 1;
    if (!current) ensureCapacity();
    buckets.set(id, bucket);

    const remaining = Math.max(0, config.limit - bucket.count);
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const headers = {
        "Cache-Control": "no-store",
        "X-RateLimit-Limit": String(config.limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
    };

    if (bucket.count > config.limit) {
        return {
            allowed: false,
            headers,
            response: NextResponse.json(
                { error: "Too many requests. Please wait a moment and try again." },
                { status: 429, headers: { ...headers, "Retry-After": String(retryAfter) } }
            ),
        };
    }

    return { allowed: true, headers };
}
