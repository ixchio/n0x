import { NextRequest, NextResponse } from "next/server";

// N0X Image Generation
// Strategy:
//   1. POLLINATIONS_API_KEY set → gen.pollinations.ai (free-tier key, reliable, no watermark)
//      Server fetches image, returns base64 data URL (never exposes key to client)
//   2. No key → image.pollinations.ai direct URL (free, rate-limited, may watermark)
//   3. Last resort → AI Horde (community, queue-based)
//
// Free Pollinations models (no paid pollen needed):
//   flux, flux-schnell, z-image-turbo, klein, wan-image, qwen-image, kontext

interface GenResult {
    image: string;   // URL or data:image/... base64
    provider: string;
}

// Free-tier models on gen.pollinations.ai — order: fast → quality
const FREE_MODELS = ["flux", "z-image-turbo", "klein", "flux-schnell", "wan-image", "qwen-image"];

// ── Authenticated Pollinations (gen.pollinations.ai) ──
// Returns base64 data URL so the API key never touches the client

async function tryPollinationsAuth(
    prompt: string, model: string, apiKey: string
): Promise<GenResult | null> {
    try {
        const seed = Math.floor(Math.random() * 999999);
        const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}` +
            `?width=768&height=768&model=${model}&seed=${seed}&nologo=true&enhance=true`;

        const res = await fetch(url, {
            headers: { "Authorization": `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(45000),
        });

        if (!res.ok) {
            console.warn(`Pollinations ${model}: HTTP ${res.status}`);
            return null;
        }

        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("image")) return null;

        // Convert to base64 data URL — key stays server-side
        const buf = await res.arrayBuffer();
        const mime = ct.split(";")[0].trim();
        const b64 = Buffer.from(buf).toString("base64");
        return { image: `data:${mime};base64,${b64}`, provider: `pollinations-${model}` };
    } catch (e) {
        console.warn(`Pollinations ${model} error:`, e);
        return null;
    }
}

async function tryPollinationsWithKey(
    prompt: string, apiKey: string, preferredModel?: string
): Promise<GenResult | null> {
    // Build model list: user preference first, then free fallbacks
    const models = preferredModel && FREE_MODELS.includes(preferredModel)
        ? [preferredModel, ...FREE_MODELS.filter(m => m !== preferredModel)]
        : [...FREE_MODELS];

    for (const model of models) {
        const result = await tryPollinationsAuth(prompt, model, apiKey);
        if (result) return result;
    }
    return null;
}

// ── Free Pollinations (image.pollinations.ai) ──
// No key needed. Returns a URL the browser loads directly (Pollinations generates on-demand).
// Turbo is fastest (~0.5s), flux can be slow/timeout without auth.

function pollinationsFreeUrl(prompt: string, model: string = "turbo"): GenResult {
    const seed = Math.floor(Math.random() * 999999);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
        `?width=768&height=768&model=${model}&seed=${seed}&nologo=true&enhance=true`;
    return { image: url, provider: `pollinations-free-${model}` };
}

// ── AI Horde (stablehorde.net) ──

const HORDE_API = "https://stablehorde.net/api/v2";

async function tryAIHorde(prompt: string): Promise<GenResult | null> {
    try {
        const submitRes = await fetch(`${HORDE_API}/generate/async`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": "0000000000",
                "Client-Agent": "n0x:2.0:github.com/ixchio/n0x",
            },
            body: JSON.stringify({
                prompt: `${prompt} ### highly detailed, sharp focus, professional quality`,
                params: { width: 512, height: 512, steps: 20, cfg_scale: 7.0, sampler_name: "k_euler_a", karras: true, n: 1 },
                nsfw: true, censor_nsfw: false, trusted_workers: false, slow_workers: true, r2: true,
            }),
            signal: AbortSignal.timeout(10000),
        });

        if (!submitRes.ok) return null;
        const { id: jobId } = await submitRes.json();
        if (!jobId) return null;

        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 3000));
            try {
                const checkRes = await fetch(`${HORDE_API}/generate/check/${jobId}`, {
                    headers: { "Client-Agent": "n0x:2.0:github.com/ixchio/n0x" },
                    signal: AbortSignal.timeout(5000),
                });
                if (!checkRes.ok) continue;
                const check = await checkRes.json();
                if (check.faulted) return null;
                if (check.done) break;
            } catch { continue; }
        }

        const statusRes = await fetch(`${HORDE_API}/generate/status/${jobId}`, {
            headers: { "Client-Agent": "n0x:2.0:github.com/ixchio/n0x" },
            signal: AbortSignal.timeout(10000),
        });
        if (!statusRes.ok) return null;
        const status = await statusRes.json();

        const gen = status.generations?.[0];
        if (!status.done || !gen?.img) return null;
        if (gen.img.startsWith("http")) return { image: gen.img, provider: `horde-${gen.model || "sd"}` };
        return { image: `data:image/webp;base64,${gen.img}`, provider: `horde-${gen.model || "sd"}` };
    } catch {
        return null;
    }
}

// ── Main handler ──

export async function POST(request: NextRequest) {
    try {
        const { prompt, model: preferredModel } = await request.json();
        if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

        const cleanPrompt = prompt
            .replace(/^(generate|create|make|draw|paint|render)\s+(an?\s+)?(image|picture|photo)\s+(of\s+)?/i, "")
            .replace(/^image:\s*/i, "")
            .replace(/^\/image\s+/i, "")
            .trim() || prompt;

        const apiKey = process.env.POLLINATIONS_API_KEY;
        let result: GenResult | null = null;

        // Path A: Free API key set → gen.pollinations.ai with auth (returns base64, key hidden)
        if (apiKey) {
            result = await tryPollinationsWithKey(cleanPrompt, apiKey, preferredModel);
        }

        // Path B: No key → image.pollinations.ai direct URL (client loads it)
        if (!result) {
            result = pollinationsFreeUrl(cleanPrompt, "turbo");
        }

        return NextResponse.json({ success: true, image: result.image, provider: result.provider });
    } catch (error) {
        console.error("Image gen error:", error);
        return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
}
