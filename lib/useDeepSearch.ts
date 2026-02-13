"use client";

import { useState, useCallback, useRef } from "react";

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
    results: SearchResult[];
    content: string[];
    sources: string[];
    currentUrl: string;
    streamingText: string;
    summary: string;
    error: string | null;
}

export function useDeepSearch() {
    const [state, setState] = useState<DeepSearchState>({
        phase: "idle",
        query: "",
        results: [],
        content: [],
        sources: [],
        currentUrl: "",
        streamingText: "",
        summary: "",
        error: null,
    });

    const abortRef = useRef<AbortController | null>(null);

    const search = useCallback(async (query: string) => {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        // Reset state
        setState({
            phase: "planning",
            query,
            results: [],
            content: [],
            sources: [],
            currentUrl: "",
            streamingText: "Analyzing query...",
            summary: "",
            error: null,
        });

        try {
            if (abortRef.current?.signal.aborted) return null;

            setState(prev => ({
                ...prev,
                phase: "searching",
                streamingText: "Searching DuckDuckGo + Wikipedia..."
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

            // Update with search results
            setState(prev => ({
                ...prev,
                phase: "reading",
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
            results: [],
            content: [],
            sources: [],
            currentUrl: "",
            streamingText: "",
            summary: "",
            error: null,
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
