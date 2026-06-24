import Link from "next/link";

export const metadata = {
    title: "Browser RAG | N0X",
    description: "Upload documents and run local retrieval augmented generation in your browser.",
};

export default function BrowserRagPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-3xl space-y-8">
                <Link href="/" className="text-sm text-zinc-500 hover:text-white">
                    n0x
                </Link>
                <h1 className="text-4xl font-bold tracking-tight text-white">Browser RAG</h1>
                <p className="text-lg leading-relaxed text-zinc-400">
                    N0X indexes documents in a Web Worker, combines vector retrieval with BM25 keyword matching, and
                    uses MMR reranking to return focused excerpts for chat.
                </p>
                <ul className="grid gap-3 text-sm text-zinc-400">
                    <li className="rounded-lg border border-zinc-800 p-4">
                        Small files are injected directly for fast answers.
                    </li>
                    <li className="rounded-lg border border-zinc-800 p-4">
                        Large files are chunked, embedded, cached, and searched locally.
                    </li>
                    <li className="rounded-lg border border-zinc-800 p-4">
                        PDF, DOCX, TXT, Markdown, CSV, HTML, and JSON are supported.
                    </li>
                </ul>
                <Link
                    href="/chat"
                    className="inline-flex rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-zinc-200"
                >
                    Upload A Document
                </Link>
            </div>
        </main>
    );
}
