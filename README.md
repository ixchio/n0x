<div align="center">
  <img src="https://raw.githubusercontent.com/ixchio/n0x/main/public/icon.png" width="72" alt="n0x" style="border-radius:20%" />
  <h1>n0x</h1>
  <p><strong>The full AI stack, in one browser tab.</strong></p>
  <p>
    <a href="https://n0xth.vercel.app"><strong>Try it →</strong></a>&nbsp;&nbsp;
    <a href="#whats-new">What's New</a>&nbsp;&nbsp;
    <a href="#how-it-works">How it works</a>&nbsp;&nbsp;
    <a href="#run-it-yourself">Run locally</a>
  </p>
  <br />
  <a href="https://www.producthunt.com/products/n0x?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-n0x" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1162703&theme=dark&t=1780509567546" alt="N0X on Product Hunt" width="250" height="54" /></a>
</div>

<br />

<img width="1657" height="923" alt="n0x" src="https://github.com/user-attachments/assets/ba7d17e8-b26f-4cf7-a072-cf39cfb37ab4" />

---

## What's New (v2.0)

**n0x has been hardened for a cleaner public release.** The current focus is build reliability, API rate limiting, safer dependency versions, better first-run onboarding, and clearer privacy/security documentation.

### Highlights:

- **Hybrid web search** - SearXNG, DuckDuckGo, and Wikipedia by default; optional Brave and Tavily keys for stronger coverage
- **Local document RAG** - vector + BM25 retrieval, RRF fusion, MMR reranking, versioned cache, and fallback extraction
- **Provider routing** - browser, Chrome AI, Ollama, and OpenAI-compatible cloud endpoints in one UI
- **Production guardrails** - CI, lint/typecheck/build scripts, server-side rate limits, and opt-in funnel telemetry
- **Clear limitations** - privacy, security, compatibility, and known-limitation pages document the tradeoffs

[See full changelog →](docs/FIXES_APPLIED.md)

---

n0x runs **LLMs, autonomous agents, document Q&A, Python runtime, image generation, and web search** in one browser tab. No server. No account. No API keys required. Open a tab, pick a model, start working.

The default path is **fully local** — your prompts, files, and model weights never leave your machine. WebGPU handles inference at 35–80 tok/s on a normal laptop GPU. But if you want more power, flip to Ollama or plug in a cloud API (Groq, OpenRouter, any OpenAI-compatible endpoint) and you're running the same tool stack against bigger models.

---

## Why this exists

Every AI tool I tried either wanted my data, wanted my money, or both. I wanted something I could open in a browser and just use — no Docker, no Python venv, no sign-up wall, no "you've hit your free tier limit."

So I built n0x. It's an actual AI workstation, not a chatbot wrapper.

---

## What you get

### 🤖 **Pick your backend.** Four providers, one interface:

| Provider             | What runs                                                 | Setup                          | Speed       |
| -------------------- | --------------------------------------------------------- | ------------------------------ | ----------- |
| **Browser (WebGPU)** | 50+ open-source models, 360MB→70B, on your GPU via WebLLM | Zero. Just pick a model.       | 10-80 t/s   |
| **Ollama**           | Any model from your local Ollama server                   | `ollama serve` — auto-detected | Varies      |
| **Cloud API**        | Groq, OpenRouter, any OpenAI-compatible endpoint          | Paste key + base URL           | 100-500 t/s |
| **Chrome AI**        | Built-in Gemini Nano (experimental)                       | Chrome 127+ with flags         | 20-40 t/s   |

Switch between them mid-conversation. Your chat history stays. **Auto-routing** can switch automatically based on query complexity.

---

### 🤖 **Agent mode.** A ReAct reasoning loop that actually works.

The LLM chains tool calls autonomously — web search, document lookup, Python execution, memory recall — and you watch it think in real time, token by token.

**What's new:**

- ✅ Handles malformed JSON gracefully (multi-strategy parser)
- ✅ Loop detection (stops if calling same tool 3x)
- ✅ Context window budgeting (prevents OOM)
- ✅ Per-tool execution timeouts (30s max)
- ✅ Cumulative token tracking
- ✅ Streaming thought process (shows reasoning as it happens)

The trace UI shows every step with timing, tool args, and observations.

---

### Document Q&A. Local-first hybrid RAG.

Drop a PDF, DOCX, TXT, CSV, HTML, or Markdown file into the chat. n0x:

**Processing:**

