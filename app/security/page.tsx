import Link from "next/link";

export const metadata = {
    title: "Security | N0X",
    description: "Security model, sandboxing boundaries, rate limits, and provider risks for N0X.",
};

export default function SecurityPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-3xl space-y-8">
                <Link href="/" className="text-sm text-zinc-500 hover:text-white">
                    n0x
                </Link>
                <h1 className="text-4xl font-bold tracking-tight text-white">Security Notes</h1>
                <div className="space-y-6 text-zinc-400">
                    <p>
                        N0X uses browser isolation, Web Workers, sandboxed iframes, Pyodide WASM, COOP/COEP headers, and
                        API route rate limits. These reduce risk, but they are not a replacement for reviewing generated
                        code before running it.
                    </p>
                    <p>
                        HTML and JavaScript previews run in sandboxed iframes. Python runs in Pyodide, but CPU and
                        memory-heavy code can still slow or crash the browser tab.
                    </p>
                    <p>
                        Deep Search and image generation are rate limited server-side. The limits are best-effort for
                        serverless deployments and should be backed by edge or hosted rate limiting before serious
                        scale.
                    </p>
                    <p>
                        Cloud API requests go directly from the browser to your configured OpenAI-compatible endpoint.
                        Only use providers you trust with the text you send.
                    </p>
                </div>
            </div>
        </main>
    );
}
