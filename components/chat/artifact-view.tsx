import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { buildSandboxHtml } from "@/lib/runtime/artifactSandbox";

interface ArtifactViewProps {
    code: string;
    language: string;
}

export function ArtifactView({ code, language }: ArtifactViewProps) {
    const [key, setKey] = useState(0); // To force re-render
    const [loading, setLoading] = useState(true);

    const getSrcDoc = () => {
        const cleanCode = code.replace(/^```\w*\n?/, "").replace(/```$/, "");
        return buildSandboxHtml(cleanCode, language || "html");
    };

    useEffect(() => {
        setLoading(true);
        // Brief timeout to simulate loading/reset state for better UX
        const timer = setTimeout(() => {
            setLoading(false);
        }, 500);
        return () => clearTimeout(timer);
    }, [code, key]);

    return (
        <div className="w-full h-full min-h-[400px] flex flex-col bg-[#050505] rounded-xl border border-void-border overflow-hidden relative">
            <div className="absolute top-2 right-2 z-10">
                <button
                    onClick={() => setKey(k => k + 1)}
                    aria-label="Reload artifact preview"
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-void-border bg-void-item/80 text-zinc-300 backdrop-blur transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    title="Reload Preview"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-void-bg z-20">
                    <Loader2 className="w-6 h-6 text-brand-electric animate-spin" />
                </div>
            )}

            <iframe
                key={key}
                srcDoc={getSrcDoc()}
                title="Artifact Preview"
                className="w-full h-full border-none bg-white/5" // Slight tint to show it's a canvas
                sandbox="allow-scripts" // CRITICAL: No allow-same-origin for security
                referrerPolicy="no-referrer"
            />
        </div>
    );
}
