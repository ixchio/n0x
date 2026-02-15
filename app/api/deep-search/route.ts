import { NextRequest, NextResponse } from "next/server";

// N0X Deep Search — Robust Multi-Engine
// Strategy: Try multiple free search engines in parallel,
// merge results, ALWAYS return valid data (never crash)

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source: string;
}

interface SearchResponse {
    query: string;
    results: SearchResult[];
    content: string[];
    sources: string[];
    summary?: string;
    error?: string;
}

// ── SearXNG (free, no key, JSON API) ──

const SEARXNG_INSTANCES = [
    "https://search.sapti.me",
    "https://searx.be",
    "https://search.bus-hit.me",
    "https://searx.tiekoetter.com",
    "https://search.mdosch.de",
];

async function searchSearXNG(query: string): Promise<{ results: SearchResult[]; content: string[] }> {
    // Try multiple instances in case one is down
    for (const instance of SEARXNG_INSTANCES) {
        try {
            const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en&time_range=&safesearch=0`;
            const res = await fetch(url, {
                headers: {
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
                },
                signal: AbortSignal.timeout(6000),
            });

            if (!res.ok) continue;
            const data = await res.json();

            if (!data.results || data.results.length === 0) continue;

            const results: SearchResult[] = data.results
                .slice(0, 8)
                .map((r: any) => ({
                    title: r.title || "",
                    url: r.url || "",
                    snippet: (r.content || "").slice(0, 300),
                    source: "searxng",
                }));

            const content: string[] = data.results
                .filter((r: any) => r.content && r.content.length > 40)
                .slice(0, 4)
                .map((r: any) => {
                    const text = r.content.slice(0, 1500);
                    return `[${r.title}]\n${text}`;
                });

            if (results.length > 0) {
                return { results, content };
            }
        } catch {
            // Try next instance
            continue;
        }
    }

    return { results: [], content: [] };
}

// ── Tavily (if API key configured) ──

async function searchTavily(query: string): Promise<{ results: SearchResult[]; content: string[]; summary?: string } | null> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey || apiKey.includes("xxxxxxx") || apiKey.length < 10) return null;

    try {
        const { tavily } = await import("@tavily/core");
        const client = tavily({ apiKey });
        const response = await client.search(query, {
            searchDepth: "advanced",
            maxResults: 5,
            includeAnswer: true,
            includeRawContent: false,
        });

        const results: SearchResult[] = (response.results || []).map((r: any) => ({
            title: r.title || "",
            url: r.url || "",
            snippet: r.content?.slice(0, 200) || "",
            source: "tavily",
        }));

        const content: string[] = (response.results || [])
            .filter((r: any) => r.content && r.content.length > 50)
            .slice(0, 3)
            .map((r: any) => r.content.slice(0, 1500));

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

// ── DuckDuckGo Instant Answer API (reliable, no scraping) ──

async function getDDGInstant(query: string): Promise<{ summary: string | null; results: SearchResult[] }> {
    try {
        const res = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
            { signal: AbortSignal.timeout(4000) }
        );
        const data = await res.json();

        let summary: string | null = null;
        const results: SearchResult[] = [];

        // Abstract (Wikipedia-sourced usually)
        if (data.Abstract && data.Abstract.length > 30) {
            summary = data.Abstract;
            results.push({
                title: data.Heading || query,
                url: data.AbstractURL || "",
                snippet: data.Abstract.slice(0, 200),
                source: "duckduckgo",
            });
        }

        // Direct answer
        if (data.Answer && !summary) {
            summary = data.Answer;
        }

        // Related topics
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

// ── Wikipedia API (always works) ──

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
                    content.push(`[Wikipedia: ${page.title}]\n${page.extract.slice(0, 1500)}`);
                }
            }
        }

        return { results, content };
    } catch {
        return { results: [], content: [] };
    }
}

// ── Jina content extraction (for URL enrichment) ──

async function extractWithJina(url: string): Promise<string> {
    try {
        const res = await fetch(`https://r.jina.ai/${url}`, {
            headers: { Accept: "text/plain", "X-Return-Format": "text" },
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return "";

        let text = await res.text();
        text = text
            .replace(/^Title:.*\n/m, "")
            .replace(/^URL Source:.*\n/m, "")
            .replace(/^Markdown Content:\n/m, "")
            .replace(/^Warning:.*\n/gm, "")
            .replace(/\n{3,}/g, "\n\n");

        const lines = text.split("\n").filter(l => l.trim().length > 30);
        const clean = lines.join("\n").slice(0, 1500);
        return clean.length > 80 ? clean : "";
    } catch {
        return "";
    }
}

// ── Main Handler ──

export async function POST(request: NextRequest) {
    try {
        const { query } = await request.json();
        if (!query) {
            return NextResponse.json({ error: "Query required" }, { status: 400 });
        }

        // Run ALL search engines in parallel for speed
        const [tavilyResult, searxResult, ddgResult, wikiResult] = await Promise.all([
            searchTavily(query).catch(() => null),
            searchSearXNG(query).catch(() => ({ results: [], content: [] })),
            getDDGInstant(query).catch(() => ({ summary: null, results: [] })),
            searchWikipedia(query).catch(() => ({ results: [], content: [] })),
        ]);

        // If Tavily worked, use it (best quality)
        if (tavilyResult && tavilyResult.content.length > 0) {
            return NextResponse.json({
                query,
                results: tavilyResult.results,
                content: tavilyResult.content,
                sources: tavilyResult.results.map(r => r.url).filter(Boolean),
                summary: tavilyResult.summary,
            });
        }

        // Merge all fallback results
        const allResults: SearchResult[] = [];
        const seenUrls = new Set<string>();
        const allContent: string[] = [];
        const allSources: string[] = [];

        // Priority: SearXNG > Wikipedia > DDG
        for (const r of [...searxResult.results, ...wikiResult.results, ...ddgResult.results]) {
            if (r.url && !seenUrls.has(r.url)) {
                allResults.push(r);
                seenUrls.add(r.url);
            }
        }

        // Merge content
        if (ddgResult.summary) {
            allContent.push(ddgResult.summary);
        }
        for (const c of [...searxResult.content, ...wikiResult.content]) {
            if (c && c.length > 40 && allContent.length < 4) {
                allContent.push(c);
            }
        }

        // Collect sources
        for (const r of allResults.slice(0, 5)) {
            if (r.url) allSources.push(r.url);
        }

        // If we have results but no deep content, try Jina on top 2 URLs
        if (allContent.length < 2 && allResults.length > 0) {
            const jinaUrls = allResults
                .filter(r => r.source !== "wikipedia" && r.url.startsWith("http"))
                .slice(0, 2)
                .map(r => r.url);

            if (jinaUrls.length > 0) {
                const extracts = await Promise.all(jinaUrls.map(extractWithJina));
                for (let i = 0; i < extracts.length; i++) {
                    if (extracts[i].length > 80 && allContent.length < 4) {
                        allContent.push(extracts[i]);
                        if (!allSources.includes(jinaUrls[i])) allSources.push(jinaUrls[i]);
                    }
                }
            }
        }

        // Snippet fallback if we still have no content
        if (allContent.length === 0 && allResults.length > 0) {
            const snippetContent = allResults
                .filter(r => r.snippet.length > 20)
                .slice(0, 5)
                .map(r => `${r.title}: ${r.snippet}`)
                .join("\n\n");
            if (snippetContent) {
                allContent.push(snippetContent);
            }
        }

        const response: SearchResponse = {
            query,
            results: allResults.slice(0, 8),
            content: allContent,
            sources: Array.from(new Set(allSources)),
            summary: ddgResult.summary || undefined,
        };

        // ALWAYS return valid JSON with at least empty arrays
        return NextResponse.json(response);

    } catch (error) {
        console.error("Deep search error:", error);
        // Even on total failure, return a valid response so the LLM can still work
        return NextResponse.json({
            query: "",
            results: [],
            content: [],
            sources: [],
            error: "Search temporarily unavailable. The AI will answer from its own knowledge.",
        });
    }
}
