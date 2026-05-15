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

## UI Audit Findings (2026-05-11)
### Fixed
- **Welcome screen**: No longer auto-loads model; shows model picker OR provider switch buttons (when WebGPU unavailable). Suggestion chips (image gen, web search, agent, upload docs) always visible.
- **Red WebGPU error banner**: Removed. Integrated graceful messaging into welcome screen.
- **Mobile sidebar**: Added `onClose` prop; backdrop tap closes sidebar.
- **Silent send failure**: `useChat.ts` `handleSend` now shows error for uninitialized providers.
- **Message re-render loop**: `autoPreviewDone` state → `autoPreviewRef` (useRef) in message-bubble.
- **PWA icons**: Were JPEG files saved as `.png` with wrong dimensions. Now real PNGs at 192×192 and 512×512. Added `apple-touch-icon.png` (180×180).
- **Provider persistence**: `localStorage.getItem("n0x-provider")` — survives page refresh.
- **Provider-aware UI**: TPS counter, MetricsOverlay, ShareMenu all read from active provider (was hardcoded to WebLLM).
- **Toolbar visibility**: Controls stay visible during Ollama/Cloud use (was hidden when WebLLM loading).
- **Landing page accuracy**: Footer says "Ollama & Cloud API also supported". Deep Search subtitle says "DDG + SearXNG + Wikipedia".
- **SEO**: Added `robots.txt`, `icons` metadata in layout, apple-touch-icon.

### Fixed (2026-05-14)
- **Model loading stuck at 0%**: Worker URL was `new URL("@mlc-ai/web-llm", import.meta.url)` which pointed to the package entry (index.js), NOT a proper worker handler. Worker loaded but never set up `WebWorkerMLCEngineHandler`, so `CreateWebWorkerMLCEngine` hung forever. Created `lib/webllm.worker.ts` with proper handler setup. Added 5s timeout race for fallback to main-thread engine.
- **Cloud API**: Was completely broken — no model selector, no model fetching, hardcoded model lists, state sync bug.
  - Added `fetchModels()` to auto-fetch from provider's `/models` endpoint
  - Added model selector dropdown in provider config panel
  - Added model selector in header dropdown (was only showing WebGPU models)
  - Fixed state sync: `cloudApiKey`/`cloudBaseUrl` local state now initializes from Zustand store (sessionStorage)
  - Added `cloudAI.init()` call when cloud provider is selected
  - Selected model now persisted in sessionStorage alongside credentials
  - Auto-fetch models with debounce when credentials change
- **Context window**: Was hardcoded to 3500 tokens for ALL providers, crippling RAG/memory for Cloud API (128k models).
  - Cloud: 30k tokens, Ollama: 12k tokens, WebGPU/Chrome AI: 3500 tokens
- **Agent context budget**: Was tied to WebGPU model's context window via `contextCharsLimit`.
  - Added `contextBudget` param to `runLoop()` — Cloud gets 120k chars, Ollama gets 48k chars
- **Token counter**: Cloud API and Ollama tokens weren't tracked. Exported `addTokens()` from useWebLLM.
- **Welcome screen**: Was showing "Cloud API configured" even without API key set.
- **Header model label**: Was showing "Ollama" / "Cloud API" instead of actual model name.

### Fixed (2026-05-14 — Bug Sweep)
Full codebase audit. 9 bugs found and fixed across 4 files:

**Stale closure bugs (Critical)**:
- `buildMessages` useCallback missing `providerCtx?.provider` in deps — context window stayed at 3500 (WebGPU value) even after switching to Cloud API.
- `handleStop` useCallback missing `providerCtx` in deps — called wrong provider's stop() after switching providers.

**Error handling**:
- `handleSend` catch was showing generic 'failed to generate' — now shows actual error (wrong API key, unreachable endpoint, 401/403).
- `setStreamingContent("")` missing in error path — stale partial text remained visible.

**RAG file removal**:
- `onRemoveFile` called `rag.clear()` wiping ALL docs when removing one file. Added `removeFile(id)` to useRAG.

**Provider persistence**:
- Ollama URL reset on reload. Now persisted in localStorage.

**Chrome AI**:
- `addTokens()` never called — tokens not tracked in cost savings. Fixed.
- Welcome message always said 'ready' regardless of status. Now status-aware.

**Conversation management**:
- Switching conversations during generation → response lands in wrong conversation. Now stops generation first.

### Fixed (2026-05-14 — Session 3: Daily-Driver UX)
6 more bugs + GPU-aware UX overhaul:

**Critical bugs fixed:**
- Duplicate messages on Stop: handleSend catch was adding error message for AbortError even though handleStop already saved partial → skipped now
- WebGPU loading screen showed for Chrome AI: missing `provider === 'browser'` check
- Chrome AI garbled output (no spaces between words): Prompt API changed from cumulative to delta chunks in newer Chrome. Auto-detection now handles both.
- RAG Worker crash `e.replace is not a function`: PDF text extraction could produce non-string/control chars. Added `sanitizeText()` throughout pipeline.
- Deep search overwhelming small models: 3600+ chars into 3500-token window. Now caps per-source (500 chars for small, 1200 for large).
- Chrome AI context budget: Reduced from 3500 to 2000 tokens (Gemini Nano has ~4k total).

**GPU-aware UX:**
- `init()` now probes WebGPU adapter for VRAM via maxBufferSize + deviceMemory → gpuTier (none/low/medium/high)
- Low-VRAM: amber warning + Cloud API suggestion, recommended model auto-caps at SmolLM2 360M
- Model load stall watchdog: detects 30s no progress, shows recovery buttons
- Human-readable error messages (OOM, timeout, network translated to plain English)
- Error screen: 3 recovery options (smaller model / Cloud API / force load)
- Cloud API fast path: 'Get free key (Groq)' link, full setup guide on welcome screen

## Common Bug Patterns
- **Stale closures in useCallback**: ALL reactive values used in body must be in deps. Watch `providerCtx`.
- **State sync React ↔ Zustand**: Initialize React local state FROM Zustand, not independently.
- **Provider-aware behavior**: Code branching on `providerCtx?.provider` needs it in deps.

### Not Fixed (needs design/manual work)
- **OG image**: No `og:image` exists. Critical for Product Hunt social shares. Needs a designed 1200×630 image.
- **Year in footer**: Auto-generates from `new Date().getFullYear()` — currently shows 2026 (correct).

## Known Limitations
- WebGPU required for local inference (Chrome 113+, Edge 113+)
- Chrome AI (Gemini Nano) requires Chrome 138+ with flags enabled
- PWA service worker only registered in production
- SearXNG instances in deep-search are hardcoded and may go down
- No conversation search across all conversations yet
- No OG image for social sharing (needs design)
