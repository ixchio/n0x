<div align="center">
  <img src="https://raw.githubusercontent.com/ixchio/n0x/main/public/icon.png" width="80" alt="n0x logo" style="border-radius:20%" />
</div>

<h1 align="center">n0x</h1>

<div align="center">
  <strong>The full AI stack in one browser tab.</strong><br />
  LLM inference, autonomous agents, RAG, code execution, image generation — zero backend, zero API keys.
</div>

<br />

<div align="center">
  <a href="https://n0x.vercel.app">Live Demo</a>
  <span> · </span>
  <a href="#architecture">Architecture</a>
  <span> · </span>
  <a href="#why-this-exists">Thesis</a>
  <span> · </span>
  <a href="#quick-start">Quick Start</a>
</div>

<br />

## Why This Exists

Cloud AI is a moat for vendors, not users. Every API call ships your data to someone else's GPU, adds latency, and costs money. n0x proves that a complete AI workflow — inference, tool use, document retrieval, code execution — can run **entirely inside a browser tab** using WebGPU, WASM, and IndexedDB. No server. No account. No data leaves your machine.

## Core Systems

### WebGPU Inference Engine
Direct-to-metal LLM execution via MLC/WebLLM. Quantized models (q4f16) hit **35–50 tokens/sec** on consumer hardware. 16 models available across 5 tiers — downloaded once, cached in browser storage permanently. Real-time TPS telemetry displayed by default.

### Autonomous Agent Loop (ReAct)
A full ReAct-style reasoning engine running in-browser. The LLM autonomously chains tool calls — web search, document retrieval, Python execution, memory — across multiple iterations until it solves the problem. Features:
- Multi-strategy JSON parsing (handles malformed LLM output)
- Per-tool execution timeouts with AbortController cancellation
- Context window budgeting (prevents OOM on small model windows)
- Loop detection (catches repeated tool calls)
- Live trace UI with per-step timing

### WASM Vector Search (RAG)
Drag-and-drop document ingestion (PDF, TXT, MD, JSON). Text is chunked, embedded via `all-MiniLM-L6-v2` (transformers.js), and indexed for cosine similarity search using `voy-search`. Entire pipeline runs in a Web Worker — zero UI blocking. Vectors are cached in IndexedDB across sessions.

### Sandboxed Python Runtime
Client-side Python execution via Pyodide (WASM). Code output feeds back into LLM context. Self-healing: if execution fails, the error is automatically sent back to the LLM for a retry.

### Additional Capabilities
- **Deep Search**: DuckDuckGo + Wikipedia synthesis via lightweight serverless proxy
- **Image Generation**: Pollinations AI (Flux) with Stable Horde fallback
- **Persistent Memory**: Long-term conversational memory via IndexedDB
- **Voice I/O**: Browser-native speech-to-text and text-to-speech
- **5 Persona Modes**: Default, Senior Engineer, Writer, Tutor, Analyst — each with detailed response formatting rules

## Architecture

```text
[User Input] → [Mode Router]
                   │
                   ├─→ [Agent Mode] ──→ ReAct Loop (Thought → Action → Observation)
                   │                         │
                   │         ┌───────────────┼───────────────┐
                   │         ▼               ▼               ▼
                   │    [Web Search]   [RAG Search]    [Python Exec]
                   │         │               │               │
                   │         └───────────────┼───────────────┘
                   │                         ▼
                   │                  [Next Iteration or Final Answer]
                   │
                   ├─→ [Direct Mode] ──→ Context Assembly
                   │         │
                   │         ├── Search results (if enabled)
                   │         ├── Document context (if attached)
                   │         └── Memory context (if enabled)
                   │         │
                   │         ▼
                   │    [WebGPU LLM] → Streaming Response
                   │
                   └─→ [Image Mode] ──→ Pollinations / Stable Horde API
```

## Models & Memory Footprint

All weights are quantized (q4f16) for optimal VRAM usage. Default: **Qwen 2.5 1.5B**.

| Tier | Model | VRAM | Tokens/Sec |
|---|---|---|---|
| ⚡ Fast | SmolLM2 360M, Qwen 0.5B, TinyLlama 1.1B | 250MB–600MB | 50+ |
| ⚖️ Balanced | **Qwen 2.5 1.5B** *(default)*, Llama 3.2 1B, Phi-3.5 Mini | 700MB–2GB | 30–40 |
| 🚀 Powerful | Llama 3.2 3B, Qwen 3B, Mistral 7B, Hermes 2 Pro 8B | 2–4.5GB | 15–25 |
| 💻 Code | Qwen Coder 1.5B, Qwen Coder 7B, DeepSeek Coder 1.3B | 800MB–4GB | 25–40 |

## Quick Start

Requires Node 18+ and Chromium 113+ (WebGPU).

```bash
git clone https://github.com/ixchio/n0x.git
cd n0x
npm install
npm run dev
```

Open `localhost:3000`. Default model (~1GB) downloads on first load and is cached permanently.

## Privacy Model

The inference graph and orchestration layer run entirely in the browser. PII and proprietary content never transit a network boundary. Two optional external hooks exist, both toggleable:
- **Search**: Serverless proxy for DuckDuckGo/Tavily (CORS bypass)
- **Image Gen**: Pollinations AI / Stable Horde API

Disabling both guarantees a **100% air-gapped** runtime.

## Stack

`Next.js 14` · `TypeScript` · `WebLLM (WebGPU)` · `Pyodide (WASM)` · `Transformers.js` · `Voy Search` · `Tailwind CSS` · `Framer Motion` · `Zustand`

## License

MIT © [ixchio](https://github.com/ixchio)
