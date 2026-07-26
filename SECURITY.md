# Security Policy

## Supported versions

| Version        | Supported |
| -------------- | --------- |
| latest (main)  | ✅        |
| older releases | ❌        |

Only the current `main` branch receives security fixes.

## Threat model

n0x is a local-first document Q&A workbench with filename/chunk citations, explicit search, image, and cloud paths, and first-use runtime downloads. Its security boundary includes browser storage, generated content, client-side runtimes, configured providers, and optional server routes. A citation points to retrieved text; it is not proof that the model interpreted that text correctly.

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
- **IndexedDB** — Conversations, exact cited-evidence snapshots, and RAG chunk/vector cache data are stored under the app origin. Evidence snapshots remain in Chat History after an attachment/vector-cache clear so old answers stay inspectable; clearing Chat History erases them. Semantic memories are saved and retrieved only while Memory is enabled; disabling it does not erase existing entries. Storage failures are surfaced in the UI, but same-origin script or browser-profile compromise remains in the trust boundary.
- **Model cache** — WebLLM weights use browser-managed caches. N0X app-shell updates preserve separately named model caches, but browser eviction, site-data clearing, or the Storage Manager's Model Weights action removes them.
- **Artifacts** — Full HTML code blocks are rendered in opaque-origin sandboxed iframes. An embedded CSP uses `connect-src 'none'` and blocks ordinary subresource, form, nested-frame, object, and non-data media paths; the preview has no same-origin access to N0X. This is not a zero-network guarantee: sandboxed content can still attempt to navigate its own frame, and JavaScript can consume resources or render deceptive content.
- **Generated Markdown** — Remote Markdown images are replaced with an `External image blocked` control. They load only after a per-image **Load once** action, with a credential-free cross-origin request and no referrer; the remote host still observes the network request. External links open only after a user click with `noopener noreferrer`.
- **Pyodide** — Python runs in WebAssembly inside a dedicated, terminable Web Worker. App storage globals and alternate egress transports are shadowed; Pyodide's `js`/`pyodide_js` modules are unregistered and `run_js` is disabled. The remaining fetch/import path accepts only credential-free `GET` requests under the pinned Pyodide 0.26.4 asset prefix. Imports are limited to packages shipped there, not arbitrary PyPI URLs. Stop, abort, and timeout paths terminate the worker; every autonomous agent Python call displays its full code for per-call approval, while manual execution requires an explicit Run action. Pyodide is not a hardened sandbox for hostile code: implementation bugs, reflective runtime escapes, and CPU or memory exhaustion remain in the trust boundary.
- **API routes and analytics** — `/api/deep-search`, `/api/image-gen`, opt-in `/api/analytics`, and opt-in Vercel Web Analytics are network surfaces. API routes reject browser requests whose Origin or Fetch Metadata reports a cross-origin/cross-site caller, and use best-effort rate limits that reset independently across serverless instances; these checks are not user authentication. Analytics is disabled until the user opts in and excludes prompts, responses, documents, file names, API keys, and memory content. The page-view URL is reduced to its path and explicit ref/UTM attribution, but analytics/deployment services can still observe ordinary request and service metadata under their own policies.
- **RAG content** — File text is sanitized before indexing. A local SHA-256 digest of the file bytes identifies cache records and deduplicates identical content without relying on names or timestamps. Vector deletion and clear operations commit in IndexedDB before the UI removes attachments; worker timeouts terminate the worker so it cannot continue mutating the cache in the background.
- **CSP** — `next.config.mjs` sends a Content Security Policy with restrictive defaults and framing/object protections. Required WASM and runtime support still permits inline/eval script modes and broad configured connection targets, so CSP is defense in depth rather than an isolation guarantee.
- **Network providers** — Deep Search queries and image prompts use N0X server routes before third-party providers. Every autonomous agent search shows its exact model-authored query for fresh approval before egress. Remote Ollama and Cloud API prompts go from the browser to the configured endpoint with any document, memory, or search context enabled for that request. Auto-routing can select the configured cloud provider. Model, embedding, and pinned Pyodide assets may download from external hosts; the workbench only probes Chrome's Prompt API, and Gemini Nano setup begins after an explicit Chrome AI install/selection action. Browser speech may use an online browser or OS service.
