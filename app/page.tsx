"use client";

import React from "react";
import Link from "next/link";
import { Terminal, Shield, Cpu, Zap, Brain, Globe, Code, FileText, Image, Mic } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-crt-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(#33ff33 1px, transparent 1px), linear-gradient(90deg, #33ff33 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }}
      />

      <div className="relative z-10 max-w-xl w-full space-y-8 text-center">
        {/* Logo */}
        <div className="space-y-4">
          <div className="inline-block">
            <h1 className="font-pixel text-3xl sm:text-4xl text-phosphor text-glow tracking-widest">
              N0X
            </h1>
          </div>
          <p className="text-txt-secondary text-sm font-mono">
            the full AI stack, in one browser tab
          </p>
        </div>

        {/* Feature grid */}
        <div className="bg-crt-surface border border-crt-border rounded p-5 text-left text-sm space-y-3">
          <div className="text-phosphor-dim text-xs">
            <span className="text-phosphor">$</span> n0x --features
          </div>
          <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
            <div className="flex items-center gap-2.5 text-txt-primary">
              <Cpu className="w-3.5 h-3.5 text-phosphor shrink-0" />
              <span>LLM inference (WebGPU)</span>
            </div>
            <div className="flex items-center gap-2.5 text-txt-primary">
              <Globe className="w-3.5 h-3.5 text-neon-cyan shrink-0" />
              <span>deep web search</span>
            </div>
            <div className="flex items-center gap-2.5 text-txt-primary">
              <FileText className="w-3.5 h-3.5 text-neon-amber shrink-0" />
              <span>RAG / doc search</span>
            </div>
            <div className="flex items-center gap-2.5 text-txt-primary">
              <Code className="w-3.5 h-3.5 text-phosphor shrink-0" />
              <span>python execution</span>
            </div>
            <div className="flex items-center gap-2.5 text-txt-primary">
              <Image className="w-3.5 h-3.5 text-neon-magenta shrink-0" />
              <span>image generation</span>
            </div>
            <div className="flex items-center gap-2.5 text-txt-primary">
              <Brain className="w-3.5 h-3.5 text-neon-cyan shrink-0" />
              <span>persistent memory</span>
            </div>
            <div className="flex items-center gap-2.5 text-txt-primary">
              <Mic className="w-3.5 h-3.5 text-phosphor shrink-0" />
              <span>text-to-speech</span>
            </div>
            <div className="flex items-center gap-2.5 text-txt-primary">
              <Shield className="w-3.5 h-3.5 text-phosphor shrink-0" />
              <span>private by default</span>
            </div>
          </div>

          <div className="pt-2 border-t border-crt-border text-[10px] text-txt-tertiary space-y-1">
            <p>core AI runs locally in your browser — no server, no account, no data leaves your machine.</p>
            <p>optional features (search, image gen) reach out when you flip the switch.</p>
          </div>
        </div>

        {/* Enter */}
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 px-6 py-3 bg-crt-surface border border-phosphor-dim text-phosphor font-mono text-sm hover:bg-phosphor-faint hover:border-phosphor hover:shadow-glow-green transition-all duration-200 rounded"
        >
          <Terminal className="w-4 h-4" />
          <span>enter n0x</span>
        </Link>

        {/* Footer */}
        <div className="text-txt-tertiary text-[10px] font-mono space-y-1 pt-2">
          <p>no install · no api keys to start · works offline after first visit</p>
          <p>requires chrome 113+ with webgpu</p>
        </div>
      </div>
    </div>
  );
}
