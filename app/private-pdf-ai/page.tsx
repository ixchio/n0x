import Link from "next/link";

export const metadata = {
    title: "Private PDF AI | N0X",
    description: "Ask questions over PDFs in your browser with local-first AI and no account.",
};

export default function PrivatePdfAiPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-3xl space-y-8">
                <Link href="/" className="text-sm text-zinc-500 hover:text-white">
                    n0x
                </Link>
                <h1 className="text-4xl font-bold tracking-tight text-white">Private PDF AI</h1>
                <p className="text-lg leading-relaxed text-zinc-400">
                    Drop a PDF into N0X and ask questions without creating an account. With the browser provider, text
                    extraction, retrieval, memory, and inference run on your device.
                </p>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 text-sm leading-relaxed text-zinc-400">
                    For sensitive documents, use the Browser provider and keep Deep Search, Cloud API, and image
                    generation disabled. For larger context windows or stronger models, you can switch to a cloud
                    endpoint knowingly.
                </div>
                <Link
                    href="/chat"
                    className="inline-flex rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-zinc-200"
                >
                    Try Private PDF Chat
                </Link>
            </div>
        </main>
    );
}
