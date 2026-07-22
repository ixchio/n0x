export interface SearchContextResult {
    summary?: string;
    content?: string[];
    sources?: string[];
    refinedQuery?: string;
    noUsefulResults?: boolean;
}

function safeHostname(url?: string): string {
    if (!url) return "";
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

export function formatAgentSearchContext(result: SearchContextResult): string {
    let context = "";
    if (result.summary) context += `${result.summary}\n\n`;
    if (result.content?.length) context += result.content.slice(0, 3).join("\n\n");
    if (result.sources?.length) {
        context +=
            "\n\nSources:\n" +
            result.sources
                .slice(0, 5)
                .map(source => `• ${source}`)
                .join("\n");
    }
    return context.trim();
}

export function formatDirectSearchContext(message: string, result: SearchContextResult, contextBudget: number): string {
    const isSmall = contextBudget <= 3_500;
    const maxPieces = isSmall ? 2 : 4;
    const maxChars = isSmall ? 400 : 900;
    const searchQuery = result.refinedQuery && result.refinedQuery !== message ? result.refinedQuery : message;
    const pieces: string[] = [];

    if (result.summary) pieces.push(`Quick Answer: ${result.summary.slice(0, maxChars)}`);
    const contents = (result.content || [])
        .map(content =>
            content
                .replace(/^\[Source:[^\]]+\]\n?/gm, "")
                .replace(/^\[Instant Answer\]\n?/gm, "")
                .trim()
        )
        .filter(content => content.length > 40)
        .slice(0, maxPieces);

    contents.forEach((content, index) => {
        const host = safeHostname(result.sources?.[index]);
        const source = host ? ` (${host})` : "";
        pieces.push(`[${index + 1}]${source}\n${content.slice(0, maxChars)}${content.length > maxChars ? "..." : ""}`);
    });

    let searchContext = "";
    if (pieces.length) {
        searchContext = `SEARCH RESULTS for "${message}"${searchQuery !== message ? ` (refined query: "${searchQuery}")` : ""}:\n\n${pieces.join("\n\n")}\n\nUse the numbered search results above for current facts. If the user asks what is "most used" or "most popular", distinguish consumer app usage from API/developer token usage. If results only contain benchmark rankings, acknowledge that limitation. Cite sources as [1], [2], etc.`;
    }
    if (searchContext && result.sources?.length) {
        searchContext += `\n\nSources: ${result.sources.slice(0, maxPieces).join(", ")}`;
    }
    return searchContext;
}
