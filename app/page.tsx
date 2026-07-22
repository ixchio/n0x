"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowRight,
    CheckCircle2,
    Cloud,
    Cpu,
    Database,
    ExternalLink,
    FileText,
    Github,
    HardDrive,
    KeyRound,
    Lock,
    Search,
    Server,
    ShieldCheck,
    Sparkles,
    Terminal,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { PixelNoxMark } from "@/components/brand/pixel-nox-mark";
import { trackFunnelEvent } from "@/lib/core/analytics";

const profileFacts = [
    { label: "Category", value: "Local-first AI workspace" },
    { label: "Best for", value: "Private docs, research, code, model testing" },
    { label: "Runtime", value: "WebGPU, WASM, Chrome AI, Ollama, Cloud API" },
    { label: "Storage", value: "IndexedDB, Cache API, sessionStorage keys" },
    { label: "License", value: "MIT, open source" },
];

const proof = [
    { icon: Lock, label: "No forced account", detail: "Open the workspace and start local." },
    { icon: FileText, label: "Files index in-browser", detail: "Docs live in IndexedDB and vector cache." },
    { icon: KeyRound, label: "Session-only keys", detail: "Cloud keys stay out of localStorage." },
    { icon: Github, label: "Source is inspectable", detail: "Open repo, MIT license, no black box." },
];

const workflows = [
    {
        step: "01",
        title: "Drop files",
        body: "PDF, DOCX, Markdown, CSV, text, logs, and HTML become searchable workspace context.",
        icon: FileText,
    },
    {
        step: "02",
        title: "Ask with context",
        body: "Hybrid BM25 plus vector retrieval keeps exact terms and semantic matches in the answer window.",
        icon: Search,
    },
    {
        step: "03",
        title: "Pick compute",
        body: "Use the best local model first, then choose Chrome AI, Ollama, or cloud when the task needs it.",
        icon: Cpu,
    },
    {
        step: "04",
        title: "Export the answer",
        body: "Answer cards preserve provider, model, privacy path, and context flags for reproducible handoff.",
        icon: Terminal,
    },
];

const providerRows = [
    {
        provider: "Browser WebGPU",
        icon: Cpu,
        status: "Default",
        data: "Prompts, docs, and responses stay in the browser unless search, image, or cloud is enabled.",
        bestFor: "Private file work and local drafts",
    },
    {
        provider: "Chrome AI",
        icon: Sparkles,
        status: "On-device",
        data: "Uses Chrome's local Gemini Nano when the browser exposes the Prompt API.",
        bestFor: "Zero-download local fallback",
    },
    {
        provider: "Ollama",
        icon: Server,
        status: "Local server",
        data: "Talks to your configured Ollama host on your machine or local network.",
        bestFor: "Local larger models and dev machines",
    },
    {
        provider: "Cloud API",
        icon: Cloud,
        status: "Explicit",
        data: "Sends selected prompt and context to your chosen OpenAI-compatible provider.",
        bestFor: "Large context, stronger models, fast inference",
    },
];

const boundaryRows = [
    ["Conversations", "IndexedDB", "Local browser origin"],
    ["Uploaded docs", "IndexedDB + vector cache", "Local unless included in a cloud prompt"],
    ["Model weights", "Browser Cache API", "Downloaded once, reused locally"],
    ["Cloud keys", "sessionStorage", "Clears with the browser session"],
    ["Deep Search", "API route", "Search query leaves the device when enabled"],
    ["Image generation", "API route", "Prompt leaves the device when enabled"],
];

const runtimeBadges: { label: string; icon: LucideIcon }[] = [
    { label: "IndexedDB", icon: Database },
    { label: "sessionStorage", icon: KeyRound },
    { label: "WebGPU", icon: Zap },
    { label: "WASM", icon: HardDrive },
];

function HeroPill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.08] px-2.5 py-1 text-xs font-medium text-zinc-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
            {children}
        </span>
    );
}

