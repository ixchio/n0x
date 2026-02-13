import { NextRequest, NextResponse } from "next/server";
import { tavily } from "@tavily/core";

// N0X Deep Search
// Primary: Tavily (best content extraction)
// Fallback: DuckDuckGo HTML + Wikipedia API (no key needed)

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
}

// ── tavily search (primary) ──

async function searchTavily(query: string): Promise<SearchResponse | null> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey || apiKey.includes("xxxxxxx")) return null;

    try {
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

        const sources = results.map(r => r.url).filter(Boolean);

        return {
            query,
            results,
            content,
            sources,
            summary: response.answer || undefined,
        };
    } catch (e) {
        console.error("Tavily error:", e);
        return null;
    }
}

// ── fallback: duckduckgo html ──

async function searchDDG(query: string): Promise<SearchResult[]> {
    try {
        const res = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
                },
                signal: AbortSignal.timeout(8000),
            }
        );

        const html = await res.text();
        const results: SearchResult[] = [];

        const linkRegex = /href="\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)[^"]*"[^>]*class="result__a"[^>]*>([^<]+)<\/a>/gi;
        const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)/gi;

        const links: { url: string; title: string }[] = [];
        let m;
        while ((m = linkRegex.exec(html)) !== null) {
            const url = decodeURIComponent(m[1]);
            if (url.startsWith("http")) links.push({ url, title: m[2].trim() });
        }

        const snippets: string[] = [];
        while ((m = snippetRegex.exec(html)) !== null) {
            snippets.push(m[1].replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim());
        }

        for (let i = 0; i < Math.min(links.length, 6); i++) {
            results.push({ ...links[i], snippet: snippets[i] || "", source: "duckduckgo" });
        }

        return results;
    } catch {
        return [];
    }
}

// ── fallback: wikipedia ──

async function searchWikipedia(query: string): Promise<{ results: SearchResult[]; extracts: Map<string, string> }> {
    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=2&origin=*`;
        const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
        const searchData = await searchRes.json();

        const pages = searchData.query?.search || [];
        if (pages.length === 0) return { results: [], extracts: new Map() };

        const titles = pages.map((p: any) => p.title).join("|");
        const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=extracts&exintro=false&explaintext=true&exchars=2000&format=json&origin=*`;
        const extractRes = await fetch(extractUrl, { signal: AbortSignal.timeout(5000) });
        const extractData = await extractRes.json();

        const extracts = new Map<string, string>();
        if (extractData.query?.pages) {
            for (const page of Object.values(extractData.query.pages) as any[]) {
                if (page.extract && page.extract.length > 50) {
                    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
                    extracts.set(wikiUrl, page.extract);
                }
            }
        }

        return {
            results: pages.map((r: any) => ({
                title: r.title,
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
                snippet: r.snippet.replace(/<[^>]*>/g, ""),
                source: "wikipedia",
            })),
            extracts,
        };
    } catch {
        return { results: [], extracts: new Map() };
    }
}

// ── ddg instant answer ──

async function getDDGInstant(query: string): Promise<string | null> {
    try {
        const res = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
            { signal: AbortSignal.timeout(3000) }
        );
        const data = await res.json();
        if (data.Abstract && data.Abstract.length > 30) return data.Abstract;
        if (data.Answer) return data.Answer;
        return null;
    } catch {
        return null;
    }
}

// ── content extraction (for non-tavily fallback) ──

async function extractWithJina(url: string): Promise<string> {
    try {
        const res = await fetch(`https://r.jina.ai/${url}`, {
            headers: { Accept: "text/plain", "X-Return-Format": "text" },
            signal: AbortSignal.timeout(8000),
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

// ── main handler ──

export async function POST(request: NextRequest) {
    try {
        const { query } = await request.json();
        if (!query) {
            return NextResponse.json({ error: "Query required" }, { status: 400 });
        }

        // Try Tavily first (best quality)
        const tavilyResult = await searchTavily(query);
        if (tavilyResult && tavilyResult.content.length > 0) {
            return NextResponse.json(tavilyResult);
        }

        // Fallback: DDG + Wikipedia + instant answer (parallel)
        const [ddgResults, wikiData, instantAnswer] = await Promise.all([
            searchDDG(query),
            searchWikipedia(query),
            getDDGInstant(query),
        ]);

        // Combine results
        const allResults: SearchResult[] = [];
        const seenUrls = new Set<string>();

        for (const r of wikiData.results) {
            if (!seenUrls.has(r.url)) { allResults.push(r); seenUrls.add(r.url); }
        }
        for (const r of ddgResults) {
            if (!seenUrls.has(r.url)) { allResults.push(r); seenUrls.add(r.url); }
        }

        // Build content
        const content: string[] = [];
        const sources: string[] = [];

        if (instantAnswer) {
            content.push(instantAnswer);
        }

        // Wikipedia extracts
        const wikiEntries = Array.from(wikiData.extracts.entries());
        for (const [url, extract] of wikiEntries) {
            if (content.length < 3) {
                content.push(extract.slice(0, 1500));
                sources.push(url);
            }
        }

        // Jina for DDG URLs
        const jinaUrls = allResults
            .filter(r => r.source !== "wikipedia")
            .slice(0, 2)
            .map(r => r.url)
            .filter(u => !sources.includes(u));

        if (jinaUrls.length > 0 && content.length < 3) {
            const extracts = await Promise.all(jinaUrls.map(extractWithJina));
            for (let i = 0; i < extracts.length; i++) {
                if (extracts[i].length > 80 && content.length < 3) {
                    content.push(extracts[i]);
                    sources.push(jinaUrls[i]);
                }
            }
        }

        // Snippet fallback
        if (content.length === 0) {
            const snippetContent = allResults
                .filter(r => r.snippet.length > 20)
                .slice(0, 5)
                .map(r => `${r.title}: ${r.snippet}`)
                .join("\n\n");
            if (snippetContent) {
                content.push(snippetContent);
                sources.push(...allResults.slice(0, 3).map(r => r.url));
            }
        }

        const response: SearchResponse = {
            query,
            results: allResults.slice(0, 8),
            content,
            sources: Array.from(new Set(sources)),
            summary: instantAnswer || undefined,
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("Deep search error:", error);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}
