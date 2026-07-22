export interface ImageGenerationResult {
    success?: boolean;
    image?: string;
    provider?: string;
    error?: string;
}

const IMAGE_REQUEST_PATTERNS = [
    /^(generate|create|make|draw|paint|render)\s+(an?\s+)?(image|picture|photo|art|illustration)/i,
    /^image:\s*/i,
    /^\/image\s+/i,
];

export function isImageRequest(message: string): boolean {
    return IMAGE_REQUEST_PATTERNS.some(pattern => pattern.test(message));
}

export function normalizeImagePrompt(prompt: string): string {
    return prompt.replace(/^(generate|create|make|draw|image:|\/image)\s*/i, "");
}

export function imageCaption(prompt: string): string {
    return prompt
        .replace(/^(generate|create|make|draw|paint|render)\s+(an?\s+)?(image|picture|photo)\s+(of\s+)?/i, "")
        .trim();
}

export function imageProviderModel(provider?: string): string {
    return provider?.replace("pollinations-", "").replace("free-", "") || "ai";
}

export async function requestImageGeneration(
    prompt: string,
    options: { signal?: AbortSignal; normalizePrompt?: boolean } = {}
): Promise<ImageGenerationResult> {
    const response = await fetch("/api/image-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: options.normalizePrompt ? normalizeImagePrompt(prompt) : prompt }),
        signal: options.signal,
    });
    return (await response.json()) as ImageGenerationResult;
}
