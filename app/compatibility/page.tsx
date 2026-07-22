import Link from "next/link";

export const metadata = {
    title: "Compatibility | N0X",
    description: "Browser, GPU, provider, and file compatibility for N0X.",
};

const rows = [
    [
        "Browser WebGPU",
        "The 21 curated WebLLM models primarily target Chrome 113+ and Edge 113+. Safari and Firefox WebGPU support varies by platform.",
    ],
    [
        "Chrome AI",
        "Requires a Chrome build where the Prompt API reports Gemini Nano as available; browser version alone is not sufficient.",
    ],
    ["Ollama", "Requires a reachable Ollama server with CORS configured for the N0X browser origin."],
    ["Cloud API", "Requires a CORS-enabled, OpenAI-compatible chat-completion endpoint with streaming support."],
    [
        "Documents",
        "PDF, DOCX, TXT, Markdown, CSV, HTML, JSON, XML, YAML, TOML, INI, CFG, CONF, LOG, RST, and TEX. Input is capped at 25 MB, expanded DOCX at 32 MB, extracted text at 750,000 characters, and PDFs at 100 pages.",
    ],
    ["Python", "Pyodide requires WebAssembly and downloads its runtime and requested packages from jsDelivr."],
    ["Voice", "Uses browser Web Speech APIs. Recognition and some voices may depend on online browser or OS services."],
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
                <p className="text-zinc-400">Local by default. Search, image and cloud paths are explicit.</p>
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
