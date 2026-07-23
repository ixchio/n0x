# Security Policy

## Supported versions

| Version        | Supported |
| -------------- | --------- |
| latest (main)  | ✅        |
| older releases | ❌        |

Only the current `main` branch receives security fixes.

## Threat model

n0x is local by default, with explicit search, image, and cloud paths plus first-use runtime downloads. Its security boundary includes browser storage, generated content, client-side runtimes, configured providers, and the optional server routes.

**In scope:**

- XSS via user-supplied content rendered in chat or code blocks
- Abuse of the Pyodide execution environment or its browser-accessible capabilities
- Exposure of API keys stored in `sessionStorage`
- Server-side vulnerabilities in API routes (`/api/deep-search`, `/api/image-gen`, `/api/analytics`)
- Content injection via malicious documents uploaded to RAG

**Out of scope:**

- Attacks requiring physical access to the user's machine
- Vulnerabilities in upstream dependencies (WebLLM, Pyodide, Transformers.js) — report those upstream
- "The model said something bad" — this is a content moderation issue, not a security vulnerability

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Open a [private security advisory](https://github.com/ixchio/n0x/security/advisories/new) on GitHub.

Include:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional but appreciated)

If the issue is confirmed, maintainers will coordinate a fix and credit you in the release notes unless you prefer to stay anonymous.

## Known security properties

- **API keys** — Cloud API keys are stored in `sessionStorage`, not `localStorage` or IndexedDB. They remain readable to same-origin JavaScript during the tab session, and exact retention on crash/session restore depends on the browser.
- **IndexedDB** — Conversations and RAG cache data are stored under the app origin. Semantic memories are saved and retrieved only while Memory is enabled; disabling it does not erase existing entries.
- **Model cache** — WebLLM weights use browser-managed caches. N0X app-shell updates preserve separately named model caches, but browser eviction, site-data clearing, or the Storage Manager's Model Weights action removes them.
- **Artifacts** — Full HTML code blocks are rendered in sandboxed iframes without same-origin access
- **Pyodide** — Python runs in WebAssembly inside the browser tab, not in a hardened security sandbox. Untrusted code can consume tab resources and may use browser-permitted network APIs.
- **API routes and analytics** — `/api/deep-search`, `/api/image-gen`, opt-in `/api/analytics`, and opt-in Vercel Web Analytics are network surfaces. API-route rate limits are best-effort and reset independently across serverless instances. Analytics excludes prompts, responses, documents, file names, API keys, and memory content; page views retain only the path and explicit ref/UTM attribution.
- **RAG content** — Sanitized before indexing to strip null bytes and control characters
- **CSP** — `next.config.mjs` sends a Content Security Policy with restrictive defaults and framing/object protections. Required WASM and runtime support still permits inline/eval script modes and broad configured connection targets, so CSP is defense in depth rather than an isolation guarantee.
- **Network providers** — Deep Search queries, image prompts, remote Ollama requests, and Cloud API prompts go to the selected service. Model, embedding, and Pyodide assets download from external hosts. Browser speech recognition may use an online browser or OS service.