- ✅ Extracts text with a fallback chain
- ✅ Chunks with **sentence-boundary awareness** (50% overlap)
- ✅ Embeds with MiniLM-L6 in a **Web Worker** (UI stays responsive)
- ✅ Indexes with **Voy vector search** + **BM25 keyword search**
- ✅ Re-ranks with **MMR** (Maximum Marginal Relevance) for diverse results
- ✅ **Caches vectors** in IndexedDB (instant re-upload)

**What's new:**

- ✅ **Versioned cache system** - old caches auto-invalidate
- ✅ **Type-safe chunk storage** - validates all cached data
- ✅ **100-page PDF limit** - prevents OOM on huge documents
- ✅ **Binary file handling** - shows helpful message instead of crashing
- ✅ **Fallback extraction** - works even if worker crashes
- ✅ **Text sanitization** - removes null bytes and control chars
- ✅ **Hybrid search** - vector + BM25 fused with RRF (Reciprocal Rank Fusion)

**Supported formats:** PDF (via PDF.js), DOCX (native WASM decompression), TXT, Markdown, CSV (formatted table), HTML (tags stripped)

---

### Web search. Multi-source search with citations.

Type your query, toggle "Deep Search", and get search context and citations.

**Multi-Engine Parallel Search:**

- 🔍 **SearXNG** (free, privacy-respecting)
- 🦆 **DuckDuckGo** (instant answers)
- 📖 **Wikipedia** (authoritative content)
- 🦁 **Brave Search** (optional API key, excellent quality)
- 🔬 **Tavily** (optional API key, research-grade)

**What's new:**

- ✅ **5 engines in parallel** (all run simultaneously, fastest wins)
- ✅ **Answer synthesis** - returns direct answer from top sources
- ✅ **Deep content extraction** - Jina Reader fetches full page content (2000 chars)
- ✅ **Source citations** - URLs + excerpts
- ✅ **Priority fallback** - Tavily → Brave → SearXNG → Wikipedia → DDG
- ✅ **Graceful failure** - returns useful errors when providers are down

**No API keys required.** Tavily/Brave are optional upgrades for better results.

---

### 🐍 **Python runtime.** Pyodide WASM sandbox.

Code output feeds back into the conversation. If execution fails, the error goes to the LLM automatically for a fix.

**What's new:**

- ✅ **Better error handling** - shows package install failures clearly
- ✅ **Auto-load packages** - `import numpy` just works
- ✅ **Self-healing** - failed code triggers automatic retry
- ✅ **Helpful errors** - suggests using `micropip` for manual installs

---

### 🎨 **Image generation.** Multiple engines, free tier.

Type "generate an image of..." and choose your engine:

- **Pollinations** (Flux, z-image-turbo, klein, qwen-image) - Free, fast
- **AI Horde** (Stable Diffusion) - Community-powered, queue-based

**What's new:**

- ✅ **Smart fallback** - tries Pollinations → free tier → Horde
- ✅ **Better error messages** - shows provider status
- ✅ **Retry logic** - auto-retries on transient failures

---

### 🧠 **Memory.** Persistent, searchable knowledge.

The agent stores and recalls facts across sessions.

**How it works:**

- ✅ **Hybrid embeddings** - unigrams + bigrams + trigrams with TF-IDF weighting
- ✅ **Vector + keyword search** - finds semantically similar + exact matches
- ✅ **Auto-save** - saves meaningful exchanges (when memory toggle is ON)
- ✅ **Tags** - auto-tags with context (chat, search, rag, cloud, local)
- ✅ **IndexedDB storage** - persists across sessions

**What's new:**

- ✅ **Respects toggle** - only saves when memory is enabled
- ✅ **Better similarity** - 1024-dim vectors vs 512-dim (less collision)
- ✅ **Proper cleanup** - no more IndexedDB handle leaks

---

### 💾 **Storage Manager.** Clear data without leaving the app.

Browsers limit IndexedDB storage (usually 2GB). Built-in Storage Manager lets you clear:

- Chat history
- Semantic memory
- RAG vector cache
- Model weights (WebLLM cache)

**What's new:**

- ✅ **Blocked state handling** - warns if another tab has DB open
- ✅ **Confirmation flow** - prevents accidental deletion
- ✅ **Page reload after clear** - ensures clean state

---

### 🎤 **Voice.** Speech-to-text and text-to-speech.

Web Speech API integration. Works offline.

- Press microphone → speak → auto-submit
- Toggle TTS → responses read aloud
- Interrupt mid-speech

---

### 🌳 **Branching.** Fork conversations.

Click any message → "Branch" → create alternate timeline. Both branches persist in the sidebar.

---

### 🎭 **Personas.** Five system prompts.

