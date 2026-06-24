"use client";

import { useState, useCallback, useRef } from "react";
import { trackFunnelEvent } from "@/lib/analytics";

// Advanced Deep Search Hook with real-time phase updates

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

            return {
                results: data.results,
                content: contents,
                sources,
                summary: data.summary,
                query: data.query || query,
                refinedQuery: data.refinedQuery || "",
                noUsefulResults: false,
            };
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
