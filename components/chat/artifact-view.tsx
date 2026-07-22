import React, { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

interface ArtifactViewProps {
    code: string;
    language: string;
}

export function ArtifactView({ code, language }: ArtifactViewProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [key, setKey] = useState(0); // To force re-render
    const [loading, setLoading] = useState(true);

    const getSrcDoc = () => {
        // Basic HTML Structure with Tailwind
        // We use a CDN for Tailwind to ensure the artifact looks decent immediately.
        // We also add a simple error handler.
        const cleanCode = code.replace(/^```\w*\n?/, "").replace(/```$/, "");

        return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { background-color: #050505; color: #EDEDED; }
          /* Custom Scrollbar to match app */
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        </style>
        <script>
            // Error trapping
            window.onerror = function(message, source, lineno, colno, error) {
                document.body.innerHTML = '<div style="color:#EF4444; padding:20px; font-family:sans-serif;"><h3>Runtime Error</h3><pre>' + message + '</pre></div>';
            };
        </script>
      </head>
      <body>
        ${cleanCode}
      </body>
      </html>
    `;
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
                ref={iframeRef}
                srcDoc={getSrcDoc()}
                title="Artifact Preview"
                className="w-full h-full border-none bg-white/5" // Slight tint to show it's a canvas
                sandbox="allow-scripts" // CRITICAL: No allow-same-origin for security
            />
        </div>
    );
}
