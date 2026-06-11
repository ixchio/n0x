"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Cpu, Brain, Globe, Code, ImageIcon, Mic, ArrowRight, Lock, Database, Bot, GitBranch, Layers, Star, Check, X, ExternalLink, Zap, Shield } from "lucide-react";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const STATS = [
  { value: "40+", label: "open-source models" },
  { value: "360MB", label: "minimum VRAM" },
  { value: "$0", label: "API keys required" },
  { value: "100%", label: "browser-native" },
];

const COMPARE = [
  { feature: "Data stays local",      n0x: true,  chatgpt: false, claude: false, ollama: true  },
  { feature: "No account required",   n0x: true,  chatgpt: false, claude: false, ollama: true  },
  { feature: "No API key",            n0x: true,  chatgpt: false, claude: false, ollama: true  },
  { feature: "Works offline",         n0x: true,  chatgpt: false, claude: false, ollama: true  },
  { feature: "Browser-native UI",     n0x: true,  chatgpt: true,  claude: true,  ollama: false },
  { feature: "Autonomous agent",      n0x: true,  chatgpt: true,  claude: true,  ollama: false },
  { feature: "Document RAG",          n0x: true,  chatgpt: false, claude: false, ollama: false },
  { feature: "Python sandbox",        n0x: true,  chatgpt: true,  claude: false, ollama: false },
  { feature: "Image generation",      n0x: true,  chatgpt: true,  claude: false, ollama: false },
  { feature: "Free forever",          n0x: true,  chatgpt: false, claude: false, ollama: true  },
];

function GitHubStarBadge() {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    fetch("https://api.github.com/repos/ixchio/n0x")
      .then(r => r.json())
      .then(d => { if (typeof d.stargazers_count === "number") setStars(d.stargazers_count); })
      .catch(() => {});
  }, []);
  return (
    <a
      href="https://github.com/ixchio/n0x/stargazers"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 hover:border-zinc-600 hover:text-white transition-all group"
    >
      <Star className="w-3.5 h-3.5 text-amber-400 group-hover:fill-amber-400 transition-all" />
      {stars !== null ? (
        <span><span className="text-white font-bold">{stars}</span> stars on GitHub</span>
      ) : (
        <span>Star on GitHub</span>
      )}
    </a>
  );
}

