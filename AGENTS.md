# N0X — Project Knowledge

## What is this?
In-browser AI workstation. Runs LLMs, autonomous agents, RAG, Python sandbox, image generation — all client-side via WebGPU/WASM. Next.js 14 + TypeScript + Tailwind.

## Architecture
- **State**: Zustand stores (`useWebLLM`, `useAgent`, `useRAG`, `useTTS`, `useSTT`, `useCloudAI`, `useOllama`) + custom React hooks (`useChatStore`, `useChat`, `useMemory`, `useSystemPrompt`, `useDeepSearch`, `usePyodide`)
- **LLM Runtime**: `@mlc-ai/web-llm` (WebGPU), Ollama (local server), Cloud API (OpenAI-compatible)
- **RAG**: Web Worker (`rag.worker.ts`) with Transformers.js embeddings + Voy vector search + MMR reranking
- **Storage**: IndexedDB for conversations, memories, and vector cache. localStorage for preferences.
- **API Routes**: `/api/deep-search` (SearXNG + DDG + Wikipedia + Tavily + Jina), `/api/image-gen` (Pollinations + AI Horde)

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
- The chat page bundle is ~2.46MB due to WebLLM + Transformers.js — heavy but unavoidable for browser AI
- Cloud API keys are stored in sessionStorage (not localStorage) for security
- `contextCharsLimit` is exported from `useWebLLM` as a module variable for cross-hook access

## Known Limitations
- WebGPU required for local inference (Chrome 113+, Edge 113+)
- PWA service worker only registered in production
- SearXNG instances in deep-search are hardcoded and may go down
- No conversation search across all conversations yet
