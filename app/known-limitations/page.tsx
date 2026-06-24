import Link from "next/link";

export const metadata = {
    title: "Known Limitations | N0X",
    description: "Known limitations and tradeoffs for N0X local browser AI.",
};

const limits = [
    "Large WebGPU models can fail on low-memory GPUs or mobile browsers.",
    "First model download can be slow because model weights are large.",
    "Deep Search depends on third-party search/extraction providers and can degrade when providers rate limit or fail.",
    "RAG currently extracts text, not full visual understanding of scanned images or diagrams.",
    "In-memory serverless rate limits are best-effort and reset per deployment instance.",
    "Generated code and HTML previews should be reviewed before trusting their behavior.",
    "Opt-in telemetry records funnel events only; it is not a full analytics warehouse.",
];

export default function KnownLimitationsPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-3xl space-y-8">
                <Link href="/" className="text-sm text-zinc-500 hover:text-white">
                    n0x
                </Link>
                <h1 className="text-4xl font-bold tracking-tight text-white">Known Limitations</h1>
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
