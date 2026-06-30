# Security Policy

## Supported versions

| Version        | Supported |
| -------------- | --------- |
| latest (main)  | ✅        |
| older releases | ❌        |

Only the current `main` branch receives security fixes.

## Threat model

n0x runs almost entirely in the browser. Understanding what's in scope:

**In scope:**

- XSS via user-supplied content rendered in chat or code blocks
- Sandbox escape in the Pyodide execution environment
- Exposure of API keys stored in `sessionStorage`
- Server-side vulnerabilities in API routes (`/api/deep-search`, `/api/image-gen`, `/api/analytics`)
- Content injection via malicious documents uploaded to RAG

**Out of scope:**

- Attacks requiring physical access to the user's machine
- Vulnerabilities in upstream dependencies (WebLLM, Pyodide, Transformers.js) — report those upstream
- "The model said something bad" — this is a content moderation issue, not a security vulnerability

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Email: open a [private security advisory](https://github.com/ixchio/n0x/security/advisories/new) via GitHub.

Include:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional but appreciated)

You'll get a response within 72 hours. If the issue is confirmed, a fix will be shipped and you'll be credited in the release notes (unless you prefer to stay anonymous).

## Known security properties

- **API keys** — Cloud API keys are stored in `sessionStorage` only (cleared on tab close, never persisted to disk)
- **Artifacts** — Full HTML code blocks rendered in sandboxed iframes with `sandbox="allow-scripts"` only
- **RAG content** — Sanitized before indexing to strip null bytes and control characters
- **CSP** — See `next.config.mjs` for the Content Security Policy headers
- **Rate limiting** — API routes have server-side rate limiting (see `lib/server/rate-limit.ts`)
