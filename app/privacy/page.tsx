import Link from "next/link";

export const metadata = {
    title: "Privacy | N0X",
    description: "How N0X handles local data, optional providers, API keys, and opt-in telemetry.",
};

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-3xl space-y-8">
                <Link href="/" className="text-sm text-zinc-500 hover:text-white">
                    n0x
                </Link>
                <section className="space-y-3">
                    <h1 className="text-4xl font-bold tracking-tight text-white">Privacy</h1>
                    <p className="text-zinc-400">
                        N0X is built for local-first AI. The default browser provider runs model inference, document
                        search, memory, and Python execution in your browser.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold text-white">What stays local</h2>
                    <p className="text-zinc-400">
                        Browser model weights, conversations, memories, and RAG vector cache are stored in browser
                        storage on your device. Cloud API keys are stored in sessionStorage, not localStorage, so they
                        clear when the browser session ends.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold text-white">When data can leave your device</h2>
                    <p className="text-zinc-400">
                        Data leaves your device only when you explicitly use a network feature: Cloud API, Ollama on
                        another host, Deep Search, image generation, Pyodide CDN loading, or external model downloads.
                        Uploaded documents are sent to Cloud API only if you choose that provider and ask a question
                        that includes document context.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold text-white">Telemetry</h2>
                    <p className="text-zinc-400">
                        Product telemetry is opt-in. If enabled, N0X sends only funnel events such as visit, provider
                        selected, model load result, first message sent, document uploaded, and search used. It does not
                        send prompts, responses, document text, file names, API keys, or memory content.
                    </p>
                </section>
            </div>
        </main>
    );
}