function Cell({ v }: { v: boolean }) {
  return v
    ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400"><Check className="w-3 h-3" /></span>
    : <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-900 text-zinc-700"><X className="w-3 h-3" /></span>;
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center selection:bg-white/20 relative overflow-hidden font-sans">

      {/* Background Glows */}
      <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-emerald-950/10 blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-800/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-[40%] right-[5%] w-[25%] h-[25%] bg-blue-950/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Dot Grid */}
      <div
        className="absolute inset-0 opacity-[0.018] pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "40px 40px" }}
      />

      {/* Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <div className="font-mono text-xl font-bold tracking-tighter flex items-center gap-2">
          <div className="w-4 h-4 bg-white rounded-[2px]" />
          n0x
        </div>
        <nav className="flex items-center gap-6 text-sm text-zinc-400 font-medium">
          <a href="https://github.com/ixchio/n0x" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-amber-400" />
            GitHub
          </a>
          <a href="https://github.com/ixchio/n0x#readme" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors hidden sm:block">Docs</a>
          <Link
            href="/chat"
            className="text-black bg-white hover:bg-zinc-200 transition-colors flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-sm shadow-[0_0_20px_rgba(255,255,255,0.08)]"
          >
            Launch App <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-16 lg:py-28 flex flex-col items-center relative z-10">

        {/* Hero */}
        <motion.div initial="hidden" animate="visible" variants={stagger} className="text-center max-w-3xl space-y-8">

          <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 shadow-glass">
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Zero backend · Zero API keys · 100% private
            </span>
            <GitHubStarBadge />
          </motion.div>

          <motion.h1 variants={fadeIn} className="text-5xl sm:text-7xl font-bold tracking-tight text-white leading-[1.08]">
            The full AI stack.<br />
            <span className="text-zinc-500">In your browser.</span>
          </motion.h1>

          <motion.p variants={fadeIn} className="text-lg sm:text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto font-medium">
            LLM inference, autonomous agents, document RAG, code execution, image generation — running entirely on your GPU. No server. No account. Your data never leaves your machine.
          </motion.p>

          <motion.div variants={fadeIn} className="flex items-center justify-center gap-3 pt-2 flex-wrap">
            <Link
              href="/chat"
              className="h-12 px-8 inline-flex items-center justify-center rounded-lg bg-white text-black font-semibold hover:bg-zinc-200 transition-colors gap-2 text-sm shadow-[0_0_30px_rgba(255,255,255,0.12)]"
            >
              Enter n0x <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/ixchio/n0x"
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 px-8 inline-flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-white font-medium hover:bg-zinc-800 transition-colors text-sm shadow-glass gap-2"
            >
              <Star className="w-4 h-4 text-amber-400" /> Star on GitHub
            </a>
          </motion.div>

          <motion.div variants={fadeIn} className="pt-4 flex justify-center">
            <a href="https://www.producthunt.com/products/n0x?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-n0x" target="_blank" rel="noopener noreferrer">
              <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1162703&theme=dark&t=1780509567546" alt="N0X on Product Hunt" width="250" height="54" />
            </a>
          </motion.div>
        </motion.div>

        {/* Stats Strip */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="w-full mt-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-800/50 rounded-2xl overflow-hidden border border-zinc-800/50"
        >
          {STATS.map((s) => (
            <div key={s.label} className="bg-zinc-950/60 px-6 py-5 text-center">
              <div className="text-2xl font-bold text-white font-mono">{s.value}</div>
              <div className="text-xs text-zinc-500 mt-1 font-medium">{s.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="w-full mt-20"
        >
          <div className="text-center mb-8">
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">Why N0X over everything else</p>
            <p className="text-zinc-400 text-sm">The only tool that gives you the full AI stack with zero cloud dependency.</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-zinc-800/60 bg-zinc-950/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-6 py-4 text-zinc-500 font-medium text-xs font-mono">Feature</th>
                  <th className="px-6 py-4 text-center font-mono text-xs font-bold text-emerald-400 bg-emerald-500/5 border-x border-emerald-500/10">
                    <span className="flex flex-col items-center gap-0.5">
                      <span>N0X</span>
                      <span className="text-[9px] text-emerald-500/60 font-normal">this project</span>
                    </span>
                  </th>
                  <th className="px-6 py-4 text-center font-mono text-xs text-zinc-500">ChatGPT</th>
                  <th className="px-6 py-4 text-center font-mono text-xs text-zinc-500">Claude</th>
                  <th className="px-6 py-4 text-center font-mono text-xs text-zinc-500">Ollama</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr key={row.feature} className={`border-b border-zinc-900/60 ${i % 2 === 0 ? "" : "bg-zinc-900/20"}`}>
                    <td className="px-6 py-3 text-zinc-400 text-xs font-mono">{row.feature}</td>
                    <td className="px-6 py-3 text-center bg-emerald-500/5 border-x border-emerald-500/10"><Cell v={row.n0x} /></td>
                    <td className="px-6 py-3 text-center"><Cell v={row.chatgpt} /></td>
                    <td className="px-6 py-3 text-center"><Cell v={row.claude} /></td>
                    <td className="px-6 py-3 text-center"><Cell v={row.ollama} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-zinc-700 font-mono text-center mt-2">as of June 2026 · free tiers compared</p>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="w-full mt-16 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {/* Hero Card — Agent */}
          <motion.div
            variants={fadeIn}
            className="md:col-span-3 bg-gradient-to-br from-zinc-900 via-zinc-900/80 to-emerald-950/25 border border-emerald-500/20 rounded-2xl p-8 hover:border-emerald-500/40 transition-all group overflow-hidden relative shadow-glass"
          >
            <div className="absolute top-0 right-0 p-8 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity">
              <Bot className="w-64 h-64" />
            </div>
            <div className="absolute -top-px left-8 text-[10px] bg-emerald-500 text-black px-3 py-1 rounded-b font-mono font-bold tracking-wider">STREAMING AGENT THOUGHTS</div>
            <div className="relative z-10 space-y-4 pt-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">Autonomous ReAct Agent</h3>
                <p className="text-zinc-400 mt-2 font-medium max-w-2xl leading-relaxed">
                  A full reasoning loop running entirely in your browser. The LLM thinks, picks tools, executes them, reads results, and iterates — with every thought streaming live token-by-token. Watch the model reason in real time. No server. No API. Pure WebGPU autonomy.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-mono text-zinc-500">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live thought streaming</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Multi-tool orchestration</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Per-step trace UI</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Loop detection + OOM protection</span>
              </div>
            </div>
          </motion.div>

          {/* WebGPU Inference */}
          <motion.div
            variants={fadeIn}
            className="md:col-span-2 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8 hover:bg-zinc-900/80 transition-colors group overflow-hidden relative shadow-glass"
          >
            <div className="absolute top-0 right-0 p-8 opacity-[0.07] group-hover:opacity-[0.15] transition-opacity">
              <Cpu className="w-52 h-52" />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-white border border-zinc-700">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">WebGPU Inference</h3>
                <p className="text-zinc-400 mt-2 font-medium">Direct-to-metal via MLC WebLLM. 40+ models from <span className="text-white font-semibold">360MB to 70B</span> — downloaded once, cached in your browser forever.</p>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {["Llama 3.3 70B", "DeepSeek R1 70B", "Qwen 2.5 32B", "Mistral 7B", "Qwen 0.5B", "+35 more"].map(m => (
                  <span key={m} className="text-[11px] font-mono text-zinc-400 border border-zinc-800 px-2 py-0.5 rounded-md bg-zinc-900">{m}</span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Privacy */}
          <motion.div variants={fadeIn} className="md:col-span-1 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8 hover:bg-zinc-900/80 transition-colors shadow-glass">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-white border border-zinc-700">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Zero Tracking</h3>
                <p className="text-zinc-400 mt-2 text-sm font-medium">No server processes your data. Prompts, documents, and memory live in IndexedDB on your device. Disable optional search/image hooks for a fully air-gapped runtime.</p>
              </div>
            </div>
          </motion.div>

          {/* Document RAG */}
          <motion.div variants={fadeIn} className="md:col-span-1 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8 hover:bg-zinc-900/80 transition-colors shadow-glass">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-white border border-zinc-700">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Document RAG</h3>
                <p className="text-zinc-400 mt-2 text-sm font-medium">
                  Drop PDFs, DOCX, CSVs, or text files. Sentence-boundary chunking, MiniLM embeddings, and <span className="text-white">MMR reranking</span> — all in a Web Worker.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {["PDF", "DOCX", "TXT", "MD", "CSV", "JSON"].map(f => (
                  <span key={f} className="text-[10px] font-mono text-zinc-500 border border-zinc-800 px-2 py-0.5 rounded bg-zinc-950">{f}</span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Conversation Branching */}
          <motion.div
            variants={fadeIn}
            className="md:col-span-2 bg-gradient-to-br from-zinc-900/50 to-blue-950/10 border border-blue-500/10 rounded-2xl p-8 hover:border-blue-500/20 hover:bg-zinc-900/80 transition-all shadow-glass group"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 border border-blue-500/20">
                <GitBranch className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-xl font-bold text-white tracking-tight">Conversation Branching</h3>
                  <span className="text-[10px] font-mono text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full bg-blue-500/10">NEW</span>
                </div>
                <p className="text-zinc-400 mt-1 font-medium">Hover any message and click the branch icon to fork the conversation from that exact point. Explore alternative directions without losing your original thread. Branches are saved automatically.</p>
              </div>
            </div>
          </motion.div>

          {/* More capabilities */}
          <motion.div variants={fadeIn} className="md:col-span-3 bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-8 shadow-glass">
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-6">More Capabilities</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6 text-zinc-400">
              {[
                { icon: Code, label: "Python Sandbox", sub: "Pyodide WASM runtime" },
                { icon: Globe, label: "Deep Search", sub: "DDG + SearXNG + Wikipedia" },
                { icon: ImageIcon, label: "Image Gen", sub: "Flux / Stable Horde" },
                { icon: Mic, label: "Voice I/O", sub: "STT + TTS native" },
                { icon: Brain, label: "Persistent Memory", sub: "IndexedDB long-term" },
                { icon: Layers, label: "5 Personas", sub: "Engineer · Writer · Tutor…" },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex flex-col gap-2">
                  <Icon className="w-5 h-5 text-zinc-300" />
                  <span className="font-semibold text-white text-sm">{label}</span>
                  <span className="text-xs text-zinc-500 leading-tight">{sub}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Star CTA Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-16 w-full rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-900/40 border border-zinc-800/60 p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-glass"
        >
          <div className="space-y-1.5 text-center sm:text-left">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">open source · MIT · built in public</div>
            <div className="text-xl font-bold text-white">If n0x saved you money, give it a ⭐</div>
            <div className="text-sm text-zinc-400 max-w-sm">
              Every star helps more developers find this. Takes 2 seconds, costs $0 — just like n0x.
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <a
              href="https://github.com/ixchio/n0x"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:bg-zinc-200 transition-colors text-sm"
            >
              <Star className="w-4 h-4 fill-amber-500 text-amber-500" /> Star on GitHub
            </a>
            <a
              href="https://github.com/ixchio/n0x/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white font-medium hover:bg-zinc-800 transition-colors text-sm"
            >
              <ExternalLink className="w-4 h-4" /> Contribute
            </a>
          </div>
        </motion.div>

        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-20 text-center space-y-6 max-w-xl"
        >
          <h2 className="text-3xl font-bold text-white tracking-tight">Ready to run AI locally?</h2>
          <p className="text-zinc-400 font-medium">No sign-up. No API keys. Just open the app, pick a model, and start.</p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 h-12 px-10 rounded-lg bg-white text-black font-bold hover:bg-zinc-200 transition-colors text-sm shadow-[0_0_40px_rgba(255,255,255,0.1)]"
          >
            Launch n0x <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-zinc-800/50 py-8 relative z-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 font-mono">
          <span>© {new Date().getFullYear()} ixchio · MIT License</span>
          <span>WebGPU for local models · Ollama &amp; Cloud API also supported</span>
          <a href="https://github.com/ixchio/n0x" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors flex items-center gap-1.5">
            <Star className="w-3 h-3 text-amber-400" />
            github.com/ixchio/n0x
          </a>
        </div>
      </footer>

    </div>
  );
}
