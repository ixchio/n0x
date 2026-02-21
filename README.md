<div align="center">
  <img src="https://raw.githubusercontent.com/ixchio/n0x/main/public/icon.png" width="80" alt="n0x logo" style="border-radius:20%" />
</div>

<h1 align="center">n0x / The Browser-Native AI Stack</h1>

<div align="center">
  <strong>Zero backend. 100% private. Blistering fast local inference.</strong>
</div>

<br />

<div align="center">
  <a href="https://n0x.vercel.app">Live Demo</a>
  <span> · </span>
  <a href="#architecture">Architecture</a>
  <span> · </span>
  <a href="#deployment">Deployment</a>
</div>

<br />

n0x is a demonstration of pushing edge compute to its absolute limits. Utilizing **WebGPU**, **WASM**, and **IndexedDB**, n0x runs a complete AI ecosystem entirely within the client's browser. No API keys, no cloud compute costs, and zero data leaves the user's local machine.

## Technical Capabilities

* **WebGPU Inference Engine**: Direct-to-metal LLM execution via `MLC/WebLLM`. Hits 40+ tokens/sec on standard consumer hardware. Models (Llama 3, Qwen 2.5, Phi 3.5) are downloaded once and aggressively cached.
* **WASM Vector Search (RAG)**: Drag-and-drop document processing. Chunking, `all-MiniLM-L6-v2` embedding generation via `transformers.js`, and cosine similarity search via `voy-search` — all running locally in WebAssembly.
* **Sandboxed Python Runtime**: Client-side execution of Python data analysis and scripting via `Pyodide`. Code output flows directly back into the LLM context.
* **Persistent Telemetry & Memory**: Long-term conversational memory and engine orchestration state persisted securely via IndexedDB.

## Architecture & DAG Execution

n0x uses an event-driven architecture to orchestrate models and APIs.

```text
[User Input] → [Intent Router]
                   │
                   ├─→ [Deep Search Enabled?] ──→ Serverless Proxy (DuckDuckGo/Tavily)
                   │
                   ├─→ [Documents Attached?] ──→ WASM Vector DB (Voy) → Extract Context
                   │
                   ├─→ [Python Requested?] ────→ Pyodide (WASM Sandbox) → Output Capture
                   │
                   └─→ [Memory Context] ───────→ IndexedDB Vector Retrieval
                             │
                             ▼
              [WebGPU Base LLM (e.g. Qwen 2.5)]
                             │
                             ▼
                   [UI Render / Telemetry]
```

## Quick Start (Development)

Requires Node 18+ and Chromium 113+ (for WebGPU API support).

```bash
git clone https://github.com/ixchio/n0x.git
cd n0x
npm install
npm run dev
```

Open `localhost:3000`. The engine will initialize and download the default quantized weights on the first load.

## Models & Memory Footprint

Weights are quantized (q4f16) for optimal VRAM usage.

| Tier | Default Weights | VRAM Est. | Tokens/Sec (M-series) |
|---|---|---|---|
| **Fast** | Qwen2.5 0.5B Instruct | ~400MB | 50+ |
| **Balanced** | Qwen2.5 1.5B Instruct | ~1.1GB | 35+ |
| **Powerful** | Llama 3.2 3B Instruct | ~2.2GB | 20+ |
| **Code** | Qwen2.5 Coder 1.5B | ~1.1GB | 35+ |

## Security & Privacy

This project is built on a "local maximum" privacy thesis.

Because the inference graph and orchestration layer remain entirely in the browser, PII and proprietary code never transit a network boundary. The only exceptions are explicit external hooks:
- **Search Retrieval**: Pings a Next.js serverless route proxy to bypass CORS.
- **Image Generation**: Pings the free Stable Horde / Pollinations API.
Both can be toggled off individually, guaranteeing a 100% air-gapped run state.

## Stack

`Next.js 14` `TypeScript` `WebLLM (WebGPU)` `Pyodide (WASM)` `Transformers.js` `Tailwind CSS` `Framer Motion` `Zustand`

## License

MIT © [ixchio](https://github.com/ixchio)
