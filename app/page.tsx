"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowRight,
    CheckCircle2,
    FileText,
    Github,
    Globe2,
    Lock,
    MessageSquare,
    Search,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { trackFunnelEvent } from "@/lib/analytics";

const proof = [
    "Production build passes",
    "Typecheck and lint are clean",
    "0 production audit vulnerabilities",
    "Analytics are opt-in",
];

const workflows = [
    {
        icon: FileText,
        title: "Ask your files",
        body: "Upload a PDF, CSV, DOCX, or Markdown file. n0x chunks it locally, builds a hybrid index, and keeps the cache in your browser.",
    },
    {
        icon: Search,
        title: "Search without polluting the answer",
        body: "Deep Search filters weak matches before they reach the model, then passes compact source context with citations.",
    },
    {
        icon: Sparkles,
        title: "Use the right runtime",
        body: "Start local with WebGPU, switch to Ollama, Chrome AI, or an OpenAI-compatible cloud endpoint when the task needs it.",
    },
];

const limits = [
    "Local models need a WebGPU-capable browser and enough GPU memory.",
    "Large model downloads are big; first run can take time on slow networks.",
    "Free search providers can be rate-limited or unavailable.",
    "Cloud mode is optional and uses your own provider key.",
];

function ProductPreview() {
    return (
        <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-[0_24px_80px_rgba(20,20,20,0.12)]">
            <div className="flex h-11 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4">
                <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-sm border border-zinc-950 bg-zinc-950" />
                    <span className="text-sm font-semibold text-zinc-950">n0x workspace</span>
                </div>
                <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
                    <span className="rounded-full border border-zinc-300 bg-white px-2.5 py-1">Local model ready</span>
                    <span className="rounded-full border border-zinc-300 bg-white px-2.5 py-1">Docs indexed</span>
                </div>
            </div>

            <div className="grid min-h-[430px] grid-cols-1 md:grid-cols-[220px_1fr]">
                <aside className="border-b border-zinc-200 bg-zinc-50 p-4 md:border-b-0 md:border-r">
                    <button className="mb-5 flex h-9 w-full items-center justify-center rounded-md border border-zinc-300 bg-white text-sm font-medium text-zinc-950">
                        New session
                    </button>
                    <div className="space-y-4">
                        <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                Recent
                            </p>
                            <div className="rounded-md border border-zinc-200 bg-white p-3">
                                <p className="line-clamp-1 text-sm font-medium text-zinc-950">PDF research notes</p>
                                <p className="mt-1 text-xs text-zinc-500">2 minutes ago</p>
                            </div>
                        </div>
                        <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                Provider
                            </p>
                            <div className="space-y-2 text-sm text-zinc-700">
                                <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2">
                                    <span>Browser</span>
                                    <span className="h-2 w-2 rounded-full bg-emerald-600" />
                                </div>
                                <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2">
                                    <span>Cloud</span>
                                    <span className="text-xs text-zinc-400">optional</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>

                <section className="bg-white p-5 sm:p-7">
                    <div className="mb-5 flex flex-wrap items-center gap-2">
                        {["Search", "Docs", "Memory", "Python"].map(item => (
                            <span
                                key={item}
                                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700"
                            >
                                {item}
                            </span>
                        ))}
                    </div>

                    <div className="space-y-4">
                        <div className="ml-auto max-w-[78%] rounded-lg bg-zinc-950 px-4 py-3 text-sm leading-relaxed text-white">
                            Summarize this PDF, then check whether the claim still holds against current model
                            benchmarks.
                        </div>

                        <div className="max-w-[86%] rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4">
                            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-950">
                                <MessageSquare className="h-4 w-4" />
                                Answer draft
                            </div>
                            <p className="text-sm leading-6 text-zinc-700">
                                The document claim is directionally right, but it needs a narrower benchmark. For coding
                                tasks, the latest leaderboard sources disagree with general reasoning rankings.
                            </p>
                            <div className="mt-4 grid gap-2 text-xs text-zinc-600 sm:grid-cols-3">
                                <div className="rounded-md border border-zinc-200 bg-white p-3">
                                    <p className="font-semibold text-zinc-950">8 doc matches</p>
                                    <p className="mt-1">hybrid RAG</p>
                                </div>
                                <div className="rounded-md border border-zinc-200 bg-white p-3">
                                    <p className="font-semibold text-zinc-950">4 web sources</p>
                                    <p className="mt-1">filtered search</p>
                                </div>
                                <div className="rounded-md border border-zinc-200 bg-white p-3">
                                    <p className="font-semibold text-zinc-950">local first</p>
                                    <p className="mt-1">cloud optional</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-zinc-200 bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-zinc-950">Attached files</p>
                                    <p className="text-xs text-zinc-500">Stored in IndexedDB on this device</p>
                                </div>
                                <Lock className="h-4 w-4 text-zinc-500" />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                                    benchmark-notes.pdf
                                </div>
                                <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                                    release-data.csv
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default function HomePage() {
    useEffect(() => {
        trackFunnelEvent("visit", { page: "home" });
    }, []);

    return (
        <div className="min-h-screen bg-[#f7f7f5] text-zinc-950 selection:bg-zinc-950 selection:text-white">
            <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-6">
                <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
                    <Image
                        src="/icon.png"
                        alt="n0x"
                        width={40}
                        height={40}
                        className="h-9 w-9 rounded-md object-cover"
                        priority
                    />
                </Link>
                <nav className="flex items-center gap-2 text-sm">
                    <a
                        href="https://github.com/ixchio/n0x"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden rounded-md px-3 py-2 text-zinc-600 transition hover:bg-white hover:text-zinc-950 sm:inline-flex"
                    >
                        GitHub
                    </a>
                    <Link
                        href="/privacy"
                        className="hidden rounded-md px-3 py-2 text-zinc-600 transition hover:bg-white hover:text-zinc-950 sm:inline-flex"
                    >
                        Privacy
                    </Link>
                    <Link
                        href="/chat"
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 font-medium text-white transition hover:bg-zinc-800"
                    >
                        Open app
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </nav>
            </header>

            <main>
                <section className="mx-auto max-w-6xl px-5 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-16">
                    <div className="mx-auto max-w-3xl text-center">
                        <div className="mb-7 flex justify-center">
                            <Image
                                src="/favicon.png"
                                alt="n0x logo"
                                width={128}
                                height={128}
                                className="h-24 w-24 rounded-2xl object-cover sm:h-28 sm:w-28"
                                priority
                            />
                        </div>
                        <p className="mb-5 text-sm font-medium text-zinc-500">Local-first AI workspace</p>
                        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-6xl">
                            Private AI work,
                            <span className="block text-zinc-500">without the platform drama.</span>
                        </h1>
                        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
                            n0x is a browser workspace for local models, documents, search, Python, and optional cloud
                            routing. It is built for people who want control before polish theatre.
                        </p>
                        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <Link
                                href="/chat"
                                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800 sm:w-auto"
                            >
                                Start in the workspace
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <a
                                href="https://github.com/ixchio/n0x"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-950 transition hover:border-zinc-400 sm:w-auto"
                            >
                                <Github className="h-4 w-4" />
                                Read the source
                            </a>
                        </div>
                    </div>

                    <div className="mt-12">
                        <ProductPreview />
                    </div>

                    <div className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {proof.map(item => (
                            <div
                                key={item}
                                className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-700"
                            >
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="border-y border-zinc-200 bg-white">
                    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
                        <div>
                            <p className="text-sm font-medium text-zinc-500">What it actually does</p>
                            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
                                A practical workbench, not another chatbot skin.
                            </h2>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                            {workflows.map(({ icon: Icon, title, body }) => (
                                <div key={title} className="rounded-lg border border-zinc-200 bg-[#fbfbfa] p-5">
                                    <Icon className="h-5 w-5 text-zinc-950" />
                                    <h3 className="mt-4 text-base font-semibold text-zinc-950">{title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="mx-auto grid max-w-6xl gap-6 px-5 py-14 sm:px-6 lg:grid-cols-3 lg:py-20">
                    <div className="rounded-lg border border-zinc-200 bg-white p-6">
                        <ShieldCheck className="h-5 w-5 text-zinc-950" />
                        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-950">
                            Deliberately plain.
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-zinc-600">
                            No fake enterprise language, no forced account, no prompt/file telemetry by default. The
                            product should earn trust by being legible.
                        </p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-white p-6">
                        <Globe2 className="h-5 w-5 text-zinc-950" />
                        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-950">
                            Useful online, usable local.
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-zinc-600">
                            Web search and image generation use API routes. Chat, memory, documents, and browser model
                            execution can stay on-device.
                        </p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-white p-6">
                        <Lock className="h-5 w-5 text-zinc-950" />
                        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-950">Honest limits.</h2>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
                            {limits.map(limit => (
                                <li key={limit} className="flex gap-2">
                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                                    <span>{limit}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-6">
                    <div className="rounded-lg bg-zinc-950 px-6 py-8 text-white sm:px-8 lg:flex lg:items-center lg:justify-between">
                        <div>
                            <p className="text-sm text-zinc-400">Try the 30-second path first.</p>
                            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                                Open the workspace, load the tiny model, ask the sample doc.
                            </h2>
                        </div>
                        <Link
                            href="/chat"
                            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 lg:mt-0"
                        >
                            Launch n0x
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </section>
            </main>

            <footer className="border-t border-zinc-200 bg-white">
                <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-7 text-sm text-zinc-500 sm:px-6 md:flex-row md:items-center md:justify-between">
                    <span>© {new Date().getFullYear()} ixchio. MIT licensed.</span>
                    <div className="flex flex-wrap gap-4">
                        <Link href="/security" className="hover:text-zinc-950">
                            Security
                        </Link>
                        <Link href="/compatibility" className="hover:text-zinc-950">
                            Compatibility
                        </Link>
                        <Link href="/known-limitations" className="hover:text-zinc-950">
                            Limitations
                        </Link>
                        <a
                            href="https://github.com/ixchio/n0x"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-zinc-950"
                        >
                            GitHub
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
