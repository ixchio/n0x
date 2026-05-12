# N0X — Project Knowledge

## What is this?
In-browser AI workstation. Runs LLMs, autonomous agents, RAG, Python sandbox, image generation — all client-side via WebGPU/WASM. Next.js 14 + TypeScript + Tailwind.

## Architecture
- **State**: Zustand stores (`useWebLLM`, `useAgent`, `useRAG`, `useTTS`, `useSTT`, `useCloudAI`, `useOllama`, `useChromeAI`) + custom React hooks (`useChatStore`, `useChat`, `useMemory`, `useSystemPrompt`, `useDeepSearch`, `usePyodide`)
- **LLM Runtime**: `@mlc-ai/web-llm` (WebGPU via Web Worker), Chrome Built-in AI (Gemini Nano), Ollama (local server), Cloud API (OpenAI-compatible)
- **RAG**: Web Worker (`rag.worker.ts`) with Transformers.js embeddings + **Hybrid Search** (Voy vector + BM25 keyword → RRF fusion → MMR reranking)
- **Storage**: IndexedDB for conversations, memories, and vector cache. localStorage for preferences + token counter. sessionStorage for API keys.
- **API Routes**: `/api/deep-search` (SearXNG + DDG + Wikipedia + Tavily + Jina), `/api/image-gen` (Pollinations + AI Horde)

## Provider System
4 providers, auto-detected:
1. **Browser (WebGPU)** — default, uses `WebWorkerMLCEngine` for 60fps UI during inference
2. **Chrome AI** — Gemini Nano via Prompt API, zero download, detected via `LanguageModel.availability()`
3. **Ollama** — local server at configurable URL
4. **Cloud API** — any OpenAI-compatible endpoint (Groq, OpenRouter, etc.)

## Key Commands
```bash
npm run dev      # Dev server on port 3000
npm run build    # Production build
npm run start    # Start production server
```

## Critical Notes
- `useChatStore` is a **React hook** (NOT Zustand) — state is shared via prop drilling from `useChat`
- `useChat` is the main orchestrator — routes between image gen, agent mode, and direct LLM mode
- COEP header must be `credentialless` (NOT `require-corp`) to allow cross-origin resources
- The chat page bundle is ~2.47MB due to WebLLM + Transformers.js — heavy but unavoidable for browser AI
- Cloud API keys are stored in sessionStorage (not localStorage) for security
- `contextCharsLimit` is exported from `useWebLLM` as a module variable for cross-hook access
- Token counter persisted in localStorage (`n0x_total_tokens`) — used by sidebar cost savings display
- RAG uses BM25 + Vector hybrid search with RRF fusion — never revert to vector-only
- Artifacts (full HTML documents) auto-preview in code blocks with purple badge

## Key Features
- **Web Worker inference**: WebLLM runs in Web Worker, falls back to main thread if Worker unavailable
- **Hybrid RAG search**: BM25 keyword + Voy vector → Reciprocal Rank Fusion → MMR diversity reranking
- **Cost savings counter**: Tracks cumulative tokens, shows $ saved vs cloud in sidebar
- **Artifacts**: Full HTML code blocks auto-render as live previews with sandboxed iframe
- **Onboarding**: First-time overlay for Product Hunt visitors, stored in localStorage
- **Chrome AI**: Zero-download provider using Chrome's built-in Gemini Nano

## Known Limitations
- WebGPU required for local inference (Chrome 113+, Edge 113+)
- Chrome AI (Gemini Nano) requires Chrome 138+ with flags enabled
- PWA service worker only registered in production
- SearXNG instances in deep-search are hardcoded and may go down
- No conversation search across all conversations yet
