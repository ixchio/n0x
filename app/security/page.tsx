import Link from "next/link";

export const metadata = {
    title: "Security | N0X",
    description:
        "Security model for N0X private document Q&A, browser storage, generated content, and network providers.",
};

export default function SecurityPage() {
    const threatRows = [
        {
            surface: "IndexedDB",
            boundary:
                "Conversations and document chunk/vector cache data stay in the browser origin. Memories are saved and retrieved only while Memory is enabled.",
            risk: "Any same-origin XSS could read local app data. Browser profile compromise is also out of the app's control.",
            mitigation:
                "Storage failures are announced without echoing content. Clear controls remove each owned database, but browser storage is not a defense against same-origin script.",
        },
        {
            surface: "RAG identity and deletion",
            boundary:
                "A local SHA-256 digest of file bytes keys vector records and deduplicates identical content. Removing or clearing waits for IndexedDB to commit before updating the UI.",
            risk: "Cached chunks include extracted document text. A browser can evict records, and an exact commit/ack failure can still require a retry or reattachment.",
            mitigation:
                "Legacy metadata-derived cache keys are purged on schema upgrade. RAG timeouts terminate the worker so it cannot continue a reported-failed mutation in the background.",
        },
        {
            surface: "sessionStorage keys",
            boundary: "Cloud API credentials are kept in sessionStorage, not localStorage or IndexedDB.",
            risk: "sessionStorage is still readable by same-origin JavaScript during the active session.",
            mitigation:
                "Treat extensions and pasted scripts as part of your trust boundary. Crash and session-restore retention depends on the browser.",
        },
        {
            surface: "Generated Markdown",
            boundary:
                "Remote images are blocked by default. External links require a click and open with noopener/noreferrer.",
            risk: "After Load once, the image host receives a network request and can observe connection metadata. Links can lead to untrusted sites.",
            mitigation:
                "Each remote image needs a per-image approval and then loads without cross-origin credentials or a referrer. The UI shows the destination host before approval.",
        },
        {
            surface: "Artifact iframes",
            boundary:
                "Generated HTML previews run in opaque-origin sandboxed iframes. Their embedded CSP sets connect-src 'none' and blocks forms, frames, objects, and non-data media.",
            risk: "Previewed code can still run JavaScript, consume CPU or memory, render deceptive content, or attempt to navigate its own frame to an external destination.",
            mitigation:
                "Artifacts get no same-origin access to N0X, and the CSP blocks ordinary subresource and connection paths. This is not a zero-network guarantee; review code before previewing or copying it.",
        },
        {
            surface: "Providers and API routes",
            boundary:
                "Cloud and remote Ollama use configured endpoints. Deep Search uses N0X server routes before third parties. Auto-routing can select Cloud.",
            risk: "Prompts, enabled context, or search queries leave the device on their selected path. Providers have their own retention and security terms.",
            mitigation:
                "Provider and privacy badges expose the path. Server routes reject reported cross-site browser calls and enforce bounded inputs, outbound allowlists, deadlines, and best-effort rate limits; this is not user authentication.",
        },
        {
            surface: "Opt-in analytics",
            boundary:
                "Vercel page views and N0X funnel events are disabled until the user explicitly allows them in the consent banner or Privacy settings.",
            risk: "When enabled, sanitized paths, attribution, event names, allowlisted coarse metadata, and ordinary request/service metadata leave the device.",
            mitigation:
                "Prompts, responses, documents, file names, API keys, and memory content are excluded. Non-attribution query values and fragments are removed from page views.",
        },
        {
            surface: "Content Security Policy",
            boundary: "A CSP restricts framing, objects, base URLs, forms, and resource origins.",
            risk: "WASM and supported runtimes still require inline/eval script modes and broad configured connection targets.",
            mitigation:
                "CSP is defense in depth, not an isolation guarantee. Artifact iframes remain sandboxed without same-origin access.",
        },
    ];

    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-5xl space-y-8">
                <Link href="/" className="text-sm text-zinc-400 hover:text-white">
                    n0x
                </Link>
                <section className="max-w-3xl space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight text-white">Security Notes</h1>
                    <p>
                        N0X&apos;s private-document path combines local extraction, content-addressed retrieval, and
                        filename/chunk citations. Browser isolation, dedicated workers, sandboxed iframes, a Content
                        Security Policy, COOP/COEP headers, and API request controls are layered guardrails—not proof
                        that a model answer or generated program is safe or correct.
                    </p>
                </section>

                <section aria-label="Threat model" className="space-y-3">
                    <div className="grid gap-3 md:hidden">
                        {threatRows.map(row => (
                            <article key={row.surface} className="rounded-lg border border-zinc-800 bg-[#0d0d0d] p-4">
                                <h2 className="font-semibold text-white">{row.surface}</h2>
                                <dl className="mt-3 space-y-3 text-sm">
                                    <div>
                                        <dt className="font-medium text-zinc-300">Boundary</dt>
                                        <dd className="mt-1 text-zinc-400">{row.boundary}</dd>
                                    </div>
                                    <div>
                                        <dt className="font-medium text-zinc-300">Main risk</dt>
                                        <dd className="mt-1 text-zinc-400">{row.risk}</dd>
                                    </div>
                                    <div>
                                        <dt className="font-medium text-zinc-300">Mitigation</dt>
                                        <dd className="mt-1 text-zinc-400">{row.mitigation}</dd>
                                    </div>
                                </dl>
                            </article>
                        ))}
                    </div>
                    <div className="hidden overflow-hidden rounded-lg border border-zinc-800 md:block">
                        <table className="w-full table-fixed text-left text-sm">
                            <thead className="bg-zinc-950 text-white">
                                <tr>
                                    <th className="w-[18%] p-3">Surface</th>
                                    <th className="p-3">Boundary</th>
                                    <th className="p-3">Main risk</th>
                                    <th className="p-3">Mitigation</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800 bg-[#0d0d0d] text-zinc-400">
                                {threatRows.map(row => (
                                    <tr key={row.surface} className="align-top">
                                        <th scope="row" className="p-3 font-medium text-zinc-200">
                                            {row.surface}
                                        </th>
                                        <td className="p-3">{row.boundary}</td>
                                        <td className="p-3">{row.risk}</td>
                                        <td className="p-3">{row.mitigation}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <div className="max-w-3xl space-y-6 text-zinc-400">
                    <p>
                        HTML and JavaScript previews run in opaque-origin sandboxed iframes whose CSP blocks ordinary
                        network subresources and connections, but same-frame navigation remains a residual network path.
                    </p>
                    <p>
                        Deep Search and analytics use in-memory server-side rate limits. These limits are best-effort on
                        serverless deployments, reset independently per instance, and should be replaced or backed by
                        shared edge/hosted limiting before serious scale.
                    </p>
                    <p>
                        Cloud API requests go directly from the browser to your configured OpenAI-compatible endpoint.
                        Deep Search requests use N0X server routes before reaching third-party providers. Only use
                        providers you trust with the prompt and enabled context you send. A loopback Ollama server stays
                        on-device; a remote Ollama URL is a network provider.
                    </p>
                </div>
            </div>
        </main>
    );
}
