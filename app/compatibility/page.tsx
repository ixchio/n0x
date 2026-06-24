import Link from "next/link";

export const metadata = {
    title: "Compatibility | N0X",
    description: "Browser, GPU, provider, and file compatibility for N0X.",
};

const rows = [
    [
        "Browser WebGPU",
        "Chrome 113+ and Edge 113+ are the primary targets. Safari and Firefox support varies by platform.",
    ],
    ["Chrome AI", "Requires a Chrome build with the Prompt API / Gemini Nano availability enabled."],
    ["Ollama", "Requires a local Ollama server and CORS configured for browser access."],
    ["Cloud API", "Works with OpenAI-compatible chat completion endpoints that support streaming."],
    ["Documents", "PDF, DOCX, TXT, Markdown, CSV, HTML, JSON, XML, YAML, logs, and config files."],
    ["Mobile", "Mobile browsers are treated as low-memory devices. Tiny models or Cloud API are recommended."],
];

export default function CompatibilityPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-4xl space-y-8">
                <Link href="/" className="text-sm text-zinc-500 hover:text-white">
                    n0x
                </Link>
                <h1 className="text-4xl font-bold tracking-tight text-white">Compatibility</h1>
                <div className="overflow-hidden rounded-xl border border-zinc-800">
                    {rows.map(([label, value]) => (
                        <div
                            key={label}
                            className="grid gap-2 border-b border-zinc-900 p-4 last:border-b-0 sm:grid-cols-[180px_1fr]"
                        >
                            <div className="font-mono text-sm text-zinc-300">{label}</div>
                            <div className="text-sm leading-relaxed text-zinc-400">{value}</div>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}
