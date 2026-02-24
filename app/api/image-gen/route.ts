import { NextRequest, NextResponse } from "next/server";

// N0X Image Generation
// Priority: Pollinations (fast, multiple models) → AI Horde (community, free)
// All free, Pollinations API key optional (removes watermarks)

interface GenResult {
    image: string;
    provider: string;
}

// ── pollinations.ai ──

async function tryPollinations(prompt: string, model: string = "flux"): Promise<string | null> {
    try {
        const seed = Math.floor(Math.random() * 999999);
        const apiKey = process.env.POLLINATIONS_API_KEY;
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&model=${model}&seed=${seed}&nologo=true&enhance=true`;

        // Pollinations returns the image directly on GET — verify with a quick fetch
        // that follows redirects (the API sometimes 302s before serving the image)
        const res = await fetch(url, {
            method: "GET",
            headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {},
            signal: AbortSignal.timeout(30000),
        });

        if (res.ok && res.headers.get("content-type")?.includes("image")) {
            // Return the stable URL — the image is generated and cached server-side
            return apiKey ? `${url}&token=${apiKey}` : url;
        }
        return null;
    } catch {
        return null;
    }
}

async function tryPollinationsWithRetry(prompt: string): Promise<GenResult | null> {
    // Try models in order of quality
    const models = ["flux", "turbo"];
    for (const model of models) {
        const url = await tryPollinations(prompt, model);
        if (url) return { image: url, provider: `pollinations-${model}` };
    }
    return null;
}

// ── ai horde (stablehorde.net) ──
// Free, community-powered, anonymous access
// Uses /v2/generate/async → /v2/generate/check/{id} (light poll) → /v2/generate/status/{id} (get image)

const HORDE_API = "https://stablehorde.net/api/v2";
const HORDE_KEY = "0000000000"; // anonymous

async function tryAIHorde(prompt: string): Promise<GenResult | null> {
    try {
        // Step 1: Submit async generation request
        const submitRes = await fetch(`${HORDE_API}/generate/async`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": HORDE_KEY,
                "Client-Agent": "n0x:2.0:github.com/ixchio/n0x",
            },
            body: JSON.stringify({
                prompt: `${prompt} ### highly detailed, sharp focus, professional quality, 4k`,
                params: {
                    width: 512,
                    height: 512,
                    steps: 30,
                    cfg_scale: 7.5,
                    sampler_name: "k_euler_a",
                    karras: true,
                    n: 1,
                    post_processing: ["RealESRGAN_x2plus"], // upscale
                },
                nsfw: true,
                censor_nsfw: false,
                trusted_workers: false,
                slow_workers: true,
                r2: true, // use R2 CDN for faster image delivery
                models: [
                    "SDXL 1.0",
                    "AlbedoBase XL (SDXL)",
                    "Fustercluck",
                    "Deliberate",
                    "stable_diffusion",
                ],
            }),
            signal: AbortSignal.timeout(10000),
        });

        if (!submitRes.ok) {
            console.error("Horde submit failed:", submitRes.status, await submitRes.text());
            return null;
        }

        const submitData = await submitRes.json();
        const jobId = submitData.id;
        if (!jobId) return null;

        console.log(`Horde job submitted: ${jobId}`);

        // Step 2: Light poll with /check (no image data, just status)
        const deadline = Date.now() + 60000; // 60 second max wait
        let lastPosition = -1;

        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 2500));

            try {
                const checkRes = await fetch(`${HORDE_API}/generate/check/${jobId}`, {
                    headers: { "Client-Agent": "n0x:2.0:github.com/ixchio/n0x" },
                    signal: AbortSignal.timeout(5000),
                });

                if (!checkRes.ok) continue;
                const check = await checkRes.json();

                // Log position for debugging
                if (check.queue_position !== lastPosition) {
                    lastPosition = check.queue_position;
                    console.log(`Horde queue position: ${lastPosition}, wait: ${check.wait_time}s`);
                }

                if (check.faulted) {
                    console.error("Horde job faulted");
                    return null;
                }

                if (check.done) break;
            } catch {
                // Network hiccup, retry
                continue;
            }
        }

        // Step 3: Fetch full status with image
        const statusRes = await fetch(`${HORDE_API}/generate/status/${jobId}`, {
            headers: { "Client-Agent": "n0x:2.0:github.com/ixchio/n0x" },
            signal: AbortSignal.timeout(10000),
        });

        if (!statusRes.ok) return null;
        const status = await statusRes.json();

        if (status.done && status.generations?.[0]) {
            const gen = status.generations[0];

            // R2 CDN URL (preferred) or base64
            if (gen.img && gen.img.startsWith("http")) {
                return { image: gen.img, provider: `horde-${gen.model || "sd"}` };
            } else if (gen.img) {
                return { image: `data:image/webp;base64,${gen.img}`, provider: `horde-${gen.model || "sd"}` };
            }
        }

        return null;
    } catch (e) {
        console.error("Horde error:", e);
        return null;
    }
}

// ── main handler ──

export async function POST(request: NextRequest) {
    try {
        const { prompt, provider = "auto" } = await request.json();

        if (!prompt) {
            return NextResponse.json({ error: "Prompt required" }, { status: 400 });
        }

        // Clean prompt — strip command prefixes
        const cleanPrompt = prompt
            .replace(/^(generate|create|make|draw|paint|render)\s+(an?\s+)?(image|picture|photo)\s+(of\s+)?/i, "")
            .replace(/^image:\s*/i, "")
            .replace(/^\/image\s+/i, "")
            .trim() || prompt;

        let result: GenResult | null = null;

        // Auto: Pollinations first (faster), then AI Horde
        if (provider === "auto" || provider === "pollinations") {
            result = await tryPollinationsWithRetry(cleanPrompt);
        }

        if (!result && (provider === "auto" || provider === "horde")) {
            result = await tryAIHorde(cleanPrompt);
        }

        if (!result) {
            return NextResponse.json(
                { error: "All image providers are currently unavailable. Try again in a moment." },
                { status: 503 }
            );
        }

        return NextResponse.json({
            success: true,
            image: result.image,
            provider: result.provider,
        });
    } catch (error) {
        console.error("Image gen error:", error);
        return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
}
