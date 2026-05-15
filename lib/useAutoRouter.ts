"use client";

// Hybrid Local-Cloud Auto-Router
// Classifies prompt complexity and routes to the optimal provider.
// Simple tasks → fast local model (private, instant)
// Complex tasks → Cloud API (70B quality)
// This is genuinely novel — no browser AI tool does automatic routing.

export type RouteDecision = "local" | "cloud" | "default";
export type TaskComplexity = "simple" | "moderate" | "complex";

interface RouteContext {
    message: string;
    hasDocuments: boolean;       // RAG documents attached
    deepSearchEnabled: boolean;  // Web search will run
    conversationLength: number;  // messages in current thread
    localModelLoaded: boolean;   // WebGPU/ChromeAI model available
    cloudConfigured: boolean;    // Cloud API key + model set
}

// Keyword patterns that indicate complexity
const COMPLEX_PATTERNS = [
    /\b(write|create|build|implement|develop|design|architect)\b.*\b(code|function|class|component|api|app|system|program|script)\b/i,
    /\b(explain|analyze|compare|evaluate|critique|review|assess)\b.{20,}/i,
    /\b(step[- ]by[- ]step|in[- ]depth|detailed|comprehensive|thorough)\b/i,
    /\b(debug|fix|refactor|optimize|improve)\b.*\b(code|function|error|bug|performance)\b/i,
    /\b(translate|convert|transform|migrate)\b.{15,}/i,
    /\b(essay|article|report|documentation|readme|paper)\b/i,
    /\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?|trade[- ]?offs?)\b/i,
    /```[\s\S]{20,}/,  // code blocks in the message
];

const SIMPLE_PATTERNS = [
    /^(hi|hey|hello|yo|sup|thanks|thank you|ok|okay|yes|no|sure|cool|got it|bye)\b/i,
    /^(what|who|when|where)\s+(is|are|was|were)\s+\w+\??$/i,  // Simple factual questions
    /^(define|meaning of|what does)\s+\w+/i,
    /^(summarize|tldr|sum up)\b/i,  // Summarization of existing content = local
    /^.{0,60}\?$/,  // Short questions under 60 chars
];

export function classifyComplexity(message: string): TaskComplexity {
    const trimmed = message.trim();
    const charCount = trimmed.length;
    const wordCount = trimmed.split(/\s+/).length;

    // Very short messages are almost always simple
    if (charCount < 30 && wordCount < 8) return "simple";

    // Check simple patterns first
    for (const pattern of SIMPLE_PATTERNS) {
        if (pattern.test(trimmed)) return "simple";
    }

    // Check complex patterns
    let complexHits = 0;
    for (const pattern of COMPLEX_PATTERNS) {
        if (pattern.test(trimmed)) complexHits++;
    }

    if (complexHits >= 2) return "complex";
    if (complexHits === 1 && charCount > 100) return "complex";
    if (complexHits === 1) return "moderate";

    // Long messages tend to be complex
    if (charCount > 300 || wordCount > 60) return "complex";
    if (charCount > 150 || wordCount > 30) return "moderate";

    return "simple";
}

export function routeMessage(ctx: RouteContext): { decision: RouteDecision; reason: string } {
    // Can't route if only one option exists
    if (!ctx.localModelLoaded && !ctx.cloudConfigured) {
        return { decision: "default", reason: "no provider available" };
    }
    if (!ctx.localModelLoaded) {
        return { decision: "cloud", reason: "no local model loaded" };
    }
    if (!ctx.cloudConfigured) {
        return { decision: "local", reason: "cloud not configured" };
    }

    // Both available — route based on task complexity
    const complexity = classifyComplexity(ctx.message);

    // Deep search + docs always benefit from cloud's larger context window
    if (ctx.deepSearchEnabled && ctx.hasDocuments) {
        return { decision: "cloud", reason: "search + docs → cloud for larger context" };
    }

    // Long conversations benefit from cloud's context window
    if (ctx.conversationLength > 20) {
        return { decision: "cloud", reason: "long conversation → cloud context" };
    }

    switch (complexity) {
        case "simple":
            return { decision: "local", reason: "simple task → fast local inference" };
        case "moderate":
            // Deep search elevates moderate to cloud
            if (ctx.deepSearchEnabled) {
                return { decision: "cloud", reason: "search + moderate → cloud quality" };
            }
            return { decision: "local", reason: "moderate task → local" };
        case "complex":
            return { decision: "cloud", reason: "complex task → cloud for quality" };
    }
}
