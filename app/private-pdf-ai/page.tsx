import React from "react";
import Link from "next/link";
import { ArrowRight, FileCheck2, FileText, Lock, Quote, ShieldCheck } from "lucide-react";

export const metadata = {
    title: "Private PDF Q&A With Citations | N0X",
    description:
        "Ask questions over PDFs in your browser, get filename and chunk citations, and choose explicitly when any context uses a network provider.",
};

const steps = [
    {
        icon: FileText,
        title: "Choose your document",
        detail: "PDF, DOCX, Markdown, text, CSV, HTML, and JSON are processed in the browser.",
    },
    {
        icon: Lock,
        title: "Use a local provider",
        detail: "Browser models require a first-use weights download. The workbench shows that before it starts.",
    },
    {
        icon: FileCheck2,
        title: "Verify the citation",
        detail: "Retrieved passages carry tags such as [policy.pdf#chunk-3]. If none qualifies, N0X supplies a no-evidence instruction.",
    },
];

export default function PrivatePdfAiPage() {
    return (
        <main className="min-h-screen bg-[#080808] text-zinc-200">
            <header className="border-b border-zinc-800">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
                    <Link
                        href="/"
                        className="rounded text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        N0X
                    </Link>
                    <Link
                        href="/chat"
                        prefetch={false}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    >
                        Open workbench <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
                <section className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Local path available · no account required
                        </div>
                        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                            Ask your PDF a question. Keep the evidence attached.
                        </h1>
                        <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
                            N0X extracts and retrieves document text in your browser. With the Browser provider and
                            network tools off, the document context and model prompt stay on this device.
                        </p>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                            Honest setup: local model weights are not bundled. Your first model choice downloads roughly
                            360 MB–2 GB for the recommended options, then initializes from cache on later visits.
                        </p>
                        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                            <Link
                                href="/chat"
                                prefetch={false}
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                            >
                                Choose my document <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                            <Link
                                href="/chat?sample=1"
                                prefetch={false}
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold text-white hover:border-zinc-500 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                Try the sample first
                            </Link>
                        </div>
                    </div>

                    <figure className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
                        <div className="border-b border-zinc-800 px-5 py-4 text-sm font-semibold text-zinc-300">
                            retention-policy.pdf
                        </div>
                        <div className="space-y-5 p-5 sm:p-7">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Question</p>
                                <p className="mt-2 text-base text-white">When is account data deleted?</p>
                            </div>
                            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                                <Quote className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                                <p className="mt-3 text-sm leading-6 text-zinc-200">
                                    Account data is deleted 30 days after closure.{" "}
                                    <span className="font-mono text-emerald-300">[retention-policy.pdf#chunk-3]</span>
                                </p>
                            </div>
                            <figcaption className="text-xs leading-5 text-zinc-400">
                                The citation identifies the exact file and retrieved chunk used as evidence.
                            </figcaption>
                        </div>
                    </figure>
                </section>

                <section aria-labelledby="private-pdf-steps" className="mt-16 border-t border-zinc-800 pt-12">
                    <h2 id="private-pdf-steps" className="text-2xl font-semibold text-white">
                        Three steps, with the boundary visible
                    </h2>
                    <div className="mt-6 grid gap-3 md:grid-cols-3">
                        {steps.map(({ icon: Icon, title, detail }, index) => (
                            <div key={title} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
                                <div className="flex items-center justify-between">
                                    <Icon className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                                    <span className="font-mono text-xs font-semibold text-zinc-300">0{index + 1}</span>
                                </div>
                                <h3 className="mt-5 font-semibold text-white">{title}</h3>
                                <p className="mt-2 text-sm leading-6 text-zinc-400">{detail}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-5 text-sm leading-6 text-zinc-300">
                        <strong className="text-amber-200">When data can leave:</strong> Cloud API receives selected
                        prompt and document context when you choose it. Deep Search sends the search query to configured
                        search services. Image generation sends its prompt to the selected image route.
                    </div>
                </section>
            </div>
        </main>
    );
}
