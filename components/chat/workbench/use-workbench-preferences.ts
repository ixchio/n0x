"use client";

import { useCallback, useEffect, useState } from "react";

import type { AIProvider } from "@/components/chat/workbench/workbench-panels";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const VALID_PROVIDERS: AIProvider[] = ["browser", "ollama", "cloud", "chrome-ai"];

interface WorkbenchPreferencesOptions {
    onProviderSelected?: (provider: AIProvider) => void;
}

export function useWorkbenchPreferences({ onProviderSelected }: WorkbenchPreferencesOptions = {}) {
    const [provider, setProviderState] = useState<AIProvider>("browser");
    const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const setProvider = useCallback(
        (nextProvider: AIProvider) => {
            setProviderState(nextProvider);
            try {
                localStorage.setItem("n0x-provider", nextProvider);
            } catch {
                // Storage can be unavailable in hardened/private browsing modes.
            }
            onProviderSelected?.(nextProvider);
        },
        [onProviderSelected]
    );

    useEffect(() => {
        try {
            const savedProvider = localStorage.getItem("n0x-provider") as AIProvider | null;
            if (savedProvider && VALID_PROVIDERS.includes(savedProvider)) {
                setProviderState(savedProvider);
            }
            setOllamaUrl(localStorage.getItem("n0x-ollama-url") || DEFAULT_OLLAMA_URL);
        } catch {
            // Keep deterministic defaults when storage is unavailable.
        }
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(min-width: 768px)");
        setSidebarOpen(mediaQuery.matches);
        const handleViewportChange = (event: MediaQueryListEvent) => setSidebarOpen(event.matches);
        mediaQuery.addEventListener("change", handleViewportChange);
        return () => mediaQuery.removeEventListener("change", handleViewportChange);
    }, []);

    return {
        provider,
        setProvider,
        ollamaUrl,
        setOllamaUrl,
        sidebarOpen,
        setSidebarOpen,
    };
}
