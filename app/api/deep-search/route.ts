import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/core/logger";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { apiRequestErrorResponse, assertSameOriginRequest, readBoundedJson } from "@/lib/server/request-policy";
import {
    abortableDelay,
    createRequestBudget,
    normalizePublicHttpsUrl,
    readBoundedResponseJson,
    readBoundedResponseText,
    type RequestBudget,
} from "@/lib/server/outbound-http";

export const maxDuration = 30;

// N0X Deep Search
// Multi-engine search with graceful fallback.
// No API key is required for the default engines; Brave/Tavily are optional upgrades.

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source: string;
}

interface SearchResponse {
    query: string;
    originalQuery?: string;
    refinedQuery?: string;
    results: SearchResult[];
    content: string[];
    sources: string[];
    summary?: string;
    answer?: string;
    error?: string;
    noUsefulResults?: boolean;
    providerStatus?: SearchProviderStatus[];
}

interface SearchProviderStatus {
    name: string;
    status: "ok" | "failed" | "disabled" | "skipped";
    detail?: string;
}

// ── Free Search Engines (no auth needed) ──

const SEARXNG_INSTANCES = [
    "https://search.sapti.me",
    "https://searx.be",
    "https://search.bus-hit.me",
    "https://searx.tiekoetter.com",
    "https://search.mdosch.de",
];

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const SEARCH_DEADLINE_MS = 24_000;
const SEARCH_JSON_LIMIT = 1_000_000;
const JINA_TEXT_LIMIT = 500_000;
const SEARX_HEDGE_DELAY_MS = 250;
// Brave API key is optional - use if you have one for better results

const CURRENT_YEAR = new Date().getFullYear();

const STOP_WORDS = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "based",
    "be",
    "best",
    "by",
    "current",
    "currently",
    "for",
    "from",
    "how",
    "in",
    "is",
    "latest",
    "of",
    "on",
    "or",
    "the",
    "to",
    "top",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
]);

const AI_MODEL_SOURCE_HOSTS = [
    "artificialanalysis.ai",
    "arena.ai",
    "lmarena.ai",
    "llm-stats.com",
    "openrouter.ai",
    "huggingface.co",
    "firstpagesage.com",
    "momenticmarketing.com",
    "business-standard.com",
    "sensortower.com",
];

const AI_MODEL_SOURCES: SearchResult[] = [
    {
        title: "Artificial Analysis LLM Leaderboard",
        url: "https://artificialanalysis.ai/leaderboards/models",
        snippet: "Current LLM leaderboard comparing model intelligence, speed, context, and price.",
        source: "curated",
    },
    {
        title: "LMArena Leaderboard",
        url: "https://arena.ai/leaderboard",
        snippet: "Arena leaderboard for comparing frontier AI models across text, image, vision, and other tasks.",
        source: "curated",
    },
    {
        title: "LLM Stats Leaderboard",
        url: "https://llm-stats.com/leaderboards/llm-leaderboard",
        snippet: "Model rankings across public benchmarks, speed, price, license, modality, and context window.",
        source: "curated",
    },
    {
        title: "OpenRouter Model Rankings",
        url: "https://openrouter.ai/rankings",
        snippet: "Model rankings and usage trends across hosted OpenAI-compatible AI models.",
        source: "curated",
    },
];

const AI_MODEL_USAGE_SOURCES: SearchResult[] = [
    {
        title: "OpenRouter Model Rankings",
        url: "https://openrouter.ai/rankings",
        snippet:
            "Model rankings based on benchmarks and real usage data from users accessing models through OpenRouter.",
        source: "curated",
    },
    {
        title: "OpenRouter Data",
        url: "https://openrouter.ai/data",
        snippet: "Usage-oriented model rankings and data from OpenRouter traffic.",
        source: "curated",
    },
    {
        title: "Top Generative AI Chatbots by Market Share",
        url: "https://firstpagesage.com/reports/top-generative-ai-chatbots/",
        snippet:
            "Market share trends for major generative AI chatbot products such as ChatGPT, Gemini, Perplexity, and Claude.",
        source: "curated",
    },
];