- **Default** - Balanced, helpful assistant
- **Senior Engineer** - Code reviews, architecture, best practices
- **Writer** - Creative, storytelling, editing
- **Tutor** - Teaching, explanations, exercises
- **Analyst** - Data analysis, insights, visualization

Each with their own tone, formatting rules, and domain focus.

---

## How it works

```
                              ┌─────────────────────┐
                              │    Provider Layer    │
                              │  WebGPU · Ollama ·   │
                              │  Cloud · Chrome AI   │
                              └────────┬────────────┘
                                       │
┌──────────┐     ┌───────────┐    ┌────▼────┐
│  User     │────▶  Router    │───▶│  LLM    │
│  Input    │     │           │    │ Stream  │
└──────────┘     │ Auto-Route │    └────┬────┘
                 │ direct /   │         │
                 │ agent /    │    ┌────▼─────────────────────┐
                 │ image      │    │  Agent (ReAct Loop)       │
                 └───────────┘    │  thought → action →       │
                                  │  observation → repeat     │
                                  │                           │
                                  │  Tools:                   │
                                  │   ├ Multi-Engine Search   │
                                  │   │  (5 parallel engines) │
                                  │   ├ Hybrid RAG            │
                                  │   │  (Vector+BM25+MMR)    │
                                  │   ├ Python (Pyodide)      │
                                  │   ├ Memory (IndexedDB)    │
                                  │   └ Image Gen (Multi)     │
                                  └───────────────────────────┘
```

**What's new:**

- ✅ **Auto-routing** - routes BEFORE context gathering (faster, cheaper)
- ✅ **Retry logic** - 2 retries with exponential backoff on failures
- ✅ **Graceful degradation** - context fails → continues without context
- ✅ **Resource cleanup** - proper IndexedDB/AbortController lifecycle

Everything above the line runs in the browser. The only network calls are optional: search queries, image prompts, cloud API calls. Disable them and you have a fully air-gapped AI workstation.

---

## Models

50+ models. MLC-compiled, quantized, cached in browser storage after first download. Real inference, not API calls.

| Category         | Examples                                                     | Size        | Speed     | Use Case                      |
| ---------------- | ------------------------------------------------------------ | ----------- | --------- | ----------------------------- |
| **⚡ Tiny**      | SmolLM2 360M, Qwen 0.5B, TinyLlama 1.1B                      | 360MB–900MB | 60-80 t/s | Any device, instant responses |
| **⚖️ Balanced**  | Qwen 2.5 1.5B _(default)_, Phi-3.5, Llama 3.2 3B, Gemma 2 2B | 700MB–2.2GB | 35–50 t/s | Best quality/speed balance    |
| **🚀 Powerful**  | Mistral 7B, Qwen 2.5 7B, Llama 3.1 8B, Gemma 2 9B, Qwen 14B  | 4–10GB      | 15–25 t/s | High quality, needs VRAM      |
| **🧠 Reasoning** | DeepSeek R1 distills (1.5B, 7B, 14B, 32B, 70B)               | 1GB–30GB    | 10–20 t/s | Chain-of-thought reasoning    |
| **💻 Code**      | Qwen Coder 1.5B/7B/32B, DeepSeek Coder, Qwen Math            | 800MB–20GB  | Varies    | Code generation, debugging    |
| **🔥 Flagship**  | Qwen 2.5 32B, Llama 3.3 70B, R1 Llama 70B                    | 10–30GB     | 8–15 t/s  | Near GPT-4 quality            |

**Start with Qwen 2.5 1.5B** (~1GB). It loads in seconds on a warm cache and handles most tasks well. Scale up from there.

---

## Run it yourself

Chrome or Edge (WebGPU required). Node 18+.

```bash
git clone https://github.com/ixchio/n0x.git
cd n0x
npm install
npm run dev
```

Open `localhost:3000`. First launch downloads the default model (~1GB) — after that it loads from cache instantly.

### Optional env vars

```env
# Better search (optional - everything works without these)
TAVILY_API_KEY=tvly-xxxxx        # Research-grade search results
BRAVE_API_KEY=BSA-xxxxx          # Excellent search quality

# Image generation (optional)
POLLINATIONS_API_KEY=xxxxx       # Higher rate limits, no watermarks
```

**All are optional.** n0x works 100% free with no API keys.

---

## Performance

### Local (WebGPU)

- **Qwen 2.5 1.5B:** 40-50 t/s, 1GB, good quality
- **Qwen 2.5 7B:** 15-25 t/s, 4GB, excellent quality
- **Llama 3.3 70B:** 8-12 t/s, 30GB, near GPT-4 quality

