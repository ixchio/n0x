import Link from "next/link";

export const metadata = {
    title: "WebGPU LLM in Browser | N0X",
    description: "Run open-source LLMs in the browser with WebGPU, Web Workers, local storage, and no account.",
};

export default function WebGpuLlmPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-zinc-200">
            <div className="mx-auto max-w-3xl space-y-8">
                <Link href="/" className="text-sm text-zinc-500 hover:text-white">
                    n0x
                </Link>
                <h1 className="text-4xl font-bold tracking-tight text-white">WebGPU LLM In The Browser</h1>
                <p className="text-lg leading-relaxed text-zinc-400">
                    N0X runs open-source chat models directly in supported browsers through WebGPU and MLC WebLLM.
                    Models download once, cache locally, and stream responses without an account or hosted inference
                    backend.
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                    {["Private by default", "Worker-based inference", "Tiny model path"].map(item => (
                        <div
                            key={item}
                            className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300"
                        >
                            {item}
                        </div>
                    ))}
                </div>
                <Link
                    href="/chat"
                    className="inline-flex rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-zinc-200"
                >
                    Try WebGPU Chat
                </Link>
            </div>
        </main>
    );
}
