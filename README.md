<div align="center">
  <img src="https://raw.githubusercontent.com/ixchio/n0x/main/public/icon.png" width="80" alt="n0x logo" style="border-radius:20%" />
</div>
<h1 align="center">n0x</h1>

<div align="center">
  <strong>The full AI stack — in one browser tab.</strong><br />
  LLM inference · Autonomous agents · RAG · Code execution · Image generation<br />
  Zero backend. Zero API keys. Zero data leaves your machine.
</div>

<br />

<div align="center">
  <a href="https://n0x.vercel.app">Live Demo</a>
  <span> · </span>
  <a href="#architecture">Architecture</a>
  <span> · </span>
  <a href="#models">Models</a>
  <span> · </span>
  <a href="#quick-start">Quick Start</a>
  <span> · </span>
  <a href="#privacy">Privacy</a>
</div>

<br />

<img width="1657" height="923" alt="n0x chat interface" src="https://github.com/user-attachments/assets/ba7d17e8-b26f-4cf7-a072-cf39cfb37ab4" />

---

## What is n0x?

n0x is an in-browser AI workstation. It runs a complete AI stack — language model, autonomous agent, retrieval-augmented generation, Python runtime, image generation — without a server, an account, or a single API key. Your data never leaves your machine.

It runs on WebGPU and WASM, today, in Chrome.

---

## Core Features

### ⚡ WebGPU Inference Engine
Direct-to-metal LLM execution via MLC/WebLLM. Quantized models hit **35–60 tokens/sec** on consumer hardware. 40 open-source models from **360MB to 70B** — downloaded once, cached in browser storage forever. Real-time TPS telemetry displayed in the header.

### 🤖 Streaming Autonomous Agent (ReAct)
A full ReAct-style reasoning engine. The LLM autonomously chains tool calls across multiple iterations — thoughts stream **live token-by-token** directly into the chat. Features:
- **Live thought streaming** — watch the model reason in real time
- Multi-strategy JSON parsing (handles malformed LLM output)
- Per-tool execution timeouts with `AbortController` cancellation
- Context window budgeting (prevents OOM crashes on small models)
- Loop detection with automatic recovery
- Live trace UI with per-step timing and token cost

### 📄 Best-in-Class Document RAG
Drag-and-drop any file and ask questions about it. The entire pipeline runs in a Web Worker — zero UI blocking.

| | Detail |
|---|---|
| **Supported files** | PDF, DOCX, TXT, MD, JSON, CSV, HTML |
| **PDF text extraction** | pdfjs-dist with reading-order preservation |
| **DOCX extraction** | Native DecompressionStream + XML parse — zero extra dependencies |
| **Chunking** | Sentence-boundary-aware sliding window, 50% overlap |
| **Embedding** | `all-MiniLM-L6-v2` via Transformers.js (runs in worker) |
| **Search** | Voy cosine search → **MMR re-ranking** (relevant + diverse, no duplicates) |
| **Cache** | Vectors persisted to IndexedDB — instant reload on next visit |

### 🐍 Sandboxed Python Runtime
Client-side Python via Pyodide (WASM). Code output feeds directly back into LLM context. Self-healing: execution errors are automatically sent to the LLM for a retry.

### 🔀 Conversation Branching
Hover any message and click the **branch icon** to fork the conversation from that exact point. Explore alternative directions without losing the original thread. Branches are persisted and appear in the sidebar.

### 🌐 Web Search & Deep Research
DuckDuckGo + Wikipedia synthesis via a lightweight serverless proxy. Optional Tavily API for enhanced, citation-rich results.

### 🎨 Image Generation
Pollinations AI (Flux) with Stable Horde as a fallback. Trigger with natural language: *"generate an image of…"*

### 🧠 Persistent Memory
Long-term conversational memory stored in IndexedDB. The agent can save and recall facts across sessions.

### 🎙️ Voice I/O
Browser-native speech-to-text (Web Speech API) and streaming text-to-speech. Works offline.

### 🎭 Persona System
5 built-in system prompt personas — Default, Senior Engineer, Writer, Tutor, Analyst — each with detailed formatting and tone rules.

---

## Architecture

