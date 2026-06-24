import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/rate-limit";

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

function buildSearchIntent(rawQuery: string): {
    originalQuery: string;
    query: string;
    refinedQuery: string;
    aiModelRanking: boolean;
} {
    const originalQuery = rawQuery.trim().replace(/\s+/g, " ");
    const query = cleanQuery(originalQuery);
    const aiModelRanking = isAIModelRankingQuery(query);

    if (!aiModelRanking) {
        return { originalQuery, query, refinedQuery: query, aiModelRanking };
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

function queryTerms(query: string, aiModelRanking: boolean): string[] {
    const terms = new Set(tokenize(query));
    if (aiModelRanking) {
        ["ai", "model", "llm", "leaderboard", "benchmark", "ranking", "arena", "intelligence", "reasoning"].forEach(
            term => terms.add(term)
        );
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

function scoreResult(query: string, result: SearchResult, aiModelRanking: boolean): number {
    const terms = queryTerms(query, aiModelRanking);
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

    return score;
}

function scoreContent(query: string, content: string, aiModelRanking: boolean): number {
    const terms = queryTerms(query, aiModelRanking);
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

    return score;
}

function rankResults(query: string, results: SearchResult[], aiModelRanking: boolean): SearchResult[] {
    const minimumScore = aiModelRanking ? 5 : 1.5;
    return results
        .map(result => ({ result, score: scoreResult(query, result, aiModelRanking) }))
        .filter(({ score }) => score >= minimumScore)
        .sort((a, b) => b.score - a.score)
        .map(({ result }) => result);
}

function rankContent(query: string, content: string[], aiModelRanking: boolean): string[] {
    const minimumScore = aiModelRanking ? 4 : 1.2;
    return content
        .map(text => ({ text, score: scoreContent(query, text, aiModelRanking) }))
        .filter(({ text, score }) => text.trim().length > 40 && score >= minimumScore)
        .sort((a, b) => b.score - a.score)
        .map(({ text }) => text);
}

function addUniqueResult(results: SearchResult[], seenUrls: Set<string>, result: SearchResult): void {
    if (!result.url || seenUrls.has(result.url)) return;
    results.push(result);
    seenUrls.add(result.url);
}

function sourceFromContent(content: string): string | null {
    const match = content.match(/^\[Source:\s*([^\]]+)]/);
    return match?.[1]?.trim() || null;
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

async function searchSearXNG(query: string, timeout = 6000): Promise<{ results: SearchResult[]; content: string[] }> {
    for (const instance of SEARXNG_INSTANCES) {
        try {
            const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en&time_range=&safesearch=0`;
            const res = await fetch(url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0",
                },
                signal: AbortSignal.timeout(timeout),
            });

            if (!res.ok) continue;
            const data = await res.json();

            if (!data.results || data.results.length === 0) continue;

            const results: SearchResult[] = data.results.slice(0, 8).map((r: any) => ({
                title: r.title || "",
                url: r.url || "",
                snippet: (r.content || "").slice(0, 300),
                source: "searxng",
            }));

            const content: string[] = data.results
                .filter((r: any) => r.content && r.content.length > 40)
                .slice(0, 5)
                .map((r: any) => {
                    const text = r.content.slice(0, 1500);
                    return `[Source: ${r.url || ""}]\n[${r.title}]\n${text}`;
                });

            if (results.length > 0) {
                return { results, content };
            }
        } catch {
            continue;
        }
    }

    return { results: [], content: [] };
}

async function searchBrave(
    query: string
): Promise<{ results: SearchResult[]; content: string[]; answer?: string } | null> {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey || apiKey.length < 10) return null;

    try {
        const url = `${BRAVE_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&count=10&text_decorations=false&search_lang=en`;
        const res = await fetch(url, {
            headers: {
                Accept: "application/json",
                "X-Subscription-Token": apiKey,
            },
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) return null;
        const data = await res.json();

        const results: SearchResult[] = (data.web?.results || []).slice(0, 8).map((r: any) => ({
            title: r.title || "",
            url: r.url || "",
            snippet: r.description || "",
            source: "brave",
        }));

        const content: string[] = (data.web?.results || [])
            .filter((r: any) => r.description && r.description.length > 50)
            .slice(0, 5)
            .map((r: any) => `[Source: ${r.url || ""}]\n[${r.title}]\n${r.description}`);

        // Brave's instant answer
        const answer = data.query?.answer || data.infobox?.description || undefined;

        return { results, content, answer };
    } catch (e) {
        console.error("Brave search error:", e);
        return null;
    }
}

async function searchTavily(
    query: string
): Promise<{ results: SearchResult[]; content: string[]; summary?: string } | null> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey || apiKey.includes("xxxxxxx") || apiKey.length < 10) return null;

    try {
        const res = await fetch("https://api.tavily.com/search", {
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
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return null;
        const response = await res.json();

        const results: SearchResult[] = (response.results || []).map((r: any) => ({
            title: r.title || "",
            url: r.url || "",
            snippet: r.content?.slice(0, 200) || "",
            source: "tavily",
        }));

        const content: string[] = (response.results || [])
            .filter((r: any) => r.content && r.content.length > 50)
            .slice(0, 4)
            .map((r: any) => `[Source: ${r.url || ""}]\n${r.content.slice(0, 1500)}`);

        return {
            results,
            content,
            summary: response.answer || undefined,
        };
    } catch (e) {
        console.error("Tavily error:", e);
        return null;
    }
}

async function getDDGInstant(query: string): Promise<{ summary: string | null; results: SearchResult[] }> {
    try {
        const res = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
            { signal: AbortSignal.timeout(4000) }
        );
        const data = await res.json();

        let summary: string | null = null;
        const results: SearchResult[] = [];

        if (data.Abstract && data.Abstract.length > 30) {
            summary = data.Abstract;
            results.push({
                title: data.Heading || query,
                url: data.AbstractURL || "",
                snippet: data.Abstract.slice(0, 200),
                source: "duckduckgo",
            });
        }

        if (data.Answer && !summary) {
            summary = data.Answer;
        }

        if (data.RelatedTopics) {
            for (const topic of data.RelatedTopics.slice(0, 4)) {
                if (topic.Text && topic.FirstURL) {
                    results.push({
                        title: topic.Text.slice(0, 80),
                        url: topic.FirstURL,
                        snippet: topic.Text.slice(0, 200),
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

async function searchWikipedia(query: string): Promise<{ results: SearchResult[]; content: string[] }> {
    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&origin=*`;
        const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
        const searchData = await searchRes.json();

        const pages = searchData.query?.search || [];
        if (pages.length === 0) return { results: [], content: [] };

        const titles = pages.map((p: any) => p.title).join("|");
        const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=extracts&exintro=false&explaintext=true&exchars=2000&format=json&origin=*`;
        const extractRes = await fetch(extractUrl, { signal: AbortSignal.timeout(5000) });
        const extractData = await extractRes.json();

        const results: SearchResult[] = [];
        const content: string[] = [];

        if (extractData.query?.pages) {
            for (const page of Object.values(extractData.query.pages) as any[]) {
                if (page.extract && page.extract.length > 50) {
                    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
                    results.push({
                        title: page.title,
                        url: wikiUrl,
                        snippet: page.extract.slice(0, 200),
                        source: "wikipedia",
                    });
                    content.push(`[Source: ${wikiUrl}]\n[Wikipedia: ${page.title}]\n${page.extract.slice(0, 1500)}`);
                }
            }
        }

        return { results, content };
    } catch {
        return { results: [], content: [] };
    }
}

// ── Jina Reader for deep content extraction ──

async function extractWithJina(url: string): Promise<string> {
    try {
        const res = await fetch(`https://r.jina.ai/${url}`, {
            headers: {
                Accept: "text/plain",
                "X-Return-Format": "text",
                "X-Timeout": "5",
            },
            signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) return "";

        const text = cleanReaderMarkdown(await res.text());
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
        const limit = checkRateLimit(request, {
            key: "deep-search",
            limit: 20,
            windowMs: 10 * 60 * 1000,
        });
        if (!limit.allowed) return limit.response;

        const { query: rawQuery } = await request.json();
        if (!rawQuery) {
            return NextResponse.json({ error: "Query required" }, { status: 400 });
        }

        const intent = buildSearchIntent(String(rawQuery));
        const { originalQuery, query, refinedQuery, aiModelRanking } = intent;

        // Run ALL search engines in parallel for maximum speed
        const [tavilyResult, braveResult, searxResult, ddgResult, wikiResult] = await Promise.all([
            searchTavily(refinedQuery).catch(() => null),
            searchBrave(refinedQuery).catch(() => null),
            searchSearXNG(refinedQuery).catch(() => ({ results: [], content: [] })),
            getDDGInstant(refinedQuery).catch(() => ({ summary: null, results: [] })),
            aiModelRanking
                ? Promise.resolve({ results: [], content: [] })
                : searchWikipedia(refinedQuery).catch(() => ({ results: [], content: [] })),
        ]);

        // Priority hierarchy: Tavily > Brave > SearXNG > Wikipedia > DDG
        let finalAnswer: string | undefined;
        const allResults: SearchResult[] = [];
        const seenUrls = new Set<string>();
        const allContent: string[] = [];
        const allSources: string[] = [];

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

        let rankedResults = rankResults(refinedQuery, allResults, aiModelRanking).slice(0, 10);
        let rankedContent = rankContent(refinedQuery, allContent, aiModelRanking).slice(0, 6);

        if (finalAnswer && scoreContent(refinedQuery, finalAnswer, aiModelRanking) < (aiModelRanking ? 4 : 1.2)) {
            finalAnswer = undefined;
        }

        // 6. Deep content extraction if needed
        if (rankedContent.length < 3 && rankedResults.length > 0) {
            const jinaUrls = rankedResults
                .filter(r => r.source !== "wikipedia" && r.url.startsWith("http"))
                .slice(0, aiModelRanking ? 3 : 2)
                .map(r => r.url);

            if (jinaUrls.length > 0) {
                const extracts = await Promise.all(jinaUrls.map(extractWithJina));
                for (let i = 0; i < extracts.length; i++) {
                    if (extracts[i].length > 100 && allContent.length < 8) {
                        allContent.push(`[Source: ${jinaUrls[i]}]\n${extracts[i]}`);
                        if (!allSources.includes(jinaUrls[i])) {
                            allSources.push(jinaUrls[i]);
                        }
                    }
                }
                rankedContent = rankContent(refinedQuery, allContent, aiModelRanking).slice(0, 6);
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
                rankedContent = rankContent(refinedQuery, allContent, aiModelRanking).slice(0, 6);
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

        if (rankedResults.length === 0 && rankedContent.length === 0) {
            return NextResponse.json({
                query,
                originalQuery,
                refinedQuery,
                results: [],
                content: [],
                sources: [],
                noUsefulResults: true,
            } satisfies SearchResponse);
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
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("Deep search error:", error);
        return NextResponse.json({
            query: "",
            results: [],
            content: [],
            sources: [],
            error: "Search temporarily unavailable. The AI will answer from its own knowledge.",
        });
    }
}
