import { NextRequest, NextResponse } from "next/server";

export class ApiRequestError extends Error {
    constructor(
        readonly status: 400 | 403 | 413 | 415,
        message: string
    ) {
        super(message);
        this.name = "ApiRequestError";
    }
}

/** Reject browser requests that originated outside this deployment. */
export function assertSameOriginRequest(request: NextRequest): void {
    const requestOrigin = new URL(request.url).origin;
    const origin = request.headers.get("origin");
    if (origin && origin !== requestOrigin) {
        throw new ApiRequestError(403, "Cross-origin requests are not allowed");
    }

    const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
    if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
        throw new ApiRequestError(403, "Cross-site requests are not allowed");
    }
}

/**
 * Reads JSON through a byte-counted stream. Content-Length is only an early
 * rejection hint; the decoded body is independently bounded.
 */
export async function readBoundedJson<T>(request: NextRequest, maxBytes: number): Promise<T> {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
        throw new ApiRequestError(415, "Content-Type must be application/json");
    }

    const declaredLength = request.headers.get("content-length");
    if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
        throw new ApiRequestError(413, "Payload too large");
    }

    if (!request.body) throw new ApiRequestError(400, "JSON body required");

    const reader = request.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let received = 0;
    let text = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > maxBytes) {
                await reader.cancel("Payload too large");
                throw new ApiRequestError(413, "Payload too large");
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
    } catch (error) {
        if (error instanceof ApiRequestError) throw error;
        throw new ApiRequestError(400, "Invalid UTF-8 request body");
    } finally {
        reader.releaseLock();
    }

    if (!text.trim()) throw new ApiRequestError(400, "JSON body required");
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new ApiRequestError(400, "Invalid JSON payload");
    }
}

export function apiRequestErrorResponse(error: unknown, headers: HeadersInit = {}): NextResponse | null {
    if (!(error instanceof ApiRequestError)) return null;
    return NextResponse.json({ error: error.message }, { status: error.status, headers });
}