```text
[User Input] → [Mode Router]
                   │
                   ├─→ [Agent Mode] ──→ ReAct Loop
                   │         │          ├─ Thought (streamed live) → Action → Observation
                   │         │          └─ Iterate until Final Answer
                   │         │
                   │    [Tool Registry]
                   │         ├── Web Search   (DuckDuckGo / Tavily)
                   │         ├── RAG Search   (voy + MMR)
                   │         ├── Python Exec  (Pyodide WASM)
                   │         └── Memory       (IndexedDB)
                   │
                   ├─→ [Direct Mode] ──→ Context Assembly
                   │         ├── RAG context (sentence chunks, MMR reranked)
                   │         ├── Web search results
                   │         └── Memory context
                   │         └── [WebGPU LLM] → Streaming Response
                   │
                   └─→ [Image Mode] ──→ Pollinations / Stable Horde
```

---

## Models

40 open-source models. All MLC-compiled, all real — no mocks. Default: **Qwen 2.5 1.5B** (~1GB, loads in seconds on a warm cache).

| Category | Models | Size Range | Speed |
|---|---|---|---|
| ⚡ **Tiny** | SmolLM2 360M, Qwen 0.5B, TinyLlama, SmolLM2 1.7B | 360MB – 900MB | 60+ t/s |
| ⚖️ **Balanced** | Qwen 2.5 1.5B *(default)*, Llama 3.2 1B, Gemma 2 2B, Phi-3.5 Mini, Llama 3.2 3B | 700MB – 2.2GB | 35–50 t/s |
| 🚀 **Powerful** | Mistral 7B, Llama 3.1 8B, Qwen 2.5 7B, Gemma 2 9B, Mistral Nemo 12B, **Qwen 2.5 32B**, **Llama 3.3 70B** | 4GB – 30GB | 8–25 t/s |
| 🧠 **Reasoning** | R1 Qwen 1.5B → R1 Qwen 32B, **R1 Llama 70B** | 1.1GB – 30GB | varies |
| 💻 **Coding** | Qwen Coder 1.5B/7B/32B, DeepSeek Coder, Qwen Math 1.5B/7B | 800MB – 20GB | varies |
| 🔓 **Uncensored** | WizardCoder 15B | ~8GB | 12–18 t/s |

> Low-resource? Start with **SmolLM2 360MB** or **Qwen 0.5B** — they're responsive on any device with a GPU.
> High-resource? Load **Llama 3.3 70B** or **R1 Llama 70B** for flagship-level quality entirely offline.

---

## Quick Start

Requires **Node 18+** and **Chrome / Edge 113+** (WebGPU support).

```bash
git clone https://github.com/ixchio/n0x.git
cd n0x
npm install
npm run dev
```

Open `http://localhost:3000`. The default model (~1GB) downloads on first launch and is cached permanently — subsequent loads are instant.

### Optional Environment Variables

```env
TAVILY_API_KEY=      # Enhanced web search (server-side only, never exposed to client)
POLLINATIONS_API_KEY= # Watermark-free image generation
```

Neither is required. n0x runs fully offline without them.

---

## Privacy

The inference graph and orchestration layer run entirely in the browser. Your prompts, documents, and model weights are **never transmitted to any server**.

Two optional external hooks exist, both independently toggleable:

| Hook | Purpose | Data sent |
|---|---|---|
| Search proxy | DuckDuckGo / Tavily CORS bypass | Your search query only |
| Image API | Pollinations / Stable Horde | Your image prompt only |

Disabling both gives you a **100% air-gapped runtime**.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14, TypeScript |
| LLM Runtime | WebLLM (`@mlc-ai/web-llm`), WebGPU |
| Embeddings | Transformers.js (`@xenova/transformers`) |
| Vector Search | Voy Search |
| Python Runtime | Pyodide (WASM) |
| Styling | Tailwind CSS, Framer Motion |
| State | Zustand |
| Storage | IndexedDB (models, vectors, memory, conversations) |

---

## Screenshots

<img width="1657" height="923" alt="Chat interface" src="https://github.com/user-attachments/assets/dad81977-dd49-4d48-84b4-fd655825e3c2" />
<img width="1920" height="913" alt="Agent trace" src="https://github.com/user-attachments/assets/2fb8a22e-e96b-4497-8bd2-3cb5ea88a758" />
<img width="1920" height="913" alt="Model selector" src="https://github.com/user-attachments/assets/99f66f62-b9d6-4374-92e4-3920ba60aaf4" />

---

## License

MIT © [ixchio](https://github.com/ixchio)
