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

const buckets = new Map<string, Bucket>();

function clientId(request: NextRequest): string {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || forwarded || "unknown";
}

function cleanup(now: number) {
    if (buckets.size < 1000) return;
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}

export function checkRateLimit(request: NextRequest, config: RateLimitConfig) {
    const now = Date.now();
    cleanup(now);

    const id = `${config.key}:${clientId(request)}`;
    const current = buckets.get(id);
    const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + config.windowMs };

    bucket.count += 1;
    buckets.set(id, bucket);

    const remaining = Math.max(0, config.limit - bucket.count);
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const headers = {
        "X-RateLimit-Limit": String(config.limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
    };

    if (bucket.count > config.limit) {
        return {
            allowed: false,
            response: NextResponse.json(
                { error: "Too many requests. Please wait a moment and try again." },
                { status: 429, headers: { ...headers, "Retry-After": String(retryAfter) } }
            ),
        };
    }

    return { allowed: true, headers };
}
