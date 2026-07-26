<div align="center">
  <img src="https://raw.githubusercontent.com/ixchio/n0x/main/public/icon.png" width="80" alt="n0x logo" />
  <h1>n0x</h1>
  <p><strong>Ask documents in your browser and verify answers with filename/chunk citations.</strong></p>
  <p>Local-first document Q&amp;A, with agents, Python, search, images, and cloud providers when you choose them.</p>

  <p>
    <a href="https://n0xth.vercel.app"><img src="https://img.shields.io/badge/Try%20it%20live-→-6366f1?style=for-the-badge&labelColor=0f0f0f" alt="Live demo" /></a>
    &nbsp;
    <a href="https://github.com/ixchio/n0x/stargazers"><img src="https://img.shields.io/github/stars/ixchio/n0x?style=for-the-badge&color=f59e0b&labelColor=0f0f0f&label=Stars" alt="Stars" /></a>
    &nbsp;
    <a href="https://github.com/ixchio/n0x/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge&labelColor=0f0f0f" alt="MIT License" /></a>
    &nbsp;
    <a href="https://github.com/ixchio/n0x/actions"><img src="https://img.shields.io/github/actions/workflow/status/ixchio/n0x/ci.yml?style=for-the-badge&label=CI&labelColor=0f0f0f" alt="CI" /></a>
  </p>

  <a href="https://www.producthunt.com/products/n0x?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-n0x" target="_blank">
    <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1162703&theme=dark&t=1780509567546" alt="N0X on Product Hunt" width="220" height="48" />
  </a>
</div>

<br />

<img width="1440" height="960" alt="n0x private docs workflow" src="public/screenshots/chat-workbench.png" />

<br />

---

## What is n0x?

n0x is a local-first document Q&A workbench and browser AI workstation. Attach a supported document, ask a question, and N0X supplies retrieved passages to the model with exact citation tags such as `[policy.pdf#chunk-3]`. Citations identify the retrieved passage; they do not make model output infallible, so inspect the cited text for important decisions.

Its Browser provider uses **WebGPU** and **WebAssembly** for local inference, retrieval, and Python execution without a hosted inference account.

You get:

- **Document Q&A** with filename/chunk citations and explicit no-evidence handling
- **Local LLM inference** with 21 curated WebLLM models
- **Hybrid retrieval** for larger documents (vector + BM25 → RRF → MMR)
- **Autonomous agent** with a ReAct loop and permission-gated tools
- **Python runtime** via Pyodide WASM in a dedicated, terminable worker
- **Multi-engine web search** (SearXNG · DDG · Wikipedia · Brave · Tavily)
- **Image generation** through an explicit Pollinations/AI Horde network route
- **Optional persistent memory** saved and recalled only when Memory is enabled

Browser-provider chat, document indexing, conversation history, enabled memory, and Python execution run client-side. First-time model, embedding, and permitted Pyodide asset downloads use the network but do not upload your document for indexing. Deep Search, image generation, approved external Markdown images, browser speech services, remote Ollama hosts, Cloud API providers, and opt-in telemetry are separate network paths.

---

## Demo

| Feature                          | Preview                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Private docs first run           | <img width="900" alt="Private docs first run" src="public/screenshots/chat-workbench.png" /> |
| Landing page product positioning | <img width="900" alt="Landing page" src="public/screenshots/home-page.png" />                |

---

## Quickstart

**Requirements:** Node 20.19+ (CI uses Node 20). Chrome or Edge 113+ is recommended for the local WebGPU provider; Ollama and Cloud API can be used without local WebGPU.

```bash
git clone https://github.com/ixchio/n0x.git
cd n0x
npm install
npm run dev
```

Open `http://localhost:3000`, attach a document or load the sample, then choose a provider. Loading a Browser model is a separate action: the first load downloads the size shown in the selector (roughly 360MB–5.5GB). Cached weights avoid most re-downloads, but the model still initializes each visit; browser eviction, site-data clearing, or clearing Model Weights requires another download.

For a production check and local production server:

```bash
npm run build
npm run start
```