### Cloud (Groq - Free Tier)

- **Llama 3.3 70B:** 200-300 t/s, GPT-4 level
- **Mixtral 8x7B:** 300-400 t/s, very capable
- **Llama 3.1 8B:** 500+ t/s

### RAG Performance

- **Indexing:** ~1s per 100 pages
- **Re-upload:** Instant (cached)
- **Search:** <100ms
- **Cache size:** ~500KB per document

### Web Search

- **Total time:** 2-5s
- **Parallel engines:** All run simultaneously
- **Fastest wins:** Returns as soon as best result arrives

---

## Privacy

Your prompts, documents, and model weights stay in your browser. Period.

**What leaves your machine:**

- **Search queries** → DuckDuckGo/SearXNG/Wikipedia (if you use search)
- **Image prompts** → Pollinations API (if you generate images)
- **Cloud API calls** → Your chosen provider (if you use cloud mode)

**Turn off search + images + cloud = 100% air-gapped.** No metadata, no telemetry, nothing.

**What's stored locally:**

- Chat history (IndexedDB)
- Memory (IndexedDB)
- RAG vectors (IndexedDB)
- Model weights (Cache API)

**Total storage:** 0.5-30GB depending on models/documents. Clear anytime via Storage Manager.

---

## Stack

**Frontend:** Next.js 14 · React 18 · TypeScript · Tailwind CSS · Framer Motion
**AI/ML:** WebLLM (WebGPU) · Transformers.js · Voy · MiniLM-L6
**Runtime:** Pyodide (Python WASM)
**Storage:** IndexedDB · Zustand
**Search:** Tavily · Brave · SearXNG · DuckDuckGo · Wikipedia · Jina Reader
**Image:** Pollinations · AI Horde

---

## Roadmap

See [ROADMAP.md](docs/ROADMAP.md) for 30+ planned features including:

- 🎤 Voice interface upgrade (Whisper.cpp, wake word)
- 🖼️ Multi-modal RAG (OCR, image understanding)
- 🕸️ Knowledge graph RAG (entity/relationship extraction)
- 🤖 Custom agents (user-created, shareable)
- 📱 Mobile PWA (offline support, native features)
- 🔌 Plugin system (GitHub, Notion, Slack integrations)
- 🎥 Video understanding (upload videos, ask questions)

[Vote on features →](https://github.com/ixchio/n0x/discussions)

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

**Quick start:**

1. Fork the repo
2. Create a branch: `git checkout -b feature/amazing-feature`
3. Make changes
4. Test thoroughly (see [TESTING_GUIDE.md](docs/TESTING_GUIDE.md))
5. Submit PR

**Bug reports:** [Open an issue](https://github.com/ixchio/n0x/issues) with:

- What you did
- What happened
- Browser console errors
- Browser/OS version

---

## Credits

Built by [ixchio](https://github.com/ixchio) with contributions from the community.

**Powered by:**

- [MLC-LLM](https://github.com/mlc-ai/web-llm) - WebGPU inference
- [Transformers.js](https://github.com/xenova/transformers.js) - Embeddings
- [Pyodide](https://github.com/pyodide/pyodide) - Python in WASM
- [Voy](https://github.com/tantaraio/voy) - Vector search
- [PDF.js](https://github.com/mozilla/pdf.js) - PDF parsing

---

## Screenshots

<img width="1909" height="918" alt="Chat interface" src="https://github.com/user-attachments/assets/db3d0c98-f56b-4464-b8ab-fe0836fc2dfe" />
<img width="1920" height="1074" alt="Document Q&A" src="https://github.com/user-attachments/assets/bb812ae6-2f06-4e7b-b93a-0715c52699de" />
<img width="1657" height="923" alt="Web Search" src="https://github.com/user-attachments/assets/dad81977-dd49-4d48-84b4-fd655825e3c2" />
<img width="1920" height="913" alt="Agent trace" src="https://github.com/user-attachments/assets/2fb8a22e-e96b-4497-8bd2-3cb5ea88a758" />
<img width="1920" height="913" alt="Model picker" src="https://github.com/user-attachments/assets/99f66f62-b9d6-4374-92e4-3920ba60aaf4" />

---

## License

MIT © [ixchio](https://github.com/ixchio)

---

<div align="center">
  <p><strong>Free. Local. Private. Powerful.</strong></p>
  <p>No sign-up. No API keys. No data collection.</p>
  <p><a href="https://n0xth.vercel.app">Try n0x →</a></p>
</div>
