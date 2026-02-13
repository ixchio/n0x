<p align="center">
  <code>>_ n0x</code>
</p>

<h3 align="center">the full AI stack. one browser tab. zero backend.</h3>

<p align="center">
  LLM chat · deep search · RAG · code sandbox · image gen · memory · TTS<br/>
  everything runs locally via WebGPU. your data never leaves your machine.
</p>

<p align="center">
  <a href="#quick-start">quick start</a> ·
  <a href="#features">features</a> ·
  <a href="#architecture">architecture</a> ·
  <a href="#deploy">deploy</a>
</p>

---

## why

every AI tool wants you to sign up, hand over your data, and pay monthly. most of the time you just want to ask a question, search something, or run a snippet.

n0x runs the entire stack in your browser. no accounts, no API keys, no server processing your conversations. open a tab, pick a model, go.

the tradeoff is obvious — browser-local models are smaller than GPT-4. but for 90% of daily tasks (writing, code help, quick research, document Q&A), a 1-3B param model running at 30+ tok/s on your GPU is more than enough. and it's instant, private, and free.

---

## quick start

```bash
git clone https://github.com/ixchio/n0x && cd n0x
npm i && npm run dev
```

open `localhost:3000`. pick a model. start chatting.

**needs:** chromium 113+ (WebGPU support). 4GB RAM minimum, 8GB+ recommended.

---

## features

**local LLM inference** — models run directly in the browser via WebGPU (MLC/WebLLM). downloaded once, cached forever. supports SmolLM, Qwen 2.5, Phi 3.5, Llama 3.2, and more across fast/balanced/powerful/coding tiers.

**deep search** — toggle-on web search. queries go out, results come back, LLM synthesizes an answer with citations. works with Tavily (better) or DuckDuckGo (free, no key needed). the only feature that makes external calls.

**RAG** — drag PDFs, text files, or markdown into the chat. n0x chunks them, embeds locally with `all-MiniLM-L6-v2`, indexes with Voy vector search, and injects relevant context into prompts. all client-side.

**code sandbox** — Python runs via Pyodide (CPython compiled to WASM). HTML/CSS/JS previews in a sandboxed iframe. the run button is smart — it parses imports and only appears when the code can actually execute in-browser. no `pygame` run buttons.

**image generation** — type "generate image of..." and it hits Pollinations.ai → Stable Horde as fallback. shows progress, supports download and zoom.

**memory** — persistent facts stored in IndexedDB. "remember that I prefer TypeScript" sticks across sessions. relevant memories auto-inject via cosine similarity.

**personas** — built-in system prompts (coder, writer, tutor, analyst) plus custom persona creation. shapes how the AI responds.

**conversation history** — IndexedDB persistence. multiple conversations, survives refreshes and restarts.

**TTS** — browser-native Web Speech API. toggle in header. zero external calls.

**PWA** — installable, works offline after first visit. service worker caches the shell and static assets.

**share** — platform-optimized sharing to X, LinkedIn, Reddit, HN. generates a branded screenshot card of your conversation for social posts.

---

## architecture

```
browser (all local, no server needed)
├── WebLLM          → LLM inference via WebGPU
├── transformers.js → embedding generation for RAG
├── Voy (WASM)      → vector similarity search
├── Pyodide (WASM)  → Python runtime
├── IndexedDB       → chat history + memory persistence
├── localStorage    → persona config
├── Web Speech API  → text-to-speech
└── Service Worker  → offline caching / PWA

server (Next.js API routes — optional, only for features that need CORS proxying)
├── /api/deep-search → Tavily or DuckDuckGo
└── /api/image-gen   → Pollinations.ai + Stable Horde fallback
```

when deep search and image gen are disabled, **zero external requests** are made. the server routes exist purely because those APIs don't support browser CORS — no user data is stored or logged server-side.

---

## what runs where

| feature | runs in | external? |
|---------|---------|-----------|
| LLM chat | browser (WebGPU) | no |
| RAG / doc search | browser (WASM) | no |
| Python sandbox | browser (Pyodide) | no |
| memory | browser (IndexedDB) | no |
| TTS | browser (Web Speech) | no |
| persona system | browser (localStorage) | no |
| chat persistence | browser (IndexedDB) | no |
| deep search | server route | yes (Tavily/DDG) |
| image gen | server route | yes (Pollinations/Horde) |

---

## models

| tier | model | size | notes |
|------|-------|------|-------|
| fast | SmolLM2 360M | ~250MB | instant responses, basic tasks |
| fast | Qwen2.5 0.5B | ~400MB | good balance for quick Q&A |
| balanced | Qwen2.5 1.5B | ~1GB | sweet spot for most use |
| balanced | Phi 3.5 Mini | ~2GB | strong reasoning |
| powerful | Llama 3.2 3B | ~2GB | best overall quality |
| powerful | Qwen2.5 3B | ~2GB | multilingual |
| coding | Qwen2.5 Coder 1.5B | ~1GB | code-focused |
| coding | Qwen2.5 Coder 7B | ~4GB | serious code tasks |

models are downloaded once from the MLC model hub and cached in the browser. subsequent visits load from cache.

---

## setup

### basic (no API keys)

works immediately for: chat, RAG, code sandbox, memory, personas, TTS, conversation history.

### Tavily key (optional, improves deep search)

```bash
# .env.local
TAVILY_API_KEY=tvly-dev-your-key
```

get one free at [app.tavily.com](https://app.tavily.com). without it, deep search falls back to DuckDuckGo + Wikipedia — still works, just less thorough.

---

## deploy

```bash
# vercel (recommended)
npx vercel

# docker
docker build -t n0x . && docker run -p 3000:3000 n0x

# self-host
npm run build && npm start
```

---

## stack

Next.js 14 · TypeScript · Tailwind CSS · WebLLM (MLC AI) · transformers.js · Voy · Pyodide · pdf.js · Zustand · Radix UI · cmdk · Lucide

---

## license

MIT

---

built by [@ixchio](https://github.com/ixchio)
