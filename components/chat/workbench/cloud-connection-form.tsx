"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { identifyCloudProvider, normalizeCloudBaseUrl, type CloudProviderKind } from "@/lib/providers/useCloudAI";

const PROVIDER_ENDPOINTS: Record<Exclude<CloudProviderKind, "generic">, string> = {
    groq: "https://api.groq.com/openai/v1",
    openrouter: "https://openrouter.ai/api/v1",
    openai: "https://api.openai.com/v1",
};

const KEY_LINKS: Partial<Record<CloudProviderKind, { label: string; href: string }>> = {
    groq: { label: "Groq keys →", href: "https://console.groq.com/keys" },
    openrouter: { label: "OpenRouter keys →", href: "https://openrouter.ai/settings/keys" },
    openai: { label: "OpenAI keys →", href: "https://platform.openai.com/api-keys" },
};

interface CloudConnectionFormProps {
    apiKey: string;
    baseUrl: string;
    models: string[];
    loadedModel: string | null;
    fetchingModels: boolean;
    onSave: (baseUrl: string, apiKey: string) => void;
    onRefresh: () => void;
    onModelChange: (model: string) => void;
}

function endpointHost(value: string): string {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return "";
    }
}

export function CloudConnectionForm({
    apiKey,
    baseUrl,
    models,
    loadedModel,
    fetchingModels,
    onSave,
    onRefresh,
    onModelChange,
}: CloudConnectionFormProps) {
    const [draftKey, setDraftKey] = useState(apiKey);
    const [draftUrl, setDraftUrl] = useState(baseUrl);
    const [dirty, setDirty] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        setDraftKey(apiKey);
        setDraftUrl(baseUrl);
        setDirty(false);
    }, [apiKey, baseUrl]);

    const provider = identifyCloudProvider(draftUrl);
    const keyLink = KEY_LINKS[provider];
    const presetValue = provider === "generic" ? "custom" : provider;
    const connectionChanged = dirty || draftKey !== apiKey || draftUrl !== baseUrl;
    const canSelectModel = !connectionChanged && models.length > 0;
    const statusMessage = useMemo(() => {
        if (validationError) return validationError;
        if (connectionChanged) return "Unsaved changes. Requests still use the current saved connection.";
        if (apiKey && models.length === 0 && !fetchingModels) {
            return "No compatible text-chat models loaded. Test the connection to refresh them.";
        }
        return null;
    }, [apiKey, connectionChanged, fetchingModels, models.length, validationError]);

    const saveConnection = () => {
        let normalized: string;
        try {
            normalized = normalizeCloudBaseUrl(draftUrl);
        } catch (error) {
            setValidationError(error instanceof Error ? error.message : "Enter a valid cloud endpoint.");
            return;
        }

        // Do not silently reuse one provider's saved credential against a new
        // host. The user must paste the key intended for the new endpoint.
        if (apiKey && draftKey === apiKey && endpointHost(normalized) !== endpointHost(baseUrl)) {
            setDraftKey("");
            setDirty(true);
            setValidationError("Endpoint changed. Paste the API key for this provider before connecting.");
            return;
        }

        setDraftUrl(normalized);
        setValidationError(null);
        setDirty(false);
        onSave(normalized, draftKey.trim());
    };

    return (
        <div className="space-y-2">
            <div>
                <label htmlFor="cloud-provider-preset" className="px-1 font-mono text-xs text-zinc-400">
                    Provider
                </label>
                <select
                    id="cloud-provider-preset"
                    value={presetValue}
                    onChange={event => {
                        const next = event.target.value as keyof typeof PROVIDER_ENDPOINTS | "custom";
                        if (next === "custom") return;
                        const nextUrl = PROVIDER_ENDPOINTS[next];
                        if (endpointHost(nextUrl) !== endpointHost(draftUrl)) setDraftKey("");
                        setDraftUrl(nextUrl);
                        setValidationError(null);
                        setDirty(true);
                    }}
                    className="mt-1 min-h-11 w-full cursor-pointer rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-blue-500/30 focus-visible:ring-2 focus-visible:ring-white"
                >
                    <option value="groq">Groq</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="openai">OpenAI</option>
                    <option value="custom">Custom OpenAI-compatible</option>
                </select>
            </div>

            <div>
                <label htmlFor="cloud-base-url" className="px-1 font-mono text-xs text-zinc-400">
                    Base URL
                </label>
                <input
                    id="cloud-base-url"
                    type="url"
                    value={draftUrl}
                    onChange={event => {
                        setDraftUrl(event.target.value);
                        setValidationError(null);
                        setDirty(true);
                    }}
                    className="mt-1 min-h-11 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-blue-500/30 focus-visible:ring-2 focus-visible:ring-white"
                    placeholder="https://api.example.com/v1"
                    autoComplete="url"
                />
            </div>

            <div>
                <div className="flex items-center justify-between gap-2">
                    <label htmlFor="cloud-api-key" className="px-1 font-mono text-xs text-zinc-400">
                        API Key
                    </label>
                    {keyLink && (
                        <a
                            href={keyLink.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center px-1 text-xs font-mono text-blue-400 underline underline-offset-2 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            {keyLink.label}
                        </a>
                    )}
                </div>
                <input
                    id="cloud-api-key"
                    type="password"
                    value={draftKey}
                    onChange={event => {
                        setDraftKey(event.target.value);
                        setValidationError(null);
                        setDirty(true);
                    }}
                    className="mt-1 min-h-11 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-blue-500/30 focus-visible:ring-2 focus-visible:ring-white"
                    placeholder="Paste this provider's key"
                    autoComplete="off"
                    spellCheck={false}
                />
            </div>

            <button
                type="button"
                onClick={connectionChanged ? saveConnection : onRefresh}
                disabled={fetchingModels || !draftKey.trim() || !draftUrl.trim()}
                className="min-h-11 w-full rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-2 text-xs font-mono text-blue-300 transition-all hover:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
            >
                {fetchingModels ? "Testing…" : connectionChanged ? "Save & test connection" : "Test connection"}
            </button>

            {statusMessage && (
                <p role={validationError ? "alert" : "status"} className="px-1 text-xs leading-5 text-zinc-400">
                    {statusMessage}
                </p>
            )}

            <div>
                <label htmlFor="cloud-model" className="flex items-center gap-1 px-1 font-mono text-xs text-zinc-400">
                    Text-chat model
                    {fetchingModels && <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400" />}
                </label>
                <select
                    id="cloud-model"
                    value={loadedModel || ""}
                    onChange={event => onModelChange(event.target.value)}
                    disabled={!canSelectModel}
                    className="mt-1 min-h-11 w-full cursor-pointer rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-blue-500/30 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {!models.length && <option value="">No text-chat models loaded</option>}
                    {models.map(model => (
                        <option key={model} value={model}>
                            {model}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
