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
            streamingText: "",
            summary: "",
            error: null,
        });

        try {
            if (abortRef.current?.signal.aborted) return null;

            setState(prev => ({
                ...prev,
                phase: "searching",
                streamingText: "",
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
                streamingText: "",
            }));

            const contents = data.content || [];
            const sources = data.sources || [];

            // If we have a summary, show it
            if (data.summary) {
                setState(prev => ({
                    ...prev,
                    streamingText: "",
                    summary: data.summary,
                }));
            }

            // Read each source progressively (animate the reading indicator)
            for (let i = 0; i < Math.min(contents.length, 4); i++) {
                if (abortRef.current?.signal.aborted) return null;

                setState(prev => ({
                    ...prev,
                    currentUrl: sources[i] || "",
                    phase: "reading",
                    streamingText: "",
                }));

                // Brief pause for visual feedback — user sees which source is being read
                await new Promise(r => setTimeout(r, 250));
            }

            // Analysis phase — clean transition
            setState(prev => ({
                ...prev,
                phase: "analyzing",
                currentUrl: "",
                streamingText: "",
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
