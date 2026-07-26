import Link from "next/link";
import { AnalyticsPreferences } from "@/components/system/analytics-preferences";

export const metadata = {
    title: "Privacy | N0X",
    description:
        "How N0X handles private document Q&A, local storage, optional providers, API keys, and opt-in telemetry.",
};

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-3xl space-y-8">
                <Link href="/" className="text-sm text-zinc-400 hover:text-white">
                    n0x
                </Link>
                <section className="space-y-3">
                    <h1 className="text-4xl font-bold tracking-tight text-white">Privacy</h1>
                    <p className="text-zinc-400">
                        N0X starts with local-first document Q&amp;A and filename/chunk citations. Search, image, remote
                        Ollama, cloud, approved external images, browser speech, and telemetry are separate network
                        paths. The Browser provider runs inference, document retrieval, enabled memory, and Python in
                        your browser after required assets are available.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold text-white">What stays local</h2>
                    <p className="text-zinc-400">
                        When network features are off, Browser-provider prompts and responses, conversation history,
                        document chunks, and RAG vectors stay under the app&apos;s browser origin. The original file is
                        not uploaded for indexing. N0X computes a SHA-256 digest of its bytes locally for cache identity
                        and duplicate detection; the digest is not sent to a server. Removing or clearing an attachment
                        waits for its IndexedDB cache deletion to commit before the UI reports success.
                    </p>
                    <p className="text-zinc-400">
                        For an inspectable cited answer, N0X stores the exact retrieved passages used for that answer
                        with its conversation in Chat History. Removing an attachment or clearing the RAG Vector Cache
                        does not rewrite old answers; clear Chat History to erase those evidence snapshots.
                    </p>
                    <p className="text-zinc-400">
                        N0X saves and retrieves semantic memories only while Memory is enabled. Turning Memory off
                        leaves existing entries stored until you delete them. Model weights use browser-managed caches;
                        browser eviction, clearing site data, or clearing Model Weights removes them. Cloud API keys use
                        sessionStorage rather than localStorage or IndexedDB, although crash and session-restore
                        behavior varies by browser.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-semibold text-white">When data can leave your device</h2>
                    <ul className="list-disc space-y-2 pl-5 text-zinc-400">
                        <li>
                            Direct Deep Search sends your query through the N0X API route to available search and
                            page-extraction providers. Before every autonomous agent search, N0X shows the exact
                            model-authored query and requires fresh approval; denial keeps it in the browser.
                        </li>
                        <li>
                            Image generation sends the prompt through the N0X API route and then to Pollinations or, on
                            the configured fallback path, AI Horde.
                        </li>
                        <li>
                            Cloud API requests go to the OpenAI-compatible endpoint you configure. Relevant document
                            excerpts, enabled-memory context, and Deep Search results can be included in that prompt;
                            N0X does not upload the original file as a separate attachment.
                        </li>
                        <li>
                            If auto-routing is enabled, a complex request can select the configured Cloud API and
                            include the document, memory, or search context enabled for that request.
                        </li>
                        <li>
                            A remote Ollama URL sends the composed prompt and any enabled document, memory, or search
                            context to that host. A loopback Ollama URL stays on your device.
                        </li>
                        <li>
                            Browser model assets, embedding assets, and Pyodide runtime/packages can download from
                            external hosts on first use or after cache eviction. Opening the workbench also checks
                            Chrome&apos;s Prompt API without starting an install. N0X asks Chrome to install Gemini Nano
                            only after you explicitly select/install Chrome AI. The isolated Python worker permits only
                            credential-free GET requests under the pinned Pyodide asset path; arbitrary Python network
                            access and arbitrary package URLs are blocked.
                        </li>
                        <li>
                            Remote images in generated Markdown are blocked by default. Choosing Load once contacts that
                            image host without a referrer; the host still receives the network request and your IP-level
                            connection metadata.
                        </li>
                        <li>
                            Generated HTML previews use an opaque-origin sandbox and block ordinary subresource and
                            connection paths. Preview code can still attempt to navigate its own frame to an external
                            destination, so review generated code before opening Preview.
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
                        Product telemetry is opt-in. A non-modal first-visit banner offers No thanks or Allow analytics;
                        no analytics event is sent before you choose Allow. If enabled, N0X sends sanitized page views
                        to Vercel Web Analytics and funnel events such as provider selected, model load result, first
                        message sent, document uploaded, and search used to the N0X analytics route. The page-view URL
                        keeps the path and explicit ref/UTM attribution; other query values and URL fragments are
                        removed. Vercel and the deployment can still observe ordinary request and service metadata under
                        their own policies. Telemetry does not send prompts, responses, document text, file names, API
                        keys, or memory content.
                    </p>
                    <p className="text-zinc-400">
                        With telemetry off, neither the Vercel Analytics component nor N0X funnel events are sent. Your
                        choice is stored locally in this browser and can be changed below.
                    </p>
                    <AnalyticsPreferences />
                </section>
            </div>
        </main>
    );
}