function boundedString(value: unknown, maxLength: number): string {
    return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function cleanQuery(input: string): string {
    let q = input.trim().replace(/\s+/g, " ");
    q = q
        .replace(/\bbes\s+ai\b/gi, "best AI")
        .replace(/\bbset\b/gi, "best")
        .replace(/\bbset\s+ai\b/gi, "best AI")
        .replace(/\bcurent\b/gi, "current")
        .replace(/\bcurently\b/gi, "currently")
        .replace(/\bmodle\b/gi, "model")
        .replace(/\bmodles\b/gi, "models")
        .replace(/\bllms\b/gi, "LLMs");
    return q;
}

function isAIModelRankingQuery(query: string): boolean {
    const q = query.toLowerCase();
    const hasModelTerm =
        /\b(ai\s+models?|llms?|large\s+language\s+models?|language\s+models?|gpt|claude|gemini|deepseek|mistral|llama|grok)\b/.test(
            q
        );
    const hasRankingIntent =
        /\b(best|top|current|currently|latest|leaderboard|rank|ranking|benchmark|compare|smartest|strongest)\b/.test(q);
    return hasModelTerm && hasRankingIntent;
}

function isAIModelPopularityQuery(query: string): boolean {
    const q = query.toLowerCase();
    const hasModelTerm =
        /\b(ai\s+models?|ai\s+chatbots?|llms?|large\s+language\s+models?|language\s+models?|chatgpt|gpt|claude|gemini|deepseek|mistral|llama|grok|perplexity)\b/.test(
            q
        );
    const hasUsageIntent =
        /\b(most\s+used|popular|popularity|usage|used|adoption|market\s+share|share|traffic|users|token\s+volume|widely\s+used)\b/.test(
            q
        );
    return hasModelTerm && hasUsageIntent;
}

function buildSearchIntent(rawQuery: string): {
    originalQuery: string;
    query: string;
    refinedQuery: string;
    aiModelRanking: boolean;
    aiModelPopularity: boolean;
} {
    const originalQuery = rawQuery.trim().replace(/\s+/g, " ");
    const query = cleanQuery(originalQuery);
    const aiModelRanking = isAIModelRankingQuery(query);
    const aiModelPopularity = isAIModelPopularityQuery(query);

    if (!aiModelRanking && !aiModelPopularity) {
        return { originalQuery, query, refinedQuery: query, aiModelRanking, aiModelPopularity };
    }

    if (aiModelPopularity) {
        const additions: string[] = [];
        if (!new RegExp(`\\b${CURRENT_YEAR}\\b`).test(query)) additions.push(String(CURRENT_YEAR));
        if (!/\bopenrouter/i.test(query)) additions.push("OpenRouter real usage data");
        if (!/\bmarket\s+share|traffic|users/i.test(query)) additions.push("chatbot market share traffic users");
        additions.push("ChatGPT Gemini Claude Perplexity");

        return {
            originalQuery,
            query,
            refinedQuery: [query, ...additions].join(" ").replace(/\s+/g, " ").trim(),
            aiModelRanking,
            aiModelPopularity,
        };
    }

    const additions: string[] = [];
    if (!/\bllm|large\s+language\s+model/i.test(query)) additions.push("LLM");
    if (!/\bleaderboard|benchmark|rank|ranking|arena/i.test(query)) additions.push("leaderboard benchmark");
    if (!new RegExp(`\\b${CURRENT_YEAR}\\b`).test(query)) additions.push(String(CURRENT_YEAR));
    if (!/\bartificial\s+analysis/i.test(query)) additions.push("Artificial Analysis");
    if (!/\blmarena|arena/i.test(query)) additions.push("LMArena");

    return {
        originalQuery,
        query,
        refinedQuery: [query, ...additions].join(" ").replace(/\s+/g, " ").trim(),
        aiModelRanking,
        aiModelPopularity,
    };
}

function normalizeToken(token: string): string {
    if (token === "models") return "model";
    if (token === "llms") return "llm";
    if (token === "rankings") return "ranking";
    if (token === "benchmarks") return "benchmark";
    return token;
}

function tokenize(text: string): string[] {
    const tokens = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map(normalizeToken)
        .filter(token => token.length > 1 && !STOP_WORDS.has(token));

    return Array.from(new Set(tokens));
}

function queryTerms(query: string, aiModelRanking: boolean, aiModelPopularity = false): string[] {
    const terms = new Set(tokenize(query));
    if (aiModelRanking) {
        ["ai", "model", "llm", "leaderboard", "benchmark", "ranking", "arena", "intelligence", "reasoning"].forEach(
            term => terms.add(term)
        );
    }
    if (aiModelPopularity) {
        [
            "ai",
            "model",
            "llm",
            "usage",
            "popular",
            "market",
            "share",
            "traffic",
            "users",
            "openrouter",
            "chatgpt",
            "gemini",
            "claude",
        ].forEach(term => terms.add(term));
    }
    return Array.from(terms);
}

function hostname(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

function isPreferredAIModelSource(url: string): boolean {
    const host = hostname(url);
    return AI_MODEL_SOURCE_HOSTS.some(sourceHost => host === sourceHost || host.endsWith(`.${sourceHost}`));
}

function termScore(text: string, terms: string[], weight: number): number {
    const lower = text.toLowerCase();
    let score = 0;
    for (const term of terms) {
        if (lower.includes(term)) score += weight;
    }
    return score;
}

function scoreResult(query: string, result: SearchResult, aiModelRanking: boolean, aiModelPopularity = false): number {
    const terms = queryTerms(query, aiModelRanking, aiModelPopularity);
    const title = result.title || "";
    const snippet = result.snippet || "";
    const combined = `${title} ${snippet} ${result.url}`.toLowerCase();
    let score = 0;

    score += termScore(title, terms, 3);
    score += termScore(snippet, terms, 1.5);
    score += termScore(result.url, terms, 0.35);

    if (aiModelRanking) {
        const hasModelTerm =
            /\b(ai|llm|model|models|language model|gpt|claude|gemini|deepseek|mistral|llama|grok)\b/.test(combined);
        const hasRankingTerm =
            /\b(leaderboard|benchmark|arena|rank|ranking|compare|intelligence|reasoning|score|eval)\b/.test(combined);
        if (!hasModelTerm) score -= 6;
        if (hasRankingTerm) score += 4;
        if (isPreferredAIModelSource(result.url)) score += 10;
        if (result.source === "wikipedia") score -= 8;
    }

    if (aiModelPopularity) {
        const hasModelTerm =
            /\b(ai|llm|model|models|chatbot|chatgpt|gpt|claude|gemini|deepseek|mistral|llama|grok|perplexity)\b/.test(
                combined
            );
        const hasUsageTerm =
            /\b(usage|popular|market share|traffic|users|token|volume|rank|ranking|data|openrouter)\b/.test(combined);
        if (!hasModelTerm) score -= 6;
        if (hasUsageTerm) score += 6;
        if (hostname(result.url) === "openrouter.ai" || hostname(result.url).endsWith(".openrouter.ai")) score += 12;
        if (
            /leaderboard|benchmark|intelligence index|arena/i.test(combined) &&
            !/usage|users|traffic|token|market share/i.test(combined)
        ) {
            score -= 4;
        }
        if (result.source === "wikipedia") score -= 8;
    }

    return score;
}

function scoreContent(query: string, content: string, aiModelRanking: boolean, aiModelPopularity = false): number {
    const terms = queryTerms(query, aiModelRanking, aiModelPopularity);
    const lower = content.toLowerCase();
    let score = termScore(content, terms, 1.4);

    if (aiModelRanking) {
        const hasModelTerm =
            /\b(ai|llm|model|models|language model|gpt|claude|gemini|deepseek|mistral|llama|grok)\b/.test(lower);
        const hasRankingTerm =
            /\b(leaderboard|benchmark|arena|rank|ranking|compare|intelligence|reasoning|score|eval)\b/.test(lower);
        if (!hasModelTerm) score -= 8;
        if (hasRankingTerm) score += 5;
    }

    if (aiModelPopularity) {
        const hasModelTerm =
            /\b(ai|llm|model|models|chatbot|chatgpt|gpt|claude|gemini|deepseek|mistral|llama|grok|perplexity)\b/.test(
                lower
            );
        const hasUsageTerm =
            /\b(usage|popular|market share|traffic|users|token|volume|rank|ranking|data|openrouter)\b/.test(lower);
        if (!hasModelTerm) score -= 8;
        if (hasUsageTerm) score += 7;
    }

    return score;
}

function rankResults(
    query: string,
    results: SearchResult[],
    aiModelRanking: boolean,
    aiModelPopularity = false
): SearchResult[] {
    const minimumScore = aiModelRanking || aiModelPopularity ? 3 : 1.5;
    return results
        .map(result => ({ result, score: scoreResult(query, result, aiModelRanking, aiModelPopularity) }))
        .filter(({ score }) => score >= minimumScore)
        .sort((a, b) => b.score - a.score)
        .map(({ result }) => result);
}

function rankContent(query: string, content: string[], aiModelRanking: boolean, aiModelPopularity = false): string[] {
    const minimumScore = aiModelRanking || aiModelPopularity ? 2.5 : 1.2;
    return content
        .map(text => ({ text, score: scoreContent(query, text, aiModelRanking, aiModelPopularity) }))
        .filter(({ text, score }) => text.trim().length > 40 && score >= minimumScore)
        .sort((a, b) => b.score - a.score)
        .map(({ text }) => text);
}

function addUniqueResult(results: SearchResult[], seenUrls: Set<string>, result: SearchResult): void {
    const url = normalizePublicHttpsUrl(result.url);
    if (!url || seenUrls.has(url)) return;
    results.push({ ...result, url });
    seenUrls.add(url);
}

function sourceFromContent(content: string): string | null {
    const match = content.match(/^\[Source:\s*([^\]]+)]/);
    return normalizePublicHttpsUrl(match?.[1]?.trim());
}

function cleanReaderMarkdown(text: string): string {
    return text
        .replace(/^Title:.*\n/m, "")
        .replace(/^URL Source:.*\n/m, "")
        .replace(/^Markdown Content:\n/m, "")
        .replace(/^Warning:.*\n/gm, "")
        .replace(/!\[[^\]]*]\([^)]+\)/g, "")
        .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
        .replace(/\n{3,}/g, "\n\n");
}

