import { NextRequest, NextResponse } from "next/server";
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

    try {
        const body = await request.json();
        if (!EVENTS.has(body?.event)) {
            return NextResponse.json({ error: "Invalid event" }, { status: 400 });
        }

        const meta = typeof body.meta === "object" && body.meta ? body.meta : {};
        const sanitized = Object.fromEntries(
            Object.entries(meta)
                .filter(([key]) => META_KEYS.has(key))
                .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
                .map(([key, value]) => [key.slice(0, 40), typeof value === "string" ? value.slice(0, 80) : value])
        );

        console.info("n0x_analytics", {
            event: body.event,
            path: typeof body.path === "string" ? body.path.slice(0, 120) : "",
            ts: typeof body.ts === "number" ? body.ts : Date.now(),
            meta: sanitized,
        });

        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
}
