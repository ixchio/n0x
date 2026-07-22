import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/core/logger";
import { checkRateLimit } from "@/lib/server/rate-limit";

const EVENTS = new Set([
    "visit",
    "provider_selected",
    "model_load_started",
    "model_load_succeeded",
    "model_load_failed",
    "first_message_sent",
    "document_uploaded",
    "search_used",
]);

const META_KEYS = new Set([
    "source",
    "page",
    "provider",
    "modelCategory",
    "force",
    "reason",
    "deepSearch",
    "hasDocs",
    "agent",
    "type",
    "sizeBucket",
]);

export async function POST(request: NextRequest) {
    const limit = checkRateLimit(request, {
        key: "analytics",
        limit: 120,
        windowMs: 10 * 60 * 1000,
    });
    if (!limit.allowed) return limit.response;

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > 8_192) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: limit.headers });
    }

    try {
        const body = await request.json();
        if (!EVENTS.has(body?.event)) {
            return NextResponse.json({ error: "Invalid event" }, { status: 400, headers: limit.headers });
        }

        const meta = typeof body.meta === "object" && body.meta ? body.meta : {};
        const sanitized = Object.fromEntries(
            Object.entries(meta)
                .filter(([key]) => META_KEYS.has(key))
                .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
                .map(([key, value]) => [key.slice(0, 40), typeof value === "string" ? value.slice(0, 80) : value])
        );

        logger.info("n0x_analytics", {
            event: body.event,
            path: typeof body.path === "string" ? body.path.slice(0, 120) : "",
            ts: typeof body.ts === "number" ? body.ts : Date.now(),
            meta: sanitized,
        });

        return new NextResponse(null, { status: 204, headers: limit.headers });
    } catch {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: limit.headers });
    }
}