function SectionKicker({ children }: { children: React.ReactNode }) {
    return <p className="text-sm font-semibold text-orange-700">{children}</p>;
}

export default function HomePage() {
    useEffect(() => {
        trackFunnelEvent("visit", { page: "home" });
    }, []);

    return (
        <div className="min-h-screen bg-[#f5f5f2] text-zinc-950 selection:bg-zinc-950 selection:text-white">
            <header className="absolute left-0 right-0 top-0 z-30 border-b border-white/10 bg-black/35 backdrop-blur-md">
                <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6">
                    <Link href="/" className="flex items-center gap-3 text-sm font-semibold text-white">
                        <PixelNoxMark className="h-5 w-9 text-emerald-300" />
                        <span>N0X</span>
                    </Link>
                    <nav className="flex items-center gap-1 text-sm">
                        <Link
                            href="/security"
                            className="hidden rounded-md px-3 py-2 text-zinc-300 transition hover:bg-white/10 hover:text-white sm:inline-flex"
                        >
                            Security
                        </Link>
                        <Link
                            href="/known-limitations"
                            className="hidden rounded-md px-3 py-2 text-zinc-300 transition hover:bg-white/10 hover:text-white sm:inline-flex"
                        >
                            Limits
                        </Link>
                        <a
                            href="https://github.com/ixchio/n0x"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hidden rounded-md px-3 py-2 text-zinc-300 transition hover:bg-white/10 hover:text-white sm:inline-flex"
                        >
                            GitHub
                        </a>
                        <Link
                            href="/chat"
                            prefetch={false}
                            className="inline-flex h-9 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-black transition hover:bg-zinc-200 sm:h-10 sm:px-4"
                        >
                            Open app
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </nav>
                </div>
            </header>

            <main>
                <section className="relative overflow-hidden bg-[#050505] text-white">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />
                    <div className="relative z-10 mx-auto flex min-h-[58svh] max-w-7xl flex-col justify-end px-4 pb-7 pt-24 sm:min-h-[62svh] sm:px-6 sm:pb-10 sm:pt-28">
                        <div className="max-w-3xl">
                            <div className="mb-5 flex flex-wrap gap-2">
                                <HeroPill>Open source</HeroPill>
                                <HeroPill>Browser native</HeroPill>
                                <HeroPill>Cloud optional</HeroPill>
                            </div>
                            <p className="text-sm font-semibold text-orange-300">Private AI workstation</p>
                            <p className="mt-3 text-5xl font-semibold text-white sm:text-7xl" aria-label="N0X">
                                N0X
                            </p>
                            <h1 className="mt-4 max-w-2xl text-2xl font-semibold leading-tight text-zinc-100 sm:text-3xl">
                                AI over your files without uploading the workspace to a SaaS account.
                            </h1>
                            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
                                Local by default. Search, image and cloud paths are explicit. Drop docs, pick a local
                                model, and export answer cards with the provider path attached.
                            </p>
                            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                <Link
                                    href="/chat"
                                    prefetch={false}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-black transition hover:bg-zinc-200"
                                >
                                    Launch workspace
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                                <a
                                    href="https://github.com/ixchio/n0x"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/20 bg-black/20 px-5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                                >
                                    <Github className="h-4 w-4" />
                                    Read source
                                </a>
                            </div>
                        </div>

                        <div className="mt-8 hidden grid-cols-4 gap-2 text-sm sm:grid">
                            {profileFacts.slice(0, 4).map(item => (
                                <div key={item.label} className="border-t border-white/15 pt-3">
                                    <div className="text-xs font-medium text-zinc-400">{item.label}</div>
                                    <div className="mt-1 max-w-[18rem] text-zinc-100">{item.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="border-b border-zinc-200 bg-[#f5f5f2]">
                    <div className="mx-auto grid max-w-7xl gap-3 px-4 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
                        {proof.map(({ icon: Icon, label, detail }) => (
                            <div
                                key={label}
                                className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800"
                            >
                                <div className="flex items-center gap-3 font-semibold text-zinc-950">
                                    <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                                    {label}
                                </div>
                                <p className="mt-1.5 text-xs leading-5 text-zinc-500">{detail}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
                        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
                            <Image
                                src="/screenshots/chat-workbench.png"
                                alt="N0X chat workbench empty state"
                                width={1440}
                                height={960}
                                className="w-full bg-zinc-950 object-cover object-top"
                                priority
                            />
                        </div>
                    </div>
                </section>

                <section className="border-b border-zinc-200 bg-white">
                    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.65fr_1.35fr]">
                        <div>
                            <SectionKicker>Product profile</SectionKicker>
                            <h2 className="mt-3 text-3xl font-semibold text-zinc-950">
                                A workbench for private docs, research, and reproducible answers.
                            </h2>
                            <p className="mt-4 text-base leading-7 text-zinc-600">
                                The chat screen behaves like a tool surface, not a landing page: setup stays near the
                                provider selector, the composer stays anchored, and the empty state starts with files.
                            </p>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-[#fafafa]">
                            {profileFacts.map(item => (
                                <div
                                    key={item.label}
                                    className="grid grid-cols-[108px_1fr] border-b border-zinc-200 px-4 py-3 text-sm last:border-b-0 sm:grid-cols-[150px_1fr]"
                                >
                                    <span className="font-medium text-zinc-500">{item.label}</span>
                                    <span className="text-zinc-900">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="border-b border-zinc-200 bg-[#f5f5f2]">
                    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.62fr_1.38fr]">
                        <div>
                            <SectionKicker>Workflow</SectionKicker>
                            <h2 className="mt-3 text-3xl font-semibold text-zinc-950">
                                Built around private docs and clear provider boundaries.
                            </h2>
                            <p className="mt-4 text-base leading-7 text-zinc-600">
                                First run checks hardware, recommends a local model, keeps setup compact, and shows
                                exactly when search or cloud changes the data path.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {workflows.map(({ step, title, body, icon: Icon }) => (
                                <div key={title} className="rounded-lg border border-zinc-200 bg-white p-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <Icon className="h-5 w-5 text-zinc-950" />
                                        <span className="font-mono text-xs font-semibold text-zinc-400">{step}</span>
                                    </div>
                                    <h3 className="mt-5 text-lg font-semibold text-zinc-950">{title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="border-b border-zinc-200 bg-[#111111] text-white">
                    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.72fr_1.28fr]">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Threat model included
                            </div>
                            <h2 className="mt-5 text-3xl font-semibold">Trust is a table, not a slogan.</h2>
                            <p className="mt-4 text-base leading-7 text-zinc-300">
                                N0X makes local and network boundaries visible. Every provider has a tradeoff, and cloud
                                fallback is framed as a choice instead of a failure.
                            </p>
                            <div className="mt-6 flex flex-wrap gap-2">
                                {runtimeBadges.map(({ label, icon: Icon }) => (
                                    <span
                                        key={label}
                                        className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300"
                                    >
                                        <Icon className="h-3.5 w-3.5 text-zinc-500" />
                                        {label}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-zinc-700">
                            <div>
                                <div className="hidden grid-cols-[0.9fr_1.15fr_1.15fr] bg-zinc-900 text-xs font-semibold text-zinc-400 md:grid">
                                    <div className="px-4 py-3">Data</div>
                                    <div className="px-4 py-3">Stored in</div>
                                    <div className="px-4 py-3">Boundary</div>
                                </div>
                                {boundaryRows.map(([data, storage, boundary]) => (
                                    <div
                                        key={data}
                                        className="grid gap-3 border-t border-zinc-800 bg-zinc-950/70 p-4 text-sm md:grid-cols-[0.9fr_1.15fr_1.15fr] md:gap-0 md:p-0"
                                    >
                                        <div className="font-medium text-zinc-100 md:px-4 md:py-3">
                                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 md:hidden">
                                                Data
                                            </span>
                                            {data}
                                        </div>
                                        <div className="text-zinc-300 md:px-4 md:py-3 md:text-zinc-400">
                                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 md:hidden">
                                                Stored in
                                            </span>
                                            {storage}
                                        </div>
                                        <div className="text-zinc-300 md:px-4 md:py-3 md:text-zinc-400">
                                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 md:hidden">
                                                Boundary
                                            </span>
                                            {boundary}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="border-b border-zinc-200 bg-white">
                    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
                        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                            <div>
                                <SectionKicker>Provider matrix</SectionKicker>
                                <h2 className="mt-3 text-3xl font-semibold text-zinc-950">
                                    Local by default. Search, image and cloud paths are explicit.
                                </h2>
                            </div>
                            <Link
                                href="/compatibility"
                                className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700 hover:text-zinc-950"
                            >
                                Compatibility details
                                <ExternalLink className="h-4 w-4" />
                            </Link>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-zinc-200">
                            <div>
                                <div className="hidden grid-cols-[0.8fr_0.52fr_1.15fr_1fr] bg-zinc-100 text-xs font-semibold text-zinc-500 md:grid">
                                    <div className="px-4 py-3">Provider</div>
                                    <div className="px-4 py-3">Status</div>
                                    <div className="px-4 py-3">Data path</div>
                                    <div className="px-4 py-3">Best for</div>
                                </div>
                                {providerRows.map(({ provider, icon: Icon, status, data, bestFor }) => (
                                    <div
                                        key={provider}
                                        className="grid gap-3 border-t border-zinc-200 bg-white p-4 text-sm md:grid-cols-[0.8fr_0.52fr_1.15fr_1fr] md:gap-0 md:p-0"
                                    >
                                        <div className="flex items-center gap-3 font-semibold text-zinc-950 md:px-4 md:py-4">
                                            <Icon className="h-4 w-4 text-zinc-500" />
                                            <span>
                                                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 md:hidden">
                                                    Provider
                                                </span>
                                                {provider}
                                            </span>
                                        </div>
                                        <div className="text-zinc-600 md:px-4 md:py-4">
                                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 md:hidden">
                                                Status
                                            </span>
                                            {status}
                                        </div>
                                        <div className="leading-6 text-zinc-600 md:px-4 md:py-4">
                                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 md:hidden">
                                                Data path
                                            </span>
                                            {data}
                                        </div>
                                        <div className="leading-6 text-zinc-600 md:px-4 md:py-4">
                                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 md:hidden">
                                                Best for
                                            </span>
                                            {bestFor}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="bg-[#f5f5f2]">
                    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_0.75fr] lg:items-center">
                        <div>
                            <SectionKicker>30-second start</SectionKicker>
                            <h2 className="mt-3 text-3xl font-semibold text-zinc-950">
                                Open the workspace, load the recommended model, ask over docs.
                            </h2>
                            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
                                The product should prove itself before asking for trust. Start local, inspect provider
                                badges, then decide if search or cloud belongs in the task.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                            <Link
                                href="/chat"
                                prefetch={false}
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-zinc-950 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800"
                            >
                                Launch n0x
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link
                                href="/security"
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-950 transition hover:border-zinc-500"
                            >
                                Read security model
                                <ShieldCheck className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-zinc-200 bg-white">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-7 text-sm text-zinc-500 sm:px-6 md:flex-row md:items-center md:justify-between">
                    <span>© {new Date().getFullYear()} ixchio. MIT licensed.</span>
                    <div className="flex flex-wrap gap-4">
                        <Link href="/privacy" className="hover:text-zinc-950">
                            Privacy
                        </Link>
                        <Link href="/security" className="hover:text-zinc-950">
                            Security
                        </Link>
                        <Link href="/known-limitations" className="hover:text-zinc-950">
                            Limits
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
