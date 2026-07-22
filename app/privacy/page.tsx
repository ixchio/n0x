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
                        Local by default. Search, image and cloud paths are explicit. The Browser provider runs model
                        inference, document retrieval, enabled memory, and Python execution in your browser.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold text-white">What stays local</h2>
                    <p className="text-zinc-400">
                        Browser-provider prompts and responses, conversation history, document indexes, and RAG vectors
                        stay under the app&apos;s browser origin. N0X saves and retrieves semantic memories only while
                        Memory is enabled. Turning Memory off leaves existing entries stored until you delete them.
                    </p>
                    <p className="text-zinc-400">
                        Model weights use browser-managed caches. App-shell updates preserve separately named WebLLM
                        caches, although the browser can evict them and clearing site data or Model Weights removes
                        them. Cloud API keys use sessionStorage rather than localStorage or IndexedDB; browser crash and
                        session restore behavior can vary.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold text-white">When data can leave your device</h2>
                    <ul className="list-disc space-y-2 pl-5 text-zinc-400">
                        <li>
                            Deep Search sends the query through the N0X API route to available search and extraction
                            providers.
                        </li>
                        <li>
                            Image generation sends the prompt through the N0X API route and then to Pollinations or, on
                            the configured fallback path, AI Horde.
                        </li>
                        <li>
                            Cloud API requests go to the OpenAI-compatible endpoint you configure. Relevant document
                            excerpts and enabled-memory context can be included in that prompt; N0X does not upload the
                            original file as a separate attachment.
                        </li>
                        <li>
                            A remote Ollama URL sends prompts to that host. A loopback Ollama URL stays on your device.
                        </li>
                        <li>
                            Model, embedding, Pyodide, and Python-package assets download from external hosts on first
                            use or after cache eviction.
                        </li>
                        <li>
                            Web Speech recognition and some speech-synthesis voices may use an online browser or
                            operating-system service. Offline speech is not guaranteed.
                        </li>
                    </ul>
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
