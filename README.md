<div align="center">
  <img src="https://raw.githubusercontent.com/ixchio/n0x/main/public/icon.png" width="72" alt="n0x" style="border-radius:20%" />
  <h1>n0x</h1>
  <p><strong>Run the full AI stack in a browser tab.</strong></p>
  <p>
    <a href="https://n0x.vercel.app"><strong>Try it →</strong></a>&nbsp;&nbsp;
    <a href="#how-it-works">How it works</a>&nbsp;&nbsp;
    <a href="#run-it-yourself">Run locally</a>
  </p>
</div>

<br />

<img width="1657" height="923" alt="n0x" src="https://github.com/user-attachments/assets/ba7d17e8-b26f-4cf7-a072-cf39cfb37ab4" />

---

n0x puts an LLM, an autonomous agent, document Q&A, a Python runtime, image generation, and web search into one browser tab. No server. No account. No API keys. Open a tab, pick a model, start working.

The default path is **fully local** — your prompts, files, and model weights never leave your machine. WebGPU handles inference at 35–60 tok/s on a normal laptop GPU. But if you want more power, flip to Ollama or plug in a cloud API (Groq, OpenRouter, any OpenAI-compatible endpoint) and you're running the same tool stack against bigger models.

---

## Why this exists

Every AI tool I tried either wanted my data, wanted my money, or both. I wanted something I could open in a browser and just use — no Docker, no Python venv, no sign-up wall, no "you've hit your free tier limit."

So I built n0x. It's an actual workstation, not a chatbot wrapper.

---

## What you get

**Pick your backend.** Three providers, one interface:

| Provider | What runs | Setup |
|---|---|---|
| **Browser (WebGPU)** | 40+ open-source models, 360MB→70B, running on your GPU via WebLLM | Zero. Just pick a model. |
| **Ollama** | Any model from your local Ollama server | `ollama serve` — n0x auto-detects it |
| **Cloud API** | Groq, OpenRouter, or any OpenAI-compatible endpoint | Paste a key + base URL |

Switch between them mid-conversation. Your chat history stays.

---

**Agent mode.** A ReAct reasoning loop that actually works. The LLM chains tool calls autonomously — web search, document lookup, Python execution, memory recall — and you watch it think in real time, token by token. It handles malformed JSON output, recovers from loops, budgets its context window, and times out gracefully. The trace UI shows every step with timing and token cost.

**Document Q&A.** Drop a PDF, DOCX, TXT, CSV, or markdown file into the chat. n0x chunks it with sentence-boundary-aware splitting, embeds it with MiniLM-L6 (in a Web Worker, so the UI doesn't freeze), indexes it with Voy cosine search, and re-ranks results with MMR so you get relevant answers without duplicate noise. Vectors are cached in IndexedDB — upload once, query forever.

**Python runtime.** Pyodide runs in a WASM sandbox. Code output feeds back into the conversation. If execution fails, the error goes to the LLM automatically for a fix.

**Image generation.** Type "generate an image of..." and Pollinations (Flux, z-image-turbo, klein, and more) handles the rest. Works with a free API key or no key at all. Loading skeleton, retry on failure, zoom and download built in.

**Web search.** DuckDuckGo + Wikipedia synthesis. Plug in a Tavily key for deeper, citation-rich results.

**Memory.** The agent stores and recalls facts across sessions. Persistent in IndexedDB.

**Voice.** Speech-to-text and text-to-speech via the Web Speech API. Works offline.

**Branching.** Fork any message into an alternate conversation thread. Both branches persist in the sidebar.

**Personas.** Five system prompts — Default, Senior Engineer, Writer, Tutor, Analyst — each with their own tone, formatting rules, and domain focus.

---

## How it works

```
                              ┌─────────────────────┐
                              │    Provider Layer    │
                              │  WebGPU · Ollama ·   │
                              │  Cloud API (OpenAI)  │
                              └────────┬────────────┘
                                       │
┌──────────┐     ┌───────────┐    ┌────▼────┐
│  User     │────▶  Router    │───▶│  LLM    │
│  Input    │     │           │    │ Stream  │
└──────────┘     │  direct /  │    └────┬────┘
                 │  agent /   │         │
                 │  image     │    ┌────▼─────────────────────┐
                 └───────────┘    │  Agent (ReAct Loop)       │
                                  │  thought → action →       │
                                  │  observation → repeat     │
                                  │                           │
                                  │  Tools:                   │
                                  │   ├ Web Search (DDG/Tavily)│
                                  │   ├ RAG (Voy + MMR)       │
                                  │   ├ Python (Pyodide WASM) │
                                  │   ├ Memory (IndexedDB)    │
                                  │   └ Image Gen (Pollinations)│
                                  └───────────────────────────┘
```

Everything above the line runs in the browser. The only network calls are optional: search queries go through a CORS proxy, image prompts go to Pollinations. Disable both and you have a fully air-gapped AI workstation.

---

## Models

40+ models. MLC-compiled, quantized, cached in browser storage after first download. Real inference, not API calls.

| | Examples | Size | Speed |
|---|---|---|---|
| **Tiny** | SmolLM2 360M, Qwen 0.5B | 360MB–900MB | 60+ t/s |
| **Balanced** | Qwen 2.5 1.5B *(default)*, Phi-3.5, Llama 3.2 3B | 700MB–2.2GB | 35–50 t/s |
| **Heavy** | Mistral 7B, Qwen 2.5 7B, Llama 3.1 8B, Gemma 2 9B | 4–6GB | 15–25 t/s |
| **Flagship** | Qwen 2.5 32B, Llama 3.3 70B, R1 Llama 70B | 10–30GB | 8–15 t/s |
| **Code** | Qwen Coder 1.5B/7B/32B, DeepSeek Coder | 800MB–20GB | varies |

Start with Qwen 2.5 1.5B (~1GB). It loads in seconds on a warm cache and handles most tasks well. Scale up from there.

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
TAVILY_API_KEY=        # Better search results (server-side, never touches the client)
POLLINATIONS_API_KEY=  # Image gen without watermarks + higher rate limits
```

Both are optional. Everything works without them.

---

## Privacy

Your prompts, documents, and model weights stay in your browser. Period.

The only data that leaves your machine:
- **Search queries** — routed through a DuckDuckGo CORS proxy (if you use search)
- **Image prompts** — sent to Pollinations API (if you generate images)

Turn both off and nothing leaves your machine. Not metadata, not telemetry, nothing.

---

## Stack

Next.js 14 · TypeScript · WebLLM (WebGPU) · Transformers.js · Voy · Pyodide · Zustand · Tailwind · IndexedDB

---
<img width="1909" height="918" alt="image" src="https://github.com/user-attachments/assets/db3d0c98-f56b-4464-b8ab-fe0836fc2dfe" />
<img width="1920" height="1074" alt="image" src="https://github.com/user-attachments/assets/bb812ae6-2f06-4e7b-b93a-0715c52699de" />
<img width="1657" height="923" alt="Chat" src="https://github.com/user-attachments/assets/dad81977-dd49-4d48-84b4-fd655825e3c2" />
<img width="1920" height="913" alt="Agent trace" src="https://github.com/user-attachments/assets/2fb8a22e-e96b-4497-8bd2-3cb5ea88a758" />
<img width="1920" height="913" alt="Model picker" src="https://github.com/user-attachments/assets/99f66f62-b9d6-4374-92e4-3920ba60aaf4" />

---

MIT · [ixchio](https://github.com/ixchio)