function isUsefulReaderLine(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length < 30) return false;
    if (/lowest price at frontier quality/i.test(trimmed)) return false;
    if (/^\|?\s*:?-{2,}/.test(trimmed)) return false;
    if (/^[\s|—–-]+$/.test(trimmed)) return false;
    if ((trimmed.match(/\|/g) || []).length > 4) return false;
    if ((trimmed.match(/\t/g) || []).length > 1) return false;
    if (/^\d+(?:\.\d+)?[kKmM]?\s+\$/.test(trimmed)) return false;
    return true;
}

async function searchSearXNG(
    query: string,
    budget: RequestBudget
): Promise<{ results: SearchResult[]; content: string[] }> {
    const losers = new AbortController();
    const attempts = SEARXNG_INSTANCES.map(async (instance, index) => {
        const combinedSignal = AbortSignal.any([budget.signal, losers.signal]);
        if (index > 0) await abortableDelay(index * SEARX_HEDGE_DELAY_MS, combinedSignal);

        const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en&time_range=&safesearch=0`;
        const res = await fetch(url, {
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0",
            },
            redirect: "error",
            signal: AbortSignal.any([budget.childSignal(6_000), losers.signal]),
        });
        if (!res.ok) throw new Error("SearXNG unavailable");

        const data = await readBoundedResponseJson<{ results?: unknown }>(res, SEARCH_JSON_LIMIT);
        const rows = Array.isArray(data.results) ? data.results : [];
        const normalizedRows = rows.slice(0, 8).flatMap(row => {
            if (!row || typeof row !== "object") return [];
            const item = row as Record<string, unknown>;
            const resultUrl = normalizePublicHttpsUrl(item.url);
            if (!resultUrl) return [];
            return [
                {
                    title: typeof item.title === "string" ? item.title.slice(0, 300) : "",
                    url: resultUrl,
                    text: typeof item.content === "string" ? item.content.slice(0, 1_500) : "",
                },
            ];
        });
        const results: SearchResult[] = normalizedRows.map(row => ({
            title: row.title,
            url: row.url,
            snippet: row.text.slice(0, 300),
            source: "searxng",
        }));
        if (results.length === 0) throw new Error("SearXNG returned no usable results");

        const content = normalizedRows
            .filter(result => result.text.length > 40)
            .slice(0, 5)
            .map(result => `[Source: ${result.url}]\n[${result.title}]\n${result.text}`);
        return { results, content };
    });

    try {
        return await Promise.any(attempts);
    } catch {
        return { results: [], content: [] };
    } finally {
        losers.abort(new DOMException("SearXNG winner selected", "AbortError"));
    }
}

async function searchBrave(
    query: string,
    budget: RequestBudget
): Promise<{ results: SearchResult[]; content: string[]; answer?: string } | null> {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey || apiKey.length < 10) return null;

    try {
        const url = `${BRAVE_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&count=10&text_decorations=false&search_lang=en`;
        const res = await fetch(url, {
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "X-Subscription-Token": apiKey,
            },
            redirect: "error",
            signal: budget.childSignal(5_000),
        });

        if (!res.ok) return null;
        const data = await readBoundedResponseJson<any>(res, SEARCH_JSON_LIMIT);
        const rows = Array.isArray(data.web?.results) ? data.web.results.slice(0, 8) : [];
        const normalizedRows: Array<{ title: string; url: string; description: string }> = rows.flatMap((row: any) => {
            const url = normalizePublicHttpsUrl(row?.url);
            if (!url) return [];
            return [
                {
                    title: boundedString(row?.title, 300),
                    url,
                    description: boundedString(row?.description, 1_500),
                },
            ];
        });

        const results: SearchResult[] = normalizedRows.map(row => ({
            title: row.title,
            url: row.url,
            snippet: row.description,
            source: "brave",
        }));

        const content: string[] = normalizedRows
            .filter(row => row.description.length > 50)
            .slice(0, 5)
            .map(row => `[Source: ${row.url}]\n[${row.title}]\n${row.description}`);

        // Brave's instant answer
        const answer = boundedString(data.query?.answer || data.infobox?.description, 4_000) || undefined;

        return { results, content, answer };
    } catch {
        if (!budget.signal.aborted) logger.warn("Brave search provider unavailable");
        return null;
    }
}

async function searchTavily(
    query: string,
    budget: RequestBudget
): Promise<{ results: SearchResult[]; content: string[]; summary?: string } | null> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey || apiKey.includes("xxxxxxx") || apiKey.length < 10) return null;

    try {
        const res = await fetch("https://api.tavily.com/search", {
            cache: "no-store",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: apiKey,
                query,
                search_depth: "advanced",
                max_results: 6,
                include_answer: true,
                include_raw_content: false,
            }),
            redirect: "error",
            signal: budget.childSignal(6_000),
        });
        if (!res.ok) return null;
        const response = await readBoundedResponseJson<any>(res, SEARCH_JSON_LIMIT);
        const rows = Array.isArray(response.results) ? response.results.slice(0, 8) : [];
        const normalizedRows: Array<{ title: string; url: string; content: string }> = rows.flatMap((row: any) => {
            const url = normalizePublicHttpsUrl(row?.url);
            if (!url) return [];
            return [
                {
                    title: boundedString(row?.title, 300),
                    url,
                    content: boundedString(row?.content, 1_500),
                },
            ];
        });

        const results: SearchResult[] = normalizedRows.map(row => ({
            title: row.title,
            url: row.url,
            snippet: row.content.slice(0, 200),
            source: "tavily",
        }));

        const content: string[] = normalizedRows
            .filter(row => row.content.length > 50)
            .slice(0, 4)
            .map(row => `[Source: ${row.url}]\n${row.content}`);

        return {
            results,
            content,
            summary: boundedString(response.answer, 4_000) || undefined,
        };
    } catch {
        if (!budget.signal.aborted) logger.warn("Tavily search provider unavailable");
        return null;
    }
}

async function getDDGInstant(
    query: string,
    budget: RequestBudget
): Promise<{ summary: string | null; results: SearchResult[] }> {
    try {
        const res = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
            { cache: "no-store", redirect: "error", signal: budget.childSignal(4_000) }
        );
        if (!res.ok) return { summary: null, results: [] };
        const data = await readBoundedResponseJson<any>(res, 500_000);

        let summary: string | null = null;
        const results: SearchResult[] = [];

        const abstract = boundedString(data.Abstract, 4_000);
        if (abstract.length > 30) {
            summary = abstract;
            const abstractUrl = normalizePublicHttpsUrl(data.AbstractURL);
            if (abstractUrl) {
                results.push({
                    title: boundedString(data.Heading, 300) || query,
                    url: abstractUrl,
                    snippet: abstract.slice(0, 200),
                    source: "duckduckgo",
                });
            }
        }

        const directAnswer = boundedString(data.Answer, 4_000);
        if (directAnswer && !summary) {
            summary = directAnswer;
        }

        if (Array.isArray(data.RelatedTopics)) {
            for (const topic of data.RelatedTopics.slice(0, 4)) {
                if (typeof topic?.Text === "string" && typeof topic?.FirstURL === "string") {
                    const topicUrl = normalizePublicHttpsUrl(topic.FirstURL);
                    if (!topicUrl) continue;
                    results.push({
                        title: boundedString(topic.Text, 80),
                        url: topicUrl,
                        snippet: boundedString(topic.Text, 200),
                        source: "duckduckgo",
                    });
                }
            }
        }

        return { summary, results };
    } catch {
        return { summary: null, results: [] };
    }
}

async function searchWikipedia(
    query: string,
    budget: RequestBudget
): Promise<{ results: SearchResult[]; content: string[] }> {
    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&origin=*`;
        const searchRes = await fetch(searchUrl, {
            cache: "no-store",
            redirect: "error",
            signal: budget.childSignal(5_000),
        });
        if (!searchRes.ok) return { results: [], content: [] };
        const searchData = await readBoundedResponseJson<any>(searchRes, 500_000);

        const pages = Array.isArray(searchData.query?.search) ? searchData.query.search.slice(0, 3) : [];
        if (pages.length === 0) return { results: [], content: [] };

        const titles = pages
            .map((page: any) => boundedString(page?.title, 300))
            .filter(Boolean)
            .join("|");
        if (!titles) return { results: [], content: [] };
        const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=extracts&exintro=false&explaintext=true&exchars=2000&format=json&origin=*`;
        const extractRes = await fetch(extractUrl, {
            cache: "no-store",
            redirect: "error",
            signal: budget.childSignal(5_000),
        });
        if (!extractRes.ok) return { results: [], content: [] };
        const extractData = await readBoundedResponseJson<any>(extractRes, SEARCH_JSON_LIMIT);

        const results: SearchResult[] = [];
        const content: string[] = [];

        if (extractData.query?.pages) {
            for (const page of (Object.values(extractData.query.pages) as any[]).slice(0, 3)) {
                const title = boundedString(page?.title, 300);
                const extract = boundedString(page?.extract, 2_000);
                if (title && extract.length > 50) {
                    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
                    results.push({
                        title,
                        url: wikiUrl,
                        snippet: extract.slice(0, 200),
                        source: "wikipedia",
                    });
                    content.push(`[Source: ${wikiUrl}]\n[Wikipedia: ${title}]\n${extract.slice(0, 1_500)}`);
                }
            }
        }

        return { results, content };
    } catch {
        return { results: [], content: [] };
    }
}

// ── Jina Reader for deep content extraction ──

async function extractWithJina(url: string, budget: RequestBudget): Promise<string> {
    try {
        const res = await fetch(`https://r.jina.ai/${url}`, {
            cache: "no-store",
            headers: {
                Accept: "text/plain",
                "X-Return-Format": "text",
                "X-Timeout": "5",
            },
            redirect: "error",
            signal: budget.childSignal(8_000),
        });

        if (!res.ok) return "";

        const text = cleanReaderMarkdown(await readBoundedResponseText(res, JINA_TEXT_LIMIT));
        const lines = text.split("\n").filter(isUsefulReaderLine);
        const clean = lines.join("\n").slice(0, 3500);

        return clean.length > 100 ? clean : "";
    } catch {
        return "";
    }
}

