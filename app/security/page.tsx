import Link from "next/link";

export const metadata = {
    title: "Security | N0X",
    description: "Security model, sandboxing boundaries, rate limits, and provider risks for N0X.",
};

export default function SecurityPage() {
    const threatRows = [
        {
            surface: "IndexedDB",
            boundary: "Conversations, memories, uploaded document chunks, and vector cache stay in the browser origin.",
            risk: "Any same-origin XSS could read local app data. Browser profile compromise is also out of the app's control.",
            mitigation:
                "Rendered markdown is constrained, file text is sanitized before indexing, and no document text is sent unless a network feature is used.",
        },
        {
            surface: "sessionStorage keys",
            boundary: "Cloud API credentials are kept in sessionStorage so they clear with the browser session.",
            risk: "sessionStorage is still readable by same-origin JavaScript during the active session.",
            mitigation:
                "Keys are never written to localStorage. Treat browser extensions and pasted scripts as part of your local trust boundary.",
        },
        {
            surface: "Artifact iframes",
            boundary: "Generated HTML previews run in sandboxed iframes, separate from the app document.",
            risk: "Previewed code can still run JavaScript inside its sandbox and may make network requests if the browser allows it.",
            mitigation:
                "Artifacts do not get same-origin access. Review generated code before copying it into a less restricted environment.",
        },
        {
            surface: "Pyodide",
            boundary: "Python runs in WebAssembly inside the tab, not as a native OS process.",
            risk: "CPU-heavy or memory-heavy code can freeze or crash the tab. Pyodide is not a substitute for a hardened multi-tenant sandbox.",
            mitigation:
                "Dangerous desktop/server modules are blocked from inline run buttons, and execution errors stay local unless you send them to a provider.",
        },
        {
            surface: "API routes",
            boundary:
                "/api/deep-search, /api/image-gen, and /api/analytics are server routes for optional network features.",
            risk: "Search queries, image prompts, and opt-in analytics events leave the device when those features are used.",
            mitigation:
                "Routes are rate-limited. Prompt text, document text, file names, API keys, and memory contents are not analytics payloads.",
        },
    ];

    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-5xl space-y-8">
                <Link href="/" className="text-sm text-zinc-500 hover:text-white">
                    n0x
                </Link>
                <section className="max-w-3xl space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight text-white">Security Notes</h1>
                    <p>
                        N0X uses browser isolation, Web Workers, sandboxed iframes, Pyodide WASM, COOP/COEP headers, and
                        API route rate limits. These reduce risk, but they are not a replacement for reviewing generated
                        code before running it.
                    </p>
                </section>

                <section className="overflow-hidden rounded-lg border border-zinc-800">
                    <div className="grid grid-cols-[0.9fr_1.1fr_1.1fr_1.1fr] gap-px bg-zinc-800 text-sm">
                        <div className="bg-zinc-950 p-3 font-semibold text-white">Surface</div>
                        <div className="bg-zinc-950 p-3 font-semibold text-white">Boundary</div>
                        <div className="bg-zinc-950 p-3 font-semibold text-white">Main Risk</div>
                        <div className="bg-zinc-950 p-3 font-semibold text-white">Mitigation</div>
                        {threatRows.map(row => (
                            <div key={row.surface} className="contents">
                                <div className="bg-[#0d0d0d] p-3 text-zinc-200">{row.surface}</div>
                                <div className="bg-[#0d0d0d] p-3 text-zinc-400">{row.boundary}</div>
                                <div className="bg-[#0d0d0d] p-3 text-zinc-400">{row.risk}</div>
                                <div className="bg-[#0d0d0d] p-3 text-zinc-400">{row.mitigation}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <div className="max-w-3xl space-y-6 text-zinc-400">
                    <p>
                        HTML and JavaScript previews run in sandboxed iframes. Python runs in Pyodide, but CPU and
                        memory-heavy code can still slow or crash the browser tab.
                    </p>
                    <p>
                        Deep Search and image generation are rate limited server-side. The limits are best-effort for
                        serverless deployments and should be backed by edge or hosted rate limiting before serious
                        scale.
                    </p>
                    <p>
                        Cloud API requests go directly from the browser to your configured OpenAI-compatible endpoint.
                        Only use providers you trust with the text you send.
                    </p>
                </div>
            </div>
        </main>
    );
}
