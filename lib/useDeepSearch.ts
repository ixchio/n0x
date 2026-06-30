"use client";

import { useState, useCallback, useRef } from "react";
import { trackFunnelEvent } from "@/lib/analytics";

// Advanced Deep Search Hook with real-time phase updates

// In-memory cache for search results (5 minute TTL)
const searchCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(query: string): string {
    return query.toLowerCase().trim();
}

function getCachedResult(query: string): any | null {
    const key = getCacheKey(query);
    const cached = searchCache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL) {
        searchCache.delete(key);
        return null;
    }

    return cached.result;
}

function setCachedResult(query: string, result: any): void {
    const key = getCacheKey(query);
    searchCache.set(key, { result, timestamp: Date.now() });

    // Cleanup old entries (keep cache size reasonable)
    if (searchCache.size > 50) {
        const entries = Array.from(searchCache.entries());
        entries
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .slice(0, 10)
            .forEach(([k]) => searchCache.delete(k));
    }
}

type SearchPhase = "idle" | "planning" | "searching" | "reading" | "analyzing" | "complete" | "error";

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source?: string;
}

interface DeepSearchState {
    phase: SearchPhase;
    query: string;
    refinedQuery: string;
    results: SearchResult[];
    content: string[];
    sources: string[];
    currentUrl: string;
    streamingText: string;
    summary: string;
    error: string | null;
    noUsefulResults: boolean;
}

export function useDeepSearch() {
    const [state, setState] = useState<DeepSearchState>({
        phase: "idle",
        query: "",
        refinedQuery: "",
        results: [],
        content: [],
        sources: [],
        currentUrl: "",
        streamingText: "",
        summary: "",
        error: null,
        noUsefulResults: false,
    });

    const abortRef = useRef<AbortController | null>(null);

    const search = useCallback(async (query: string) => {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        trackFunnelEvent("search_used");

        // Check cache first
        const cached = getCachedResult(query);
        if (cached) {
            setState({
                phase: "complete",
                query,
                refinedQuery: cached.refinedQuery || query,
                results: cached.results || [],
                content: cached.content || [],
                sources: cached.sources || [],
                currentUrl: "",
                streamingText: "",
                summary: cached.summary || "",
                error: null,
                noUsefulResults: cached.noUsefulResults || false,
            });
            return cached;
        }

        // Reset state
        setState({
            phase: "planning",
            query,
            refinedQuery: "",
            results: [],
            content: [],
            sources: [],
            currentUrl: "",
            streamingText: "Analyzing query...",
            summary: "",
            error: null,
            noUsefulResults: false,
        });

        try {
            if (abortRef.current?.signal.aborted) return null;

            setState(prev => ({
                ...prev,
                phase: "searching",
                streamingText: "Searching web sources...",
            }));

            // Make the search request
            const res = await fetch("/api/deep-search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
                signal: abortRef.current.signal,
            });

            if (!res.ok) throw new Error("Search failed");

            const data = await res.json();

            if (data.error) {
                setState(prev => ({ ...prev, phase: "error", error: data.error }));
                return null;
            }

            if (data.noUsefulResults) {
                setState(prev => ({
                    ...prev,
                    phase: "complete",
                    query: data.query || query,
                    refinedQuery: data.refinedQuery || "",
                    results: [],
                    content: [],
                    sources: [],
                    streamingText: "No relevant web sources found. Answering without search context.",
                    summary: "",
                    noUsefulResults: true,
                }));
                return {
                    results: [],
                    content: [],
                    sources: [],
                    summary: "",
                    query: data.query || query,
                    refinedQuery: data.refinedQuery || "",
                    noUsefulResults: true,
                };
            }

            // Update with search results
            setState(prev => ({
                ...prev,
                phase: "reading",
                query: data.query || query,
                refinedQuery: data.refinedQuery || "",
                results: data.results || [],
                streamingText: `Found ${data.results?.length || 0} results. Extracting content...`,
            }));

            // Stream the content progressively
            let streamText = "";
            const contents = data.content || [];
            const sources = data.sources || [];

            // If we have a summary, show it first
            if (data.summary) {
                streamText = `📌 Quick Answer:\n${data.summary}\n\n---\n\n`;
                setState(prev => ({
                    ...prev,
                    streamingText: streamText,
                    summary: data.summary,
                }));
                await new Promise(r => setTimeout(r, 300));
            }

            // Stream each content piece
            for (let i = 0; i < contents.length; i++) {
                if (abortRef.current?.signal.aborted) return null;

                const contentText = contents[i];
                setState(prev => ({
                    ...prev,
                    currentUrl: sources[i] || "",
                    phase: "reading",
                }));

                // Direct update without simulated typing for speed
                streamText += contentText + "\n\n";
                setState(prev => ({ ...prev, streamingText: streamText }));

                // Keep UI responsive
                await new Promise(r => requestAnimationFrame(r));
            }

            // Analysis phase
            setState(prev => ({
                ...prev,
                phase: "analyzing",
                streamingText: streamText + "✅ Analysis complete. Generating response...",
            }));

            // Complete
            setState(prev => ({
                ...prev,
                phase: "complete",
                content: contents,
                sources,
            }));

            const result = {
                results: data.results,
                content: contents,
                sources,
                summary: data.summary,
                query: data.query || query,
                refinedQuery: data.refinedQuery || "",
                noUsefulResults: false,
            };

            // Cache the successful result
            setCachedResult(query, result);

            return result;
        } catch (error: any) {
            if (error.name === "AbortError") return null;

            setState(prev => ({
                ...prev,
                phase: "error",
                error: error.message || "Search failed",
            }));
            return null;
        }
    }, []);

    const stop = useCallback(() => {
        abortRef.current?.abort();
        setState(prev => ({ ...prev, phase: "idle" }));
    }, []);

    const reset = useCallback(() => {
        stop();
        setState({
            phase: "idle",
            query: "",
            refinedQuery: "",
            results: [],
            content: [],
            sources: [],
            currentUrl: "",
            streamingText: "",
            summary: "",
            error: null,
            noUsefulResults: false,
        });
    }, [stop]);

    return {
        ...state,
        search,
        stop,
        reset,
        isActive: state.phase !== "idle",
    };
}