> **Just want to try it?** → [n0xth.vercel.app](https://n0xth.vercel.app) — no install needed.

### Optional env vars

Put only the values you need in `.env.local`, then restart the development server. Never expose these as `NEXT_PUBLIC_*` values.

```env
# All optional; local chat does not need them.
TAVILY_API_KEY=tvly-xxxxx       # Research-grade search
BRAVE_API_KEY=BSA-xxxxx         # Additional search provider
POLLINATIONS_API_KEY=your-key   # Authenticated image route; kept server-side

# Self-hosting only: enable this solely behind a trusted proxy that overwrites
# X-Forwarded-For / X-Real-IP. It affects best-effort rate-limit identity.
N0X_TRUST_PROXY_HEADERS=1
```

---

## Project structure

```text
app/                  Next.js routes, metadata, and API routes
components/brand/     N0X identity marks and brand primitives
components/chat/      Chat workbench UI, messages, panels, and sharing
components/layout/    Shell and navigation components
components/system/    PWA, onboarding, storage, skeletons, and boundaries
lib/chat/             Chat orchestration, routing, and conversation state
lib/core/             Analytics and logging utilities
lib/media/            Speech, TTS, and interaction sound hooks
lib/memory/           Persistent semantic memory
lib/providers/        WebGPU, Chrome AI, Ollama, and cloud providers
lib/retrieval/        RAG, deep search, and document workers
lib/runtime/          Agent loop and isolated Pyodide runtime hooks
public/brand/         Launch and marketplace brand assets
public/screenshots/   Current product screenshots
```

---

## Provider support

Four backends. You can switch mid-conversation without replacing chat history.

| Provider             | Execution and data path                                                                     | Setup                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Browser (WebGPU)** | Inference runs in this browser after model assets download                                  | Pick a model; weights download on first use                                                |
| **Ollama**           | Prompts and enabled context go to its URL; loopback is local, remote URLs are network paths | Start Ollama, choose a model, and allow browser CORS                                       |
| **Cloud API**        | Prompts and enabled context go to the OpenAI-compatible endpoint you configure              | Paste a trusted endpoint, key, and model                                                   |
| **Chrome AI**        | Prompt API inference is on-device when Gemini Nano is ready                                 | Availability probe is passive; explicit selection/install can start Chrome's model install |

When enabled and both paths are available, **auto-routing** classifies each message and can send more complex queries—and their enabled document, memory, or search context—to the configured cloud provider. Leave auto-routing off for a strictly selected-provider workflow.

---

## Models

The selector exposes a static list of 21 MLC-compiled model IDs curated against the installed WebLLM app config. They are quantized and cached after the first download, but host availability and device compatibility can still change.

| Tier                   | Curated models                                                            | Approx. download |
| ---------------------- | ------------------------------------------------------------------------- | ---------------- |
| ⚡ **Tiny (4)**        | SmolLM2 360M/1.7B · Qwen 2.5 0.5B · TinyLlama 1.1B                        | 360MB–900MB      |
| ⚖️ **Balanced (6)**    | Llama 3.2 1B/3B · Qwen 2.5 1.5B · Gemma 2 2B · Phi-3 Mini · Phi-3.5 Mini  | 700MB–2.2GB      |
| 🚀 **Powerful (6)**    | Qwen 2.5 3B/7B · Mistral 7B · Llama 3.1 8B · Gemma 2 9B · Hermes 2 Pro 8B | 2GB–5.5GB        |
| 🧠 **Reasoning (2)**   | DeepSeek R1 Distill Qwen 7B · DeepSeek R1 Distill Llama 8B                | 4.5GB–4.8GB      |
| 💻 **Code & math (3)** | Qwen 2.5 Coder 1.5B/7B · Qwen 2.5 Math 1.5B                               | 1GB–4GB          |

**Suggested desktop starting point:** Qwen 2.5 1.5B (~1GB). Mobile and low-memory devices are capped toward SmolLM2 360M; actual compatibility and speed depend on the GPU and browser.

---

## Features in depth

<details>
<summary><strong>🤖 Agent mode — ReAct loop with live tool use</strong></summary>

The LLM plans, calls tools, observes results, and repeats — you watch every step in real time.

**Tools available:**

- Multi-engine web search when Deep Search is enabled for the request
- Hybrid document RAG (Vector + BM25 + MMR)
- Python execution only when the Python toggle is enabled and its worker is ready; every autonomous call shows the complete code for fresh approval
- Persistent memory read/write when Memory is enabled (IndexedDB)

Image generation uses its own explicit network request path rather than being invoked implicitly by the agent loop.

**Reliability features:**

- Multi-strategy JSON parser — handles malformed tool calls
- Loop detection — stops if the same tool is called 3× with the same args
- Per-tool timeout (45s)
- Stop/abort propagation to running tools; Python cancellation terminates its worker
- Provider-aware context budget management
- Max 12 iterations per run

</details>

<details>
<summary><strong>📄 Document Q&A — hybrid local RAG</strong></summary>

Attach a supported document, then ask a question. Retrieved evidence is labeled with stable, exact tags such as `[filename.pdf#chunk-2]`; when the relevance gate finds no adequate passage, the prompt explicitly tells the model not to invent a document citation.

**Pipeline:**

1. Local text extraction for PDF, DOCX, and text-based formats; PDF.js uses a bundled worker
2. Small direct documents are deterministically chunked and ranked with BM25 without loading the embedding stack
3. Larger documents use sentence-boundary-aware chunks and MiniLM-L6 embeddings in a Web Worker
4. **Voy** vector and **BM25** keyword rankings are combined with Reciprocal Rank Fusion
5. MMR reranks the fused candidates for relevance and diversity
6. Vector records are keyed by a local SHA-256 hash of the file bytes in IndexedDB; identical bytes deduplicate even if renamed
7. Removing or clearing documents waits for the IndexedDB deletion to commit before the UI reports success

**Formats:** PDF · DOCX · TXT · MD · CSV · HTML · JSON · XML · YAML · TOML · INI · CFG · CONF · LOG · RST · TEX

**Limits:** 25MB per file, 32MB expanded DOCX content, 750,000 extracted characters, and the first 100 pages of a PDF. Corrupt or unsupported binary files are rejected rather than attached as text placeholders. Scanned pages and diagrams are not OCR or vision input.

</details>

<details>
<summary><strong>🔍 Deep Search — multi-engine, parallel, cited</strong></summary>

Toggle "Deep Search" and get synthesized answers with source cards, not a wall of text.

**Sources (used according to availability and query type):**

- 🔍 SearXNG — privacy-respecting, self-hosted pool
- 🦆 DuckDuckGo — instant answers
- 📖 Wikipedia — authoritative
- 🦁 Brave Search — optional API key
- 🔬 Tavily — optional API key, research-grade
- 📄 Jina Reader — conditional page extraction when snippets are thin

**Output:** Perplexity-style source cards with favicons, progress bar, expandable full content. No raw dumps.

</details>

<details>
<summary><strong>🐍 Python runtime — Pyodide WASM</strong></summary>

CPython runs in WebAssembly inside a dedicated Web Worker that can be terminated on stop, abort, or timeout. The worker blocks app storage globals and arbitrary network transports. Its only permitted egress is credential-free `GET` access to the pinned Pyodide 0.26.4 runtime/package asset path on jsDelivr.

- Output feeds back into the conversation automatically
- Manual code runs only after you click Run; a failed manual run can be sent back to the model for a repair attempt
- Every autonomous agent Python call displays the complete code and requires fresh approval
- Imports can load only packages shipped on the pinned Pyodide asset path; arbitrary PyPI/package URLs are blocked
- This is a browser isolation boundary, not a hardened sandbox for hostile code; CPU or memory exhaustion can still affect the worker or tab

</details>

<details>
<summary><strong>🧠 Persistent memory</strong></summary>

When Memory is enabled, successful exchanges can be summarized into IndexedDB and relevant saved memories can be added to later prompts. When it is disabled, N0X neither automatically saves nor retrieves semantic memories; existing entries remain stored until you delete them.

- Hybrid retrieval: TF-IDF weighted n-grams + vector similarity
- Tags: `chat` · `search` · `rag` · `cloud` · `local`
- Toggle memory saving and retrieval together per session
- Storage managed via built-in Storage Manager

</details>

<details>
<summary><strong>🎨 Image generation</strong></summary>

Say "generate an image of..." to use the explicit image network route.

- With no server key, the route returns a client-loadable free Pollinations URL.
- With `POLLINATIONS_API_KEY`, the server tries authenticated Pollinations models, then AI Horde if those attempts fail.
- If configured providers fail, the final fallback is the free Pollinations URL; generation can still fail or be rate-limited.

Image prompts leave the device and are subject to third-party terms and availability.

</details>

<details>
<summary><strong>🎤 Voice — STT + TTS</strong></summary>

N0X uses the browser Web Speech APIs. Speech recognition and some voices may use an online browser or operating-system service; offline operation is not guaranteed.

- Mic button → speak → transcript fills the composer for review and sending
- TTS toggle → responses read aloud
- Interrupt mid-speech

</details>

<details>
<summary><strong>🌳 Conversation branching</strong></summary>

Click any message → Branch → create an alternate timeline from that point. Both branches persist in the sidebar independently.

</details>

---

## Architecture

```
                          ┌──────────────────────┐
                          │    Provider Layer     │
                          │ WebGPU · Ollama ·     │
                          │ Cloud · Chrome AI     │
                          └─────────┬────────────┘
                                    │
┌──────────┐   ┌────────────┐  ┌───▼─────┐
│  Input   │──▶│ Auto-Router│─▶│  LLM    │
│  + Files │   │ complexity │  │ Stream  │
└──────────┘   │ classifier │  └───┬─────┘
               └────────────┘      │
                               ┌───▼──────────────────────┐
                               │  Agent (ReAct Loop)       │
                               │  think → act → observe    │
                               │                           │
                               │  Tools:                   │
                               │  ├─ Web Search (5 engines)│
                               │  ├─ Hybrid RAG (Vec+BM25) │
                               │  ├─ Python (Pyodide WASM) │
                               │  └─ Memory (IndexedDB)    │
                               └───────────────────────────┘

  Explicit image request → /api/image-gen → Pollinations / optional AI Horde

  RAG pipeline:
  small/direct → stable chunks → BM25 ───────────────┐
  large/indexed → MiniLM → Voy + BM25 → RRF → MMR ─┴→ cited context
```

Local by default. Search, image and cloud paths are explicit. Other network-dependent paths are first-time model/embedding downloads, an explicitly started Chrome AI model install, Pyodide and package downloads, remote Ollama servers, optional page-view/funnel telemetry, and browser speech implementations that use an online service.

---

## Performance and storage

Inference speed and usable model size depend on the model, GPU, drivers, browser, available memory, thermals, and prompt length. Mobile devices are treated as low-memory and should start with the smallest model.

Model weights and larger-document RAG vectors are cached for reuse. RAG vector records use the SHA-256 content ID, not file metadata; reattaching the same bytes can reuse them. Attachments themselves are not restored after reload. Browsers can evict either cache under storage pressure, and clearing site data or the corresponding Storage Manager entry removes it. N0X service-worker upgrades remove only old app-shell caches and preserve separately named WebLLM model caches.

---

## Privacy

**Local by default. Search, image and cloud paths are explicit.**

| What                       | Where it goes                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| Local prompts & responses  | Conversation history and cited-evidence snapshots in origin-scoped IndexedDB                 |
| Uploaded documents         | Original file stays local for indexing; relevant excerpts enter the selected provider prompt |
| Larger-document RAG cache  | Local SHA-256 content ID; cached chunks/vectors use origin-scoped IndexedDB                  |
| Enabled semantic memory    | Origin-scoped IndexedDB; automatic saving and retrieval stop when disabled                   |
| Model and embedding assets | Downloaded from their hosts, then reused from browser-managed caches                         |
| Search queries             | N0X API route, then search/extraction providers; every agent-authored query needs approval   |
| Image prompts              | N0X API route, then Pollinations and, on the configured path, AI Horde                       |
| Ollama prompts             | Configured URL; loopback is local, while a remote host receives enabled prompt context       |
| Cloud API prompts          | The OpenAI-compatible endpoint you configure                                                 |
| Voice input/output         | Browser Web Speech implementation; it may use an online vendor service                       |
| External Markdown images   | Blocked until you choose Load once; approval contacts that image host                        |
| Pyodide assets/packages    | Pinned jsDelivr path only; arbitrary Python network egress is blocked                        |
| Opt-in telemetry           | No analytics before Allow; then sanitized Vercel page views and N0X funnel events            |

After dependencies are cached, local chat and document retrieval can work without enabling search, images, cloud, or telemetry. That is not an air-gap guarantee: uncached assets, pinned Pyodide packages, remote Ollama, approved external images, and some browser speech implementations still use the network.

On first visit, a non-modal banner offers **No thanks** or **Allow analytics**. Neither the Vercel Analytics component nor N0X funnel events run before Allow; the choice is stored locally and can be changed on the Privacy page.

Full details: [Privacy Policy](https://n0xth.vercel.app/privacy) · [Security](https://n0xth.vercel.app/security) · [Known Limitations](https://n0xth.vercel.app/known-limitations)

---

## Stack

| Layer          | Tech                                                             |
| -------------- | ---------------------------------------------------------------- |
| Framework      | Next.js 15 · React 18 · TypeScript                               |
| Styling        | Tailwind CSS                                                     |
| LLM runtime    | WebLLM (WebGPU) · Chrome Prompt API · Ollama · OpenAI-compatible |
| Embeddings     | Transformers.js · MiniLM-L6 (Web Worker)                         |
| Vector search  | Voy                                                              |
| Keyword search | BM25 (custom implementation)                                     |
| Python         | Pyodide WASM                                                     |
| Storage        | IndexedDB · Cache API · localStorage · sessionStorage            |
| Search         | SearXNG · DuckDuckGo · Wikipedia · Brave · Tavily · Jina Reader  |
| Image gen      | Pollinations · AI Horde                                          |
| CI             | GitHub Actions · ESLint · Prettier · TypeScript                  |

---

## Roadmap

Planned and in progress:

- [ ] 🎤 Whisper.cpp voice (offline, wake word)
- [ ] 🖼️ Multimodal RAG (OCR + image understanding)
- [ ] 🕸️ Knowledge graph (entity/relationship extraction)
- [ ] 🤖 Custom agents (user-defined, shareable)
- [ ] 📱 Full mobile PWA (offline, native features)
- [ ] 🔌 Plugin system (GitHub · Notion · Slack)
- [ ] 🎥 Video understanding (upload + Q&A)
- [ ] 🌐 WebRTC collaboration (shared sessions)

[Discuss and vote on features →](https://github.com/ixchio/n0x/discussions)

---

## Contributing

Issues, PRs, and ideas are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

**Quick flow:**

```bash
# 1. Fork + clone
git clone https://github.com/YOUR_USERNAME/n0x.git && cd n0x

# 2. Install
npm install

# 3. Branch
git checkout -b fix/your-thing

# 4. Dev
npm run dev

# 5. Verify
npm run lint && npm run typecheck && npm test && npm run format:check && npm run build

# 6. PR
git push origin fix/your-thing
```

**Found a bug?** [Open an issue](https://github.com/ixchio/n0x/issues) — browser console errors and OS/browser version are super helpful.

---

## Credits

Built by [ixchio](https://github.com/ixchio).

Powered by amazing open-source work:

- [MLC-LLM / WebLLM](https://github.com/mlc-ai/web-llm) — WebGPU inference engine
- [Transformers.js](https://github.com/xenova/transformers.js) — in-browser embeddings
- [Pyodide](https://github.com/pyodide/pyodide) — CPython compiled to WASM
- [Voy](https://github.com/tantaraio/voy) — WASM vector search
- [PDF.js](https://github.com/mozilla/pdf.js) — PDF parsing

---

## License

MIT © [ixchio](https://github.com/ixchio)

---

<div align="center">
  <strong>Free. Local-first. Explicit about network paths.</strong>
  <br />
  No sign-up. Local chat needs no API key. Telemetry is opt-in.
  <br /><br />
  <a href="https://n0xth.vercel.app"><strong>Try n0x →</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/ixchio/n0x/issues">Report a bug</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/ixchio/n0x/discussions">Request a feature</a>
</div>