// ── Answer Synthesis (mini LLM-like summary from search results) ──

function synthesizeAnswer(query: string, allContent: string[], summary?: string): string {
    if (summary) return summary;

    if (isAIModelRankingQuery(query)) {
        const lines = allContent
            .flatMap(content => content.split("\n"))
            .map(line =>
                line
                    .replace(/^#+\s*/, "")
                    .replace(/^\*\s*/, "")
                    .trim()
            )
            .filter(line => line.length > 25);

        const directLines = lines
            .filter(line => /highest intelligence|currently leads|what is the best llm right now/i.test(line))
            .slice(0, 3);
        const taskLines = lines.filter(line => /^best (for|on)\b/i.test(line)).slice(0, 3);
        const highSignalLines = [...directLines, ...taskLines].slice(0, 5);

        if (highSignalLines.length > 0) {
            return highSignalLines.join(" ");
        }
    }

    if (isAIModelPopularityQuery(query)) {
        const usageLines = allContent
            .flatMap(content => content.split("\n"))
            .map(line =>
                line
                    .replace(/^#+\s*/, "")
                    .replace(/^\*\s*/, "")
                    .trim()
            )
            .filter(line => line.length > 35)
            .filter(line => /market share|traffic|users|real usage|token|popular|usage|openrouter/i.test(line))
            .filter(line => !/benchmark|intelligence index|highest intelligence/i.test(line))
            .slice(0, 4);

        if (usageLines.length > 0) {
            return usageLines.join(" ");
        }
    }

    // Extract key facts from content
    const facts: string[] = [];
    for (const content of allContent.slice(0, 3)) {
        const sentences = content.split(/[.!?]\s+/).filter(s => s.length > 20 && s.length < 200);
        facts.push(...sentences.slice(0, 2));
    }

    if (facts.length === 0) return "";

    // Simple fact-based answer
    const topFacts = facts.slice(0, 3).join(". ");
    return topFacts + (topFacts.endsWith(".") ? "" : ".");
}

// ── Main Handler ──

export async function POST(request: NextRequest) {
    try {
        assertSameOriginRequest(request);
    } catch (error) {
        return apiRequestErrorResponse(error)!;
    }

    const limit = checkRateLimit(request, {
        key: "deep-search",
        limit: 20,
        windowMs: 10 * 60 * 1000,
    });
    if (!limit.allowed) return limit.response;

    const budget = createRequestBudget(request.signal, SEARCH_DEADLINE_MS);
    try {
        const { query: rawQuery } = await readBoundedJson<{ query?: unknown }>(request, 16_384);
        if (typeof rawQuery !== "string" || !rawQuery.trim()) {
            return NextResponse.json({ error: "Query required" }, { status: 400, headers: limit.headers });
        }
        if (rawQuery.length > 1_000) {
            return NextResponse.json(
                { error: "Search query is too long. Keep it under 1,000 characters." },
                { status: 413, headers: limit.headers }
            );
        }

        const intent = buildSearchIntent(String(rawQuery));
        const { originalQuery, query, refinedQuery, aiModelRanking, aiModelPopularity } = intent;
        const aiModelSearch = aiModelRanking || aiModelPopularity;

        // Run ALL search engines in parallel for maximum speed
        const [tavilyResult, braveResult, searxResult, ddgResult, wikiResult] = await Promise.all([
            searchTavily(refinedQuery, budget).catch(() => null),
            searchBrave(refinedQuery, budget).catch(() => null),
            searchSearXNG(refinedQuery, budget).catch(() => ({ results: [], content: [] })),
            getDDGInstant(refinedQuery, budget).catch(() => ({ summary: null, results: [] })),
            aiModelSearch
                ? Promise.resolve({ results: [], content: [] })
                : searchWikipedia(refinedQuery, budget).catch(() => ({ results: [], content: [] })),
        ]);

        // Priority hierarchy: Tavily > Brave > SearXNG > Wikipedia > DDG
        let finalAnswer: string | undefined;
        const allResults: SearchResult[] = [];
        const seenUrls = new Set<string>();
        const allContent: string[] = [];
        const allSources: string[] = [];
        let jinaAttempted = false;
        let jinaHits = 0;

        // 1. Tavily (best quality, but requires API key)
        if (tavilyResult) {
            finalAnswer = tavilyResult.summary;
            for (const r of tavilyResult.results) {
                addUniqueResult(allResults, seenUrls, r);
            }
            allContent.push(...tavilyResult.content);
        }

        // 2. Brave (excellent quality, optional API key)
        if (braveResult) {
            finalAnswer = finalAnswer || braveResult.answer;
            for (const r of braveResult.results) {
                addUniqueResult(allResults, seenUrls, r);
            }
            allContent.push(...braveResult.content);
        }

        // 3. Merge free sources
        for (const r of [...searxResult.results, ...wikiResult.results, ...ddgResult.results]) {
            addUniqueResult(allResults, seenUrls, r);
        }

        // 3b. Known model leaderboard sources for broad "best/current AI model" questions.
        // These are source hints only; the app still fetches and ranks live page content.
        if (aiModelRanking) {
            for (const r of AI_MODEL_SOURCES) {
                addUniqueResult(allResults, seenUrls, r);
            }
        }
        if (aiModelPopularity) {
            for (const r of AI_MODEL_USAGE_SOURCES) {
                addUniqueResult(allResults, seenUrls, r);
            }
        }

        // 4. Collect content
        if (ddgResult.summary && !finalAnswer) {
            finalAnswer = ddgResult.summary;
            allContent.unshift(ddgResult.summary);
        }

        for (const c of [...searxResult.content, ...wikiResult.content]) {
            if (c && c.length > 40 && allContent.length < 6) {
                allContent.push(c);
            }
        }

        let rankedResults = rankResults(refinedQuery, allResults, aiModelRanking, aiModelPopularity).slice(0, 10);
        let rankedContent = rankContent(refinedQuery, allContent, aiModelRanking, aiModelPopularity).slice(0, 6);

        if (
            finalAnswer &&
            scoreContent(refinedQuery, finalAnswer, aiModelRanking, aiModelPopularity) < (aiModelSearch ? 4 : 1.2)
        ) {
            finalAnswer = undefined;
        }

        // 6. Deep content extraction if needed
        if (rankedContent.length < 3 && rankedResults.length > 0) {
            const jinaUrls = rankedResults
                .filter(r => r.source !== "wikipedia" && r.url.startsWith("http"))
                .slice(0, aiModelSearch ? 3 : 2)
                .map(r => r.url);

            if (jinaUrls.length > 0) {
                jinaAttempted = true;
                const extracts = await Promise.all(jinaUrls.map(url => extractWithJina(url, budget)));
                for (let i = 0; i < extracts.length; i++) {
                    if (extracts[i].length > 100 && allContent.length < 8) {
                        jinaHits++;
                        allContent.push(`[Source: ${jinaUrls[i]}]\n${extracts[i]}`);
                        if (!allSources.includes(jinaUrls[i])) {
                            allSources.push(jinaUrls[i]);
                        }
                    }
                }
                rankedContent = rankContent(refinedQuery, allContent, aiModelRanking, aiModelPopularity).slice(0, 6);
            }
        }

        // 7. Snippet fallback
        if (rankedContent.length === 0 && rankedResults.length > 0) {
            const snippetContent = rankedResults
                .filter(r => r.snippet.length > 20)
                .slice(0, 6)
                .map(r => `${r.title}: ${r.snippet}`)
                .join("\n\n");

            if (snippetContent) {
                allContent.push(snippetContent);
                rankedContent = rankContent(refinedQuery, allContent, aiModelRanking, aiModelPopularity).slice(0, 6);
            }
        }

        // 8. Collect sources after ranking so unrelated hits never reach the prompt.
        const rankedResultSources = rankedResults
            .slice(0, 6)
            .map(r => r.url)
            .filter(Boolean);
        const rankedContentSources = rankedContent
            .map(sourceFromContent)
            .filter((source): source is string => Boolean(source));
        const providerStatus: SearchProviderStatus[] = [
            {
                name: "Tavily",
                status: process.env.TAVILY_API_KEY ? (tavilyResult ? "ok" : "failed") : "disabled",
                detail: process.env.TAVILY_API_KEY ? "server key configured" : "optional server key missing",
            },
            {
                name: "Brave",
                status: process.env.BRAVE_API_KEY ? (braveResult ? "ok" : "failed") : "disabled",
                detail: process.env.BRAVE_API_KEY ? "server key configured" : "optional server key missing",
            },
            {
                name: "SearXNG",
                status: searxResult.results.length > 0 || searxResult.content.length > 0 ? "ok" : "failed",
                detail: `hedged across up to ${SEARXNG_INSTANCES.length} public instances`,
            },
            {
                name: "DuckDuckGo",
                status: ddgResult.summary || ddgResult.results.length > 0 ? "ok" : "failed",
                detail: "instant answer API",
            },
            {
                name: "Wikipedia",
                status: aiModelSearch
                    ? "skipped"
                    : wikiResult.results.length > 0 || wikiResult.content.length > 0
                      ? "ok"
                      : "failed",
                detail: aiModelSearch ? "skipped for model leaderboard query" : "encyclopedic fallback",
            },
            {
                name: "Jina Reader",
                status: jinaAttempted ? (jinaHits > 0 ? "ok" : "failed") : "skipped",
                detail: jinaAttempted ? `${jinaHits} readable page extract(s)` : "only used when snippets are thin",
            },
        ];

        if (rankedResults.length === 0 && rankedContent.length === 0) {
            return NextResponse.json(
                {
                    query,
                    originalQuery,
                    refinedQuery,
                    results: [],
                    content: [],
                    sources: [],
                    noUsefulResults: true,
                    providerStatus,
                } satisfies SearchResponse,
                { headers: limit.headers }
            );
        }

        // 9. Synthesize answer if we don't have one
        if (!finalAnswer && rankedContent.length > 0) {
            finalAnswer = synthesizeAnswer(refinedQuery, rankedContent);
        }

        const response: SearchResponse = {
            query,
            originalQuery,
            refinedQuery,
            results: rankedResults,
            content: rankedContent,
            sources: Array.from(new Set([...rankedContentSources, ...allSources, ...rankedResultSources])),
            summary: finalAnswer,
            answer: finalAnswer,
            providerStatus,
        };

        return NextResponse.json(response, { headers: limit.headers });
    } catch (error) {
        const policyResponse = apiRequestErrorResponse(error, limit.headers);
        if (policyResponse) return policyResponse;
        logger.error("Deep search route failed");
        return NextResponse.json(
            {
                query: "",
                results: [],
                content: [],
                sources: [],
                error: "Search temporarily unavailable. The AI will answer from its own knowledge.",
                providerStatus: [
                    {
                        name: "Deep Search",
                        status: "failed",
                        detail: "route handler failed before provider status could be collected",
                    },
                ],
            },
            { headers: limit.headers }
        );
    } finally {
        budget.abort();
        budget.dispose();
    }
}
