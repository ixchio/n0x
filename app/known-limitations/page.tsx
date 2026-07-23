import Link from "next/link";

export const metadata = {
    title: "Known Limitations | N0X",
    description: "Known limitations and tradeoffs for N0X local browser AI.",
};

const limits = [
    "The Browser provider exposes 21 curated WebLLM models; a model can still fail on unsupported drivers, low-memory GPUs, or mobile browsers.",
    "First-use model and runtime downloads are large. App updates preserve separate WebLLM caches, but browser eviction, site-data clearing, or clearing Model Weights requires a download again.",
    "Chrome AI depends on the browser's Prompt API and Gemini Nano availability; a Chrome version alone does not guarantee access.",
    "Deep Search depends on third-party search/extraction providers and can degrade when providers rate limit or fail.",
    "Image generation depends on Pollinations and, on the configured authenticated fallback path, AI Horde. Free URLs can be slow, rate-limited, watermarked, or unavailable.",
    "Web Speech recognition and some voices may use online browser or operating-system services; offline voice is not guaranteed.",
    "RAG accepts supported text/document formats up to 25 MB, caps expanded DOCX content at 32 MB and extracted text at 750,000 characters, and reads only the first 100 PDF pages. Corrupt binary files are rejected.",
    "RAG extracts text, not full visual understanding of scanned images or diagrams.",
    "In-memory serverless rate limits are best-effort and reset per deployment instance.",
    "Generated code and HTML previews should be reviewed before trusting their behavior.",
    "Opt-in telemetry records sanitized page views and funnel events only; it is not a full analytics warehouse.",
];

export default function KnownLimitationsPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-3xl space-y-8">
                <Link href="/" className="text-sm text-zinc-500 hover:text-white">
                    n0x
                </Link>
                <h1 className="text-4xl font-bold tracking-tight text-white">Known Limitations</h1>
                <p className="text-zinc-400">Local by default. Search, image and cloud paths are explicit.</p>
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
