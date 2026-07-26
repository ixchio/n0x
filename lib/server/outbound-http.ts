import { isIP } from "node:net";

export class OutboundResponseTooLargeError extends Error {
    constructor(readonly maxBytes: number) {
        super(`Upstream response exceeded ${maxBytes} bytes`);
        this.name = "OutboundResponseTooLargeError";
    }
}

export interface RequestBudget {
    readonly signal: AbortSignal;
    readonly deadline: number;
    remainingMs: () => number;
    childSignal: (maxDurationMs: number) => AbortSignal;
    abort: (reason?: unknown) => void;
    dispose: () => void;
}

function abortError(message: string): DOMException {
    return new DOMException(message, "AbortError");
}

export function createRequestBudget(parentSignal: AbortSignal, durationMs: number): RequestBudget {
    const controller = new AbortController();
    const deadline = Date.now() + durationMs;
    const abortFromParent = () => controller.abort(parentSignal.reason || abortError("Request aborted"));

    if (parentSignal.aborted) abortFromParent();
    else parentSignal.addEventListener("abort", abortFromParent, { once: true });

    const timeout = setTimeout(
        () => controller.abort(new DOMException("Request deadline exceeded", "TimeoutError")),
        durationMs
    );

    return {
        signal: controller.signal,
        deadline,
        remainingMs: () => Math.max(0, deadline - Date.now()),
        childSignal: maxDurationMs => {
            const timeoutMs = Math.max(1, Math.min(maxDurationMs, deadline - Date.now()));
            return AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
        },
        abort: reason => controller.abort(reason || abortError("Request finished")),
        dispose: () => {
            clearTimeout(timeout);
            parentSignal.removeEventListener("abort", abortFromParent);
        },
    };
}

export async function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw signal.reason || abortError("Request aborted");

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timeout);
            reject(signal.reason || abortError("Request aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

export async function readBoundedResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
    const declaredLength = response.headers.get("content-length");
    if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
        await response.body?.cancel("Upstream response too large").catch(() => {});
        throw new OutboundResponseTooLargeError(maxBytes);
    }

    if (!response.body) return new Uint8Array();

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > maxBytes) {
                await reader.cancel("Upstream response too large").catch(() => {});
                throw new OutboundResponseTooLargeError(maxBytes);
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

export async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
    return new TextDecoder().decode(await readBoundedResponseBytes(response, maxBytes));
}

export async function readBoundedResponseJson<T>(response: Response, maxBytes: number): Promise<T> {
    return JSON.parse(await readBoundedResponseText(response, maxBytes)) as T;
}

function isNonPublicIp(hostname: string): boolean {
    const host = hostname.replace(/^\[|]$/g, "").toLowerCase();
    const version = isIP(host);
    if (version === 4) {
        const [a, b, c] = host.split(".").map(Number);
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 0) ||
            (a === 192 && b === 168) ||
            (a === 198 && (b === 18 || b === 19)) ||
            (a === 198 && b === 51 && c === 100) ||
            (a === 203 && b === 0 && c === 113) ||
            a >= 224
        );
    }
    if (version === 6) {
        return (
            host === "::" ||
            host === "::1" ||
            host.startsWith("::ffff:") ||
            /^f[cd]/.test(host) ||
            /^fe[89ab]/.test(host) ||
            host.startsWith("2001:db8:")
        );
    }
    return false;
}

/** Normalizes an untrusted URL for citations or provider-returned assets. */
export function normalizePublicHttpsUrl(input: unknown): string | null {
    if (typeof input !== "string" || input.length === 0 || input.length > 2_048) return null;

    try {
        const url = new URL(input);
        const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
        if (url.protocol !== "https:" || url.username || url.password || !hostname) return null;
        if (
            hostname === "localhost" ||
            hostname.endsWith(".localhost") ||
            hostname.endsWith(".local") ||
            hostname.endsWith(".internal") ||
            hostname.endsWith(".home.arpa") ||
            isNonPublicIp(hostname)
        ) {
            return null;
        }
        url.hostname = hostname;
        return url.toString();
    } catch {
        return null;
    }
}

export function isAllowedHttpsUrl(input: unknown, allowedHosts: readonly string[]): input is string {
    const normalized = normalizePublicHttpsUrl(input);
    if (!normalized) return false;
    const hostname = new URL(normalized).hostname;
    return allowedHosts.some(host => hostname === host || hostname.endsWith(`.${host}`));
}
