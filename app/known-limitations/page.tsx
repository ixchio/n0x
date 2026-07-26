import Link from "next/link";

export const metadata = {
    title: "Known Limitations | N0X",
    description: "Known limitations of N0X private document Q&A, local browser models, and optional network tools.",
};

const limits = [
    "Filename/chunk citations identify the passages supplied to the model; they do not guarantee that the model interpreted those passages correctly. Verify high-stakes answers against the cited text.",
    "The Browser provider exposes 21 curated WebLLM models; a model can still fail on unsupported drivers, low-memory GPUs, or mobile browsers.",
    "First-use model and runtime downloads are large. App updates preserve separate WebLLM caches, but browser eviction, site-data clearing, or clearing Model Weights requires a download again.",
    "Chrome AI depends on the browser's Prompt API and Gemini Nano availability; a Chrome version alone does not guarantee access. Opening the workbench only checks availability. Selecting/installing Chrome AI can start Chrome's browser-managed model install.",
    "Auto-routing can select a configured Cloud API for complex requests and include enabled document, memory, or search context. Leave it off when you need a fixed provider path.",
    "A remote Ollama URL receives the composed prompt and any enabled document, memory, or search context. Only a loopback Ollama URL stays on the same device.",
    "Deep Search depends on third-party search/extraction providers and can degrade when providers rate limit or fail.",
    "Image generation depends on Pollinations and, on the configured authenticated fallback path, AI Horde. Free URLs can be slow, rate-limited, watermarked, or unavailable.",
    "Web Speech recognition and some voices may use online browser or operating-system services; offline voice is not guaranteed.",
    "RAG accepts supported formats up to 25 MB, caps expanded DOCX content at 32 MB and extracted text at 750,000 characters, and reads only the first 100 PDF pages. Corrupt binary files are rejected.",
    "Short direct documents use BM25-ranked deterministic chunks; larger documents use vector + BM25 fusion and MMR. Relevance thresholds reduce unsupported citations but cannot eliminate retrieval or generation errors.",
    "Document attachments are not restored after a reload. Reattach the same bytes to reuse an available content-addressed vector cache; browser eviction or clearing RAG Vector Cache removes it.",
    "RAG extracts text, not full visual understanding of scanned images or diagrams.",
    "Agent behavior depends on the selected model. Tool parsing, loop limits, timeouts, and per-call Python approval are guardrails, not a guarantee that an autonomous run will finish correctly.",
    "Pyodide permits only pinned runtime/package asset GETs and blocks arbitrary network transports, but it is not a hardened hostile-code sandbox. CPU or memory exhaustion can still affect its worker or the tab.",
    "In-memory serverless rate limits are best-effort and reset per deployment instance.",
    "Generated HTML previews have no same-origin access to N0X, and their CSP blocks ordinary subresource and connection paths. This is not a zero-network guarantee: preview code can attempt same-frame navigation, consume resources, or render deceptive content.",
    "External Markdown images are blocked by default. Choosing Load once contacts the displayed host, which can observe the request even though N0X omits the referrer.",
    "Opt-in telemetry sends sanitized page views and allowlisted funnel events, while the services can still process ordinary request metadata. It excludes prompts, documents, file names, keys, and memory content.",
];

export default function KnownLimitationsPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-3xl space-y-8">
                <Link href="/" className="text-sm text-zinc-400 hover:text-white">
                    n0x
                </Link>
                <h1 className="text-4xl font-bold tracking-tight text-white">Known Limitations</h1>
                <p className="text-zinc-400">
                    N0X leads with local-first document Q&amp;A and filename/chunk citations. The boundaries below are
                    important when deciding whether a workflow is appropriate for your data and device.
                </p>
                <ul className="space-y-3 text-zinc-400">
                    {limits.map(limit => (
                        <li key={limit} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                            {limit}
                        </li>
                    ))}
                </ul>
            </div>
        </main>
    );
}
