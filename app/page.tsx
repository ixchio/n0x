"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Terminal, Shield, Cpu, Zap, Brain, Globe, Code, FileText, ImageIcon, Mic, ArrowRight, Lock, Database, Bot } from "lucide-react";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center selection:bg-white/20 relative overflow-hidden font-sans">

      {/* Subtle Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-zinc-800/20 blur-[120px] rounded-full point-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-800/20 blur-[120px] rounded-full point-events-none" />

      {/* Grid Pattern Pattern */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "64px 64px"
        }}
      />

      {/* Nav/Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <div className="font-mono text-xl font-bold tracking-tighter flex items-center gap-2">
          <div className="w-4 h-4 bg-white rounded-[2px]" />
          n0x
        </div>
        <div className="flex items-center gap-6 text-sm text-zinc-400 font-medium">
          <Link href="https://github.com/ixchio/n0x" className="hover:text-white transition-colors">GitHub</Link>
          <Link href="/chat" className="text-white hover:text-zinc-300 transition-colors flex items-center gap-1">
            Launch App <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-20 lg:py-32 flex flex-col items-center relative z-10">

        {/* Hero Section */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="text-center max-w-3xl space-y-8"
        >
          <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 mb-4 shadow-glass">
            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Zero Backend Architecture
          </motion.div>

          <motion.h1 variants={fadeIn} className="text-5xl sm:text-7xl font-bold tracking-tight text-white leading-[1.1]">
            Autonomous AI Agent. <br className="hidden sm:block" />
            <span className="text-zinc-500">In Your Browser.</span>
          </motion.h1>

          <motion.p variants={fadeIn} className="text-lg sm:text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto font-medium">
            The first fully in-browser autonomous agent. WebGPU inference, tool use, RAG, code execution — zero backend, zero API keys, 100% private.
          </motion.p>

          <motion.div variants={fadeIn} className="flex items-center justify-center gap-4 pt-4">
            <Link href="/chat" className="h-12 px-8 inline-flex items-center justify-center rounded-md bg-white text-black font-semibold hover:bg-zinc-200 transition-colors gap-2 text-sm shadow-[0_0_20px_rgba(255,255,255,0.1)]">
              Enter n0x
            </Link>
            <Link href="https://github.com/ixchio/n0x" className="h-12 px-8 inline-flex items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 text-white font-medium hover:bg-zinc-800 transition-colors text-sm shadow-glass">
              View Architecture
            </Link>
          </motion.div>
        </motion.div>

        {/* Bento Box Features */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="w-full mt-32 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {/* Card 0 — AGENT (Hero Feature) */}
          <motion.div variants={fadeIn} className="md:col-span-3 bg-gradient-to-br from-zinc-900/80 via-zinc-900/50 to-emerald-950/20 border border-emerald-500/20 rounded-2xl p-8 hover:border-emerald-500/40 transition-all group overflow-hidden relative shadow-glass">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Bot className="w-56 h-56" />
            </div>
            <div className="absolute -top-1 left-8 text-[10px] bg-emerald-500 text-black px-3 py-1 rounded-b font-mono font-bold tracking-wider">NEW — FIRST OF ITS KIND</div>
            <div className="relative z-10 space-y-4 pt-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 border border-emerald-500/30">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">Autonomous Agent Loop</h3>
                <p className="text-zinc-400 mt-2 font-medium max-w-xl">A ReAct-style reasoning loop running entirely in your browser. The LLM thinks, picks tools (search, documents, Python, memory), executes them, reads results, and keeps going until it solves your problem. No server. No API. Just raw WebGPU autonomy.</p>
              </div>
              <div className="flex items-center gap-3 pt-2 text-xs font-mono text-zinc-500">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Thought → Action → Observation</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Multi-tool Orchestration</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Live Trace UI</span>
              </div>
            </div>
          </motion.div>

          {/* Card 1 */}
          <motion.div variants={fadeIn} className="md:col-span-2 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8 hover:bg-zinc-900/80 transition-colors flex flex-col justify-between group overflow-hidden relative shadow-glass">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
              <Cpu className="w-48 h-48" />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-white border border-zinc-700">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">WebGPU Inference</h3>
                <p className="text-zinc-400 mt-2 font-medium">Models run directly in your browser. Blistering fast token generation via MLC WebLLM. Downloaded once, cached forever.</p>
              </div>
            </div>
          </motion.div>

          {/* Card 2 */}
          <motion.div variants={fadeIn} className="md:col-span-1 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8 hover:bg-zinc-900/80 transition-colors flex flex-col justify-between shadow-glass">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-white border border-zinc-700">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Zero Tracking</h3>
                <p className="text-zinc-400 mt-2 text-sm font-medium">No server processing your private data. Everything lives in IndexedDB on your device.</p>
              </div>
            </div>
          </motion.div>

          {/* Card 3 */}
          <motion.div variants={fadeIn} className="md:col-span-1 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8 hover:bg-zinc-900/80 transition-colors shadow-glass">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-white border border-zinc-700">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Local RAG</h3>
                <p className="text-zinc-400 mt-2 text-sm font-medium">Drag-and-drop PDFs. Chunked, embedded, and queried entirely via WASM.</p>
              </div>
            </div>
          </motion.div>

          {/* Card 4 */}
          <motion.div variants={fadeIn} className="md:col-span-2 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8 hover:bg-zinc-900/80 transition-colors flex items-center shadow-glass">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full text-zinc-400">
              <div className="flex flex-col gap-2">
                <Code className="w-5 h-5 text-white" />
                <span className="font-semibold text-white">Pyodide Sandbox</span>
                <span className="text-xs">Run Python snippets</span>
              </div>
              <div className="flex flex-col gap-2">
                <Globe className="w-5 h-5 text-white" />
                <span className="font-semibold text-white">Deep Search</span>
                <span className="text-xs">Tavily/DDG synthesis</span>
              </div>
              <div className="flex flex-col gap-2">
                <ImageIcon className="w-5 h-5 text-white" />
                <span className="font-semibold text-white">Image Gen</span>
                <span className="text-xs">Stable Horde fallback</span>
              </div>
              <div className="flex flex-col gap-2">
                <Mic className="w-5 h-5 text-white" />
                <span className="font-semibold text-white">Native TTS</span>
                <span className="text-xs">Web Speech API</span>
              </div>
            </div>
          </motion.div>

        </motion.div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-zinc-800/50 py-8 text-center text-xs text-zinc-500 font-mono relative z-10">
        <p>Engineered for full local execution. Requires Chromium 113+ for WebGPU.</p>
      </footer>
    </div>
  );
}
