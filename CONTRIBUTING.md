# Contributing to n0x

Thanks for taking the time. Any contribution — bug fix, feature, docs improvement — is welcome.

## Before you start

- **Bug fix or small change?** Just open a PR. No need to file an issue first.
- **New feature or architectural change?** Open an issue first so we can discuss the approach before you build it.
- **Question?** Use [GitHub Discussions](https://github.com/ixchio/n0x/discussions).

## Setup

```bash
git clone https://github.com/ixchio/n0x.git
cd n0x
npm install
npm run dev
```

Requires Node 18+ and Chrome/Edge 113+ with WebGPU enabled.

## Development workflow

```bash
npm run dev          # dev server on :3000
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run format       # Prettier write
npm run format:check # Prettier check (what CI runs)
npm run build        # production build
```

**Before submitting a PR, run:**

```bash
npm run lint && npm run typecheck && npm run format:check
```

CI runs all three — a failing check blocks merge.

## Branch naming

```
feat/short-description    # new feature
fix/short-description     # bug fix
docs/short-description    # documentation only
refactor/short-description
```

## Commit style

Plain English. Tell me what changed and why, not what the diff shows.

```
# Good
fix: stop agent loop when same tool called 3x with identical args
feat: add BM25 fallback when vector index is empty
docs: clarify WebGPU requirement in README

# Bad
fix: update useAgent.ts
feat: implement feature
chore: changes
```

## Pull request checklist

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run format:check` passes
- [ ] Tested in Chrome/Edge with WebGPU
- [ ] No `console.log` left in production paths
- [ ] PR description explains _why_, not just _what_

## Project structure

```
app/              Next.js app router pages + API routes
components/       React components
lib/              Hooks, stores, workers (useChat, useAgent, useRAG, etc.)
public/           Static assets
docs/             Project documentation
```

Key files to know:

- `lib/useChat.ts` — main orchestrator (routes between image/agent/direct)
- `lib/useAgent.ts` — ReAct agent loop
- `lib/rag.worker.ts` — RAG pipeline (runs in Web Worker)
- `app/api/deep-search/route.ts` — multi-engine search API route

## Architecture notes

- `useChatStore` is a **React hook**, not Zustand — state is shared via prop drilling from `useChat`
- Never read `localStorage`/`sessionStorage` in `useState` initializers — causes hydration mismatch. Use SSR-safe defaults + `useEffect`
- Always sanitize text from IndexedDB cache (old entries may be non-string)
- All `useCallback` hooks must include every reactive value used in their body in the deps array — stale closures are a common bug here

## Reporting bugs

[Open an issue](https://github.com/ixchio/n0x/issues) and include:

- What you did
- What you expected
- What actually happened
- Browser console errors (F12 → Console)
- Browser version + OS

## License

By contributing, you agree your code will be released under the project's [MIT License](LICENSE).
